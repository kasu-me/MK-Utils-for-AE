// PSD / PSB を解析して、レイヤーごとの縮小画像を作る (ツリーのサムネイル表示用)
// 対応: RGB / グレースケール、8 / 16bit、RAW / RLE / ZIP 圧縮
// 描画モード・レイヤーマスク・レイヤー効果は無視し、レイヤーのピクセルをそのまま縮小する
var PsdThumb = (function () {
	var STORE_MAX = 160; // 縮小画像の長辺 (px)
	// PSB で長さが 8 バイトになる追加レイヤー情報のキー
	var LONG_KEYS = { LMsk: 1, Lr16: 1, Lr32: 1, Layr: 1, Mt16: 1, Mt32: 1, Mtrn: 1, Alph: 1, FMsk: 1, lnk2: 1, FEid: 1, FXid: 1, PxSD: 1 };
	var cache = {}; // path -> { stamp, promise }

	function readFileBytes(path) {
		var res = window.cep.fs.readFile(path, window.cep.encoding.Base64);
		if (res.err !== 0) throw new Error('ファイルを読み込めません (エラー ' + res.err + ')');
		var bin = atob(res.data);
		var bytes = new Uint8Array(bin.length);
		for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		return bytes;
	}

	function decodePascal(raw) {
		try {
			return new TextDecoder('shift_jis').decode(raw);
		} catch (e) {
			return String.fromCharCode.apply(null, raw);
		}
	}

	// ヘッダーとレイヤーレコードを読み、レイヤーツリーとチャンネルデータの位置を返す (画素はまだ展開しない)
	function parseStructure(bytes) {
		var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		var p = 0;
		var psb = false;
		var u8 = function () { return bytes[p++]; };
		var u16 = function () { var v = view.getUint16(p); p += 2; return v; };
		var i16 = function () { var v = view.getInt16(p); p += 2; return v; };
		var u32 = function () { var v = view.getUint32(p); p += 4; return v; };
		var i32 = function () { var v = view.getInt32(p); p += 4; return v; };
		var u64 = function () { var hi = u32(); return hi * 4294967296 + u32(); };
		var len = function () { return psb ? u64() : u32(); };
		var skip = function (n) { p += n; };
		var str4 = function (at) {
			return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
		};
		// 追加情報ブロックの長さが 2 / 4 バイト境界に丸められている場合に備えて、次のシグネチャまで進める
		var seekSig = function (end) {
			for (var k = 0; k < 4; k++) {
				if (p + k + 12 > end) return false;
				var s = str4(p + k);
				if (s === '8BIM' || s === '8B64') { p += k; return true; }
			}
			return false;
		};

		var parseLayerInfo = function () {
			var count = Math.abs(i16());
			var records = [];
			for (var i = 0; i < count; i++) {
				var rec = { top: i32(), left: i32(), bottom: i32(), right: i32(), channels: [], name: '', section: 0 };
				var nch = u16();
				for (var c = 0; c < nch; c++) rec.channels.push({ id: i16(), length: len() });
				skip(8); // '8BIM' + 描画モード
				rec.opacity = u8();
				rec.clipping = u8() === 1;
				skip(2); // フラグ + filler
				var extraEnd = u32();
				extraEnd += p;
				var maskEnd = u32();
				maskEnd += p;
				if (maskEnd - p >= 20) {
					rec.mask = { top: i32(), left: i32(), bottom: i32(), right: i32(), color: u8(), flags: u8() };
					// ベクトルマスクと併用しているときは、ピクセルのマスク (チャンネル -3) の情報が後ろに続く
					if (maskEnd - p >= 18) {
						if (rec.mask.flags & 0x10) {
							var params = u8();
							if (params & 1) skip(1);
							if (params & 2) skip(8);
							if (params & 4) skip(1);
							if (params & 8) skip(8);
						}
						if (maskEnd - p >= 18) {
							var realFlags = u8();
							var realColor = u8();
							rec.realMask = { top: i32(), left: i32(), bottom: i32(), right: i32(), color: realColor, flags: realFlags };
						}
					}
				}
				p = maskEnd;
				skip(u32()); // レイヤー描画範囲
				var nameStart = p;
				var nameLen = u8();
				rec.name = decodePascal(bytes.subarray(p, p + nameLen));
				p = nameStart + ((nameLen + 4) & ~3);
				while (seekSig(extraEnd)) {
					var key = str4(p + 4);
					skip(8);
					var keyLen = (psb && LONG_KEYS[key]) ? u64() : u32();
					var keyEnd = p + keyLen;
					if (key === 'luni') {
						var n = u32();
						var s = '';
						for (var j = 0; j < n; j++) s += String.fromCharCode(u16());
						rec.name = s.replace(/\u0000+$/, '');
					} else if (key === 'lsct' || key === 'lsdk') {
						rec.section = u32();
					}
					p = keyEnd;
				}
				p = extraEnd;
				records.push(rec);
			}
			records.forEach(function (rec) {
				rec.channels.forEach(function (ch) {
					ch.offset = p;
					p += ch.length;
				});
			});
			return records;
		};

		if (bytes.length < 26 || str4(0) !== '8BPS') throw new Error('PSDファイルではありません');
		p = 4;
		var version = u16();
		if (version !== 1 && version !== 2) throw new Error('未対応のPSDバージョンです');
		psb = version === 2;
		skip(8); // reserved + チャンネル数
		var height = u32();
		var width = u32();
		var depth = u16();
		var mode = u16();
		if (mode !== 1 && mode !== 3) throw new Error('RGB / グレースケール以外のカラーモードには未対応です');
		if (depth !== 8 && depth !== 16) throw new Error(depth + 'bit には未対応です');
		skip(u32()); // カラーモードデータ
		skip(u32()); // 画像リソース

		var records = [];
		var lmiLen = len();
		var lmiEnd = p + lmiLen;
		if (lmiLen > 0) {
			var liLen = len();
			if (liLen > 0) {
				records = parseLayerInfo();
			} else {
				// 16bit のドキュメントはレイヤー情報が追加情報 'Lr16' に入っている
				skip(u32()); // グローバルレイヤーマスク
				while (seekSig(lmiEnd)) {
					var key = str4(p + 4);
					skip(8);
					var keyLen = (psb && LONG_KEYS[key]) ? u64() : u32();
					var keyEnd = p + keyLen;
					if (key === 'Lr16' || key === 'Lr32' || key === 'Layr') {
						// 中身はふつう長さなしのレイヤー情報だが、長さ付きで書く実装もあるので見分ける
						if (keyLen >= 4 && view.getUint32(p) === keyLen - 4) skip(4);
						records = parseLayerInfo();
						break;
					}
					p = keyEnd;
				}
			}
		}

		// レコードは下から順に並び、グループは「終端(3) → 中身 → 見出し(1/2)」の順
		var root = { group: true, children: [] };
		var stack = [root];
		records.forEach(function (rec) {
			var cur = stack[stack.length - 1];
			if (rec.section === 3) {
				var g = { group: true, children: [] };
				cur.children.push(g);
				stack.push(g);
			} else if (rec.section === 1 || rec.section === 2) {
				if (stack.length > 1) stack.pop().name = rec.name;
			} else {
				cur.children.push({
					name: rec.name,
					rec: rec,
					left: rec.left,
					top: rec.top,
					width: rec.right - rec.left,
					height: rec.bottom - rec.top,
					opacity: rec.opacity,
					clipping: rec.clipping,
					canvas: null
				});
			}
		});

		// 上から順に並べ替え、グループ名のパスで引ける索引を作る
		var index = {};
		var leaves = [];
		var walk = function (node, path) {
			node.children.reverse();
			node.children.forEach(function (child) {
				var childPath = path.concat([child.name]);
				if (child.group) {
					walk(child, childPath);
				} else {
					var key = childPath.join('\u0000');
					(index[key] = index[key] || []).push(child);
					leaves.push(child);
				}
			});
		};
		walk(root, []);

		return { psb: psb, width: width, height: height, depth: depth, mode: mode, index: index, leaves: leaves, warning: '' };
	}

	function unpackBits(src, sp, send, dst, dp, dlen) {
		var dend = dp + dlen;
		while (dp < dend && sp < send) {
			var n = src[sp++];
			if (n < 128) {
				n = Math.min(n + 1, dend - dp);
				dst.set(src.subarray(sp, sp + n), dp);
				sp += n;
				dp += n;
			} else if (n > 128) {
				n = Math.min(257 - n, dend - dp);
				dst.fill(src[sp++], dp, dp + n);
				dp += n;
			}
		}
	}

	function inflate(data) {
		if (typeof DecompressionStream === 'undefined') {
			return Promise.reject(new Error('この環境ではZIP圧縮のレイヤーを読み込めません'));
		}
		var stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'));
		return new Response(stream).arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
	}

	// ZIP (予測付き) の差分を元に戻す
	function unpredict(raw, w, h, depth) {
		for (var y = 0; y < h; y++) {
			if (depth === 8) {
				var base = y * w;
				for (var x = 1; x < w; x++) raw[base + x] += raw[base + x - 1];
			} else {
				var b = y * w * 2;
				var prev = (raw[b] << 8) | raw[b + 1];
				for (var x2 = 1; x2 < w; x2++) {
					var i = b + x2 * 2;
					prev = (((raw[i] << 8) | raw[i + 1]) + prev) & 0xFFFF;
					raw[i] = prev >> 8;
					raw[i + 1] = prev & 0xFF;
				}
			}
		}
	}

	function to8bit(raw, n, depth) {
		if (depth === 8) return raw;
		var out = new Uint8Array(n);
		for (var i = 0; i < n; i++) out[i] = raw[i * 2];
		return out;
	}

	// 1 チャンネル分を 8bit の平面に展開する (ZIP のときは Promise を返す)
	function decodeChannel(bytes, psd, ch, w, h) {
		var p = ch.offset + 2;
		var comp = (bytes[ch.offset] << 8) | bytes[ch.offset + 1];
		var rowLen = w * psd.depth / 8;
		if (comp === 0) return to8bit(bytes.subarray(p, p + rowLen * h), w * h, psd.depth);
		if (comp === 1) {
			var raw = new Uint8Array(rowLen * h);
			var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
			var countSize = psd.psb ? 4 : 2;
			var sp = p + h * countSize;
			for (var y = 0; y < h; y++) {
				var cnt = psd.psb ? view.getUint32(p + y * 4) : view.getUint16(p + y * 2);
				unpackBits(bytes, sp, sp + cnt, raw, y * rowLen, rowLen);
				sp += cnt;
			}
			return to8bit(raw, w * h, psd.depth);
		}
		if (comp === 2 || comp === 3) {
			return inflate(bytes.subarray(p, ch.offset + ch.length)).then(function (raw) {
				if (comp === 3) unpredict(raw, w, h, psd.depth);
				return to8bit(raw, w * h, psd.depth);
			});
		}
		throw new Error('未対応の圧縮形式です (' + comp + ')');
	}

	// マスクの範囲外は既定色 (0 か 255) として、アルファに掛ける
	function applyMask(d, w, h, leaf, mask, plane) {
		var mw = mask.right - mask.left;
		var mh = mask.bottom - mask.top;
		for (var y = 0; y < h; y++) {
			var my = leaf.top + y - mask.top;
			for (var x = 0; x < w; x++) {
				var mx = leaf.left + x - mask.left;
				var v = (plane && mx >= 0 && mx < mw && my >= 0 && my < mh) ? plane[my * mw + mx] : mask.color;
				if (v === 255) continue;
				var ai = (y * w + x) * 4 + 3;
				d[ai] = d[ai] * v / 255;
			}
		}
	}

	function decodeLeaf(bytes, psd, leaf) {
		var w = leaf.width;
		var h = leaf.height;
		if (w <= 0 || h <= 0) return null;
		var wanted = psd.mode === 3 ? [0, 1, 2, -1] : [0, -1];
		// レイヤーマスク (-2) と、ベクトルマスク併用時のピクセルマスク (-3)。無効化されたマスクは使わない
		var masks = {};
		if (leaf.rec.mask && !(leaf.rec.mask.flags & 2)) masks[-2] = leaf.rec.mask;
		if (leaf.rec.realMask && !(leaf.rec.realMask.flags & 2)) masks[-3] = leaf.rec.realMask;
		var jobs = leaf.rec.channels.filter(function (ch) {
			return wanted.indexOf(ch.id) >= 0 || masks[ch.id];
		}).map(function (ch) {
			var m = masks[ch.id];
			var cw = m ? m.right - m.left : w;
			var chh = m ? m.bottom - m.top : h;
			if (cw <= 0 || chh <= 0) return { id: ch.id, plane: null };
			return Promise.resolve(decodeChannel(bytes, psd, ch, cw, chh)).then(function (plane) {
				return { id: ch.id, plane: plane };
			});
		});
		return Promise.all(jobs).then(function (results) {
			var planes = {};
			results.forEach(function (r) { planes[r.id] = r.plane; });
			var r = planes[0];
			var g = psd.mode === 3 ? planes[1] : r;
			var b = psd.mode === 3 ? planes[2] : r;
			var a = planes[-1];
			if (!r || !g || !b) return null;

			var img = new ImageData(w, h);
			var d = img.data;
			for (var i = 0, n = w * h; i < n; i++) {
				d[i * 4] = r[i];
				d[i * 4 + 1] = g[i];
				d[i * 4 + 2] = b[i];
				d[i * 4 + 3] = a ? a[i] : 255;
			}
			[-2, -3].forEach(function (id) {
				if (masks[id]) applyMask(d, w, h, leaf, masks[id], planes[id]);
			});
			var full = document.createElement('canvas');
			full.width = w;
			full.height = h;
			full.getContext('2d').putImageData(img, 0, 0);

			var s = Math.min(1, STORE_MAX / Math.max(w, h));
			if (s === 1) return full;
			var out = document.createElement('canvas');
			out.width = Math.max(1, Math.round(w * s));
			out.height = Math.max(1, Math.round(h * s));
			var ctx = out.getContext('2d');
			ctx.imageSmoothingQuality = 'high';
			ctx.drawImage(full, 0, 0, out.width, out.height);
			return out;
		});
	}

	// レイヤーを順に展開する。UI が固まらないよう、一定時間ごとに処理を譲る
	function decodeAll(bytes, psd, done) {
		var i = 0;
		var sliceStart = Date.now();
		var next = function () {
			if (i >= psd.leaves.length) {
				done();
				return;
			}
			if (Date.now() - sliceStart > 30) {
				setTimeout(function () {
					sliceStart = Date.now();
					next();
				}, 0);
				return;
			}
			var leaf = psd.leaves[i++];
			var job;
			try {
				job = Promise.resolve(decodeLeaf(bytes, psd, leaf));
			} catch (e) {
				job = Promise.reject(e);
			}
			job.then(function (canvas) {
				leaf.canvas = canvas;
			}, function (e) {
				if (!psd.warning) psd.warning = '一部のレイヤーを読み込めません (' + e.message + ')';
			}).then(function () {
				delete leaf.rec;
				next();
			});
		};
		next();
	}

	// path の PSD を読み込む。同じファイル・更新日時なら前回の結果を使う
	function load(path) {
		var stamp = '';
		try {
			var st = window.cep.fs.stat(path);
			if (st.err !== 0) return Promise.reject(new Error('ファイルが見つかりません'));
			stamp = String(st.data.mtime);
		} catch (e) { }

		var cached = cache[path];
		if (cached && cached.stamp === stamp) return cached.promise;

		var promise = new Promise(function (resolve, reject) {
			setTimeout(function () {
				try {
					var bytes = readFileBytes(path);
					var psd = parseStructure(bytes);
					decodeAll(bytes, psd, function () { resolve(psd); });
				} catch (e) {
					reject(e);
				}
			}, 0);
		});
		cache[path] = { stamp: stamp, promise: promise };
		promise.catch(function () {
			if (cache[path] && cache[path].promise === promise) delete cache[path];
		});
		return promise;
	}

	// paths に含まれないファイルのキャッシュを捨てる
	function prune(paths) {
		Object.keys(cache).forEach(function (path) {
			if (paths.indexOf(path) < 0) delete cache[path];
		});
	}

	return { STORE_MAX: STORE_MAX, load: load, prune: prune };
})();
