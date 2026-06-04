// JSON Polyfill for ExtendScript
if (typeof JSON === 'undefined') { JSON = {}; }
if (typeof JSON.parse !== 'function') {
	JSON.parse = function(str) { return eval('(' + str + ')'); };
}
if (typeof JSON.stringify !== 'function') {
	JSON.stringify = function(v) {
		if (v === null) return 'null';
		if (v === undefined) return undefined;
		var t = typeof v;
		if (t === 'boolean') return String(v);
		if (t === 'number') return isFinite(v) ? String(v) : 'null';
		if (t === 'string') {
			return '"' + v.replace(/\\/g, '\\\\')
			              .replace(/"/g, '\\"')
			              .replace(/\n/g, '\\n')
			              .replace(/\r/g, '\\r')
			              .replace(/\t/g, '\\t') + '"';
		}
		if (t === 'object') {
			var parts = [];
			if (v instanceof Array) {
				for (var i = 0; i < v.length; i++) {
					parts.push(JSON.stringify(v[i]) || 'null');
				}
				return '[' + parts.join(',') + ']';
			}
			for (var k in v) {
				if (v.hasOwnProperty(k)) {
					var val = JSON.stringify(v[k]);
					if (val !== undefined) {
						parts.push('"' + k + '":' + val);
					}
				}
			}
			return '{' + parts.join(',') + '}';
		}
		return undefined;
	};
}

// Main Functions

// 秒単位の時間をコンポジションのフレーム境界にスナップする
// Math.round で整数フレーム番号を確定してから掛け算し、
// 浮動小数点誤差を 1e-6（マイクロ秒精度）で丸めてフレーム境界に乗せる
function snapToFrame(timeSec, frameDuration) {
	var frameIndex = Math.round(timeSec / frameDuration);
	return Math.round(frameIndex * frameDuration * 1000000) / 1000000;
}

function importLyricsAsLayers(jsonStr) {
	var lyrics;
	try {
		lyrics = JSON.parse(jsonStr);
	} catch (e) {
		return JSON.stringify({ error: e.toString() });
	}

	var comp = app.project.activeItem;
	if (!comp || !(comp instanceof CompItem)) {
		return JSON.stringify({ error: 'アクティブなコンポジションがありません' });
	}

	app.beginUndoGroup('Import Lyrics as Layers');
	try {
		var created = 0;
		for (var i = 0; i < lyrics.length; i++) {
			var block = lyrics[i];
			if (!block.text) continue;

			var layer = comp.layers.addText(block.text);
			layer.name     = block.text;
			layer.inPoint  = snapToFrame(block.startSec, comp.frameDuration);
			layer.outPoint = snapToFrame(block.endSec,   comp.frameDuration);
			created++;
		}

		return JSON.stringify({ count: created });
	} catch (e) {
		return JSON.stringify({ error: e.toString() });
	} finally {
		app.endUndoGroup();
	}
}

function importLyricsAsKeyframes(jsonStr) {
	var lyrics;
	try {
		lyrics = JSON.parse(jsonStr);
	} catch (e) {
		return JSON.stringify({ error: e.toString() });
	}

	if (!lyrics.length) {
		return JSON.stringify({ error: '歌詞データが空です' });
	}

	var comp = app.project.activeItem;
	if (!comp || !(comp instanceof CompItem)) {
		return JSON.stringify({ error: 'アクティブなコンポジションがありません' });
	}

	app.beginUndoGroup('Import Lyrics as Keyframes');
	try {
		var layer = comp.layers.addText('');
		layer.name     = '歌詞';
		layer.inPoint  = 0;
		layer.outPoint = comp.duration;

		var sourceText = layer.property('ADBE Text Properties')
		                      .property('ADBE Text Document');

		var fd = comp.frameDuration;

		// 最初のブロック開始前を空にするため時刻0に空文字KFを打つ
		sourceText.setValueAtTime(0, new TextDocument(''));

		for (var i = 0; i < lyrics.length; i++) {
			var block = lyrics[i];
			if (!block.text) continue;

			var startSnapped = snapToFrame(block.startSec, fd);
			var endSnapped   = snapToFrame(block.endSec,   fd);

			var docStart = new TextDocument(block.text);
			sourceText.setValueAtTime(startSnapped, docStart);

			// 次ブロックの startSec と同時刻なら空文字KFは省略
			var nextStart = (i + 1 < lyrics.length) ? snapToFrame(lyrics[i + 1].startSec, fd) : null;
			if (nextStart === null || Math.abs(endSnapped - nextStart) > 0.001) {
				var docEnd = new TextDocument('');
				sourceText.setValueAtTime(endSnapped, docEnd);
			}
		}

		return JSON.stringify({ count: lyrics.length });
	} catch (e) {
		return JSON.stringify({ error: e.toString() });
	} finally {
		app.endUndoGroup();
	}
}
