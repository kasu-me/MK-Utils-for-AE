
var csInterface = new CSInterface();

// テーマ適用の初期実行とイベントリスナー登録
updateTheme();
csInterface.addEventListener(CSInterface.THEME_COLOR_CHANGED_EVENT, updateTheme);

// ウィンドウサイズを画面サイズの約半分に設定
try {
	var h = Math.floor(window.screen.availHeight * 0.5);
	var w = 400; // 幅は元のまま維持
	csInterface.resizeContent(w, h);
} catch (e) {
	console.log("Resize failed/ignored");
}


document.getElementById('btn-reload').addEventListener('click', loadHierarchy);
document.getElementById('btn-collapse-all').addEventListener('click', collapseAllFolders);
initThumbnailToggle();
document.getElementById('btn-add-preset').addEventListener('click', savePreset);
document.getElementById('btn-export-preset').addEventListener('click', exportPresets);
document.getElementById('btn-import-preset').addEventListener('click', importPresets);

// Keyframe Operation Events
document.getElementById('btn-get-keys').addEventListener('click', getKeyframesFromActiveComp);
document.getElementById('btn-move-keys').addEventListener('click', moveKeyframesToCurrentTime);
document.getElementById('btn-delete-keys').addEventListener('click', removeKeyframesAtCurrentTime);

// LipSync Events
document.getElementById('btn-lipsync-settings').addEventListener('click', openLipSyncModal);
document.getElementById('btn-lipsync-generate').addEventListener('click', generateLipSync);
document.getElementById('btn-lipsync-add').addEventListener('click', addLipSyncCandidate);
document.getElementById('lipsync-modal-close').addEventListener('click', closeLipSyncModal);
['lipsync-regex', 'lipsync-lead', 'lipsync-min'].forEach(function (id) {
	document.getElementById(id).addEventListener('change', saveLipSyncSettingsFromForm);
});

// Silence Cut Events
document.getElementById('btn-silence-settings').addEventListener('click', openSilenceModal);
document.getElementById('btn-silence-cut').addEventListener('click', cutSilence);
document.getElementById('silence-modal-close').addEventListener('click', closeSilenceModal);
['silence-threshold', 'silence-padding', 'silence-split', 'silence-min-gap', 'silence-ripple'].forEach(function (id) {
	document.getElementById(id).addEventListener('change', saveSilenceSettingsFromForm);
});

// 初期状態: moveボタンは無効化
var btnMoveKeys = document.getElementById('btn-move-keys');
if (btnMoveKeys) btnMoveKeys.disabled = true;

function getKeyframesFromActiveComp(e) {
	var isShift = e && e.shiftKey ? true : false;
	var statusDiv = document.getElementById('status-keyframe');
	statusDiv.textContent = "取得中...";
	statusDiv.style.color = "#eeeeee";
	statusDiv.style.fontWeight = "normal";

	if (btnMoveKeys) btnMoveKeys.disabled = true;

	csInterface.evalScript('getKeyframesFromActiveComp(' + isShift + ')', function (res) {
		if (res === "true") {
			statusDiv.textContent = "キーフレームを記録しました";
			statusDiv.style.color = "#4CAF50"; // 柔らかめの緑
			statusDiv.style.fontWeight = "bold";
			if (btnMoveKeys) btnMoveKeys.disabled = false;
		} else {
			statusDiv.textContent = "キーフレームが見つかりませんでした";
			statusDiv.style.color = "#ff4444"; // 鮮やかな赤
			statusDiv.style.fontWeight = "bold";
			if (btnMoveKeys) btnMoveKeys.disabled = true;
		}
	});
}

function moveKeyframesToCurrentTime() {
	var statusDiv = document.getElementById('status-keyframe');
	statusDiv.textContent = "移動中...";
	statusDiv.style.color = "#eeeeee";
	statusDiv.style.fontWeight = "normal";

	csInterface.evalScript('moveKeyframesToCurrentTime()', function (res) {
		var resultObj = { count: 0, status: "false" };
		try {
			// true/false以外にJSONが返る可能性もあるが、一旦単純化
			if (res === "true" || res === "false") {
				// 旧仕様対策
			} else {
				resultObj = JSON.parse(res);
			}
		} catch (e) { }

		if (res === "true" || resultObj.status === "success") {
			statusDiv.textContent = "移動完了 (メモリ消去済)";
			if (btnMoveKeys) btnMoveKeys.disabled = true;
			statusDiv.style.color = "#4CAF50"; // 柔らかめの緑
			statusDiv.style.fontWeight = "bold";
			setTimeout(function () {
				statusDiv.textContent = "";
				statusDiv.style.fontWeight = "normal";
			}, 3000);
		} else {
			statusDiv.textContent = resultObj.message ? resultObj.message : "記録中のキーフレームがありません";
			if (btnMoveKeys) btnMoveKeys.disabled = true;
			statusDiv.style.color = "#ff4444"; // 鮮やかな赤
			statusDiv.style.fontWeight = "bold";
		}
	});
}
function removeKeyframesAtCurrentTime(e) {
	var isShift = e && e.shiftKey ? true : false;
	var isSelectedOnly = e && (e.ctrlKey || e.metaKey) ? true : false;
	var target = isSelectedOnly ? "選択したレイヤー" : "全階層";
	var msg = isShift ? "現在の時間以降すべてのキーフレームを" + target + "から削除しますか？" : "現在の時間にあるキーフレームを" + target + "から削除しますか？";
	if (!confirm(msg)) {
		return;
	}

	var statusDiv = document.getElementById('status-keyframe');
	statusDiv.textContent = "削除中...";
	statusDiv.style.color = "#eeeeee";
	statusDiv.style.fontWeight = "normal";

	csInterface.evalScript('removeKeyframesAtCurrentTime(' + isShift + ', ' + isSelectedOnly + ')', function (res) {
		var resultObj = { count: 0, status: "false" };
		try {
			if (res.startsWith("{")) {
				resultObj = JSON.parse(res);
			} else {
				// Fallback for simple boolean string responses (though hostscript creates JSON)
				if (res === "true") resultObj.status = "success";
			}
		} catch (e) { }

		if (resultObj.status === "success") {
			statusDiv.textContent = "削除完了 (" + resultObj.count + "個)";
			statusDiv.style.color = "#ff4444";
			statusDiv.style.fontWeight = "bold";
			setTimeout(function () {
				statusDiv.textContent = "";
				statusDiv.style.fontWeight = "normal";
			}, 3000);
		} else {
			statusDiv.textContent = resultObj.message ? resultObj.message : "削除に失敗、またはキーが見つかりません";
			statusDiv.style.color = "#ff4444";
			statusDiv.style.fontWeight = "bold";
		}
	});
}


// Storage Management
var modal = document.getElementById("storage-modal");
var btnManage = document.getElementById("btn-manage-storage");
var spanClose = document.getElementsByClassName("close-modal")[0];

btnManage.onclick = function () {
	renderStorageList();
	modal.style.display = "block";
}

spanClose.onclick = function () {
	modal.style.display = "none";
}

window.onclick = function (event) {
	if (event.target == modal) {
		modal.style.display = "none";
	}
	if (event.target == document.getElementById("lipsync-modal")) {
		closeLipSyncModal();
	}
	if (event.target == document.getElementById("silence-modal")) {
		closeSilenceModal();
	}
}

// 起動時に自動読み込み
setTimeout(loadHierarchy, 100);

// 状態保存用グローバル変数
var g_expansionState = {}; // { compId: { "layerKey": isExpanded, ... } }
var g_lastCompId = null;
var g_lastHierarchy = null; // 口パク設定の候補探索用
var g_currentProjectPath = null;

// Preset Logic
function getPresetKey(compId) {
	var pathPart = "";
	if (g_currentProjectPath) {
		pathPart = "_" + encodeURIComponent(g_currentProjectPath);
	}
	return 'psdtool_presets' + pathPart + '_' + compId;
}

function loadPresets(compId) {
	var list = document.getElementById('preset-list');
	list.innerHTML = '';

	var json = localStorage.getItem(getPresetKey(compId));
	if (!json) return;

	try {
		var presets = JSON.parse(json);
		presets.forEach(function (p, i) {
			var item = document.createElement('div');
			item.className = 'preset-item';

			var nameSpan = document.createElement('span');
			nameSpan.className = 'preset-name';
			nameSpan.textContent = p.name;
			nameSpan.onclick = function (e) { applyPreset(p.data, e); };
			item.appendChild(nameSpan);

			// Rename Button
			var renameBtn = document.createElement('span');
			renameBtn.className = 'preset-rename';
			renameBtn.textContent = '✎';
			renameBtn.onclick = function (e) {
				e.stopPropagation();
				renamePreset(compId, i, p.name);
			};
			item.appendChild(renameBtn);

			var delBtn = document.createElement('span');
			delBtn.className = 'preset-delete';
			delBtn.textContent = '×';
			delBtn.onclick = function (e) {
				e.stopPropagation();
				if (confirm('プリセット "' + p.name + '" を削除しますか？')) {
					deletePreset(compId, i);
				}
			};
			item.appendChild(delBtn);

			list.appendChild(item);
		});
	} catch (e) {
		console.error("Preset load error", e);
	}
}

function savePreset() {
	if (!g_lastCompId) {
		alert("コンポジションが読み込まれていません。");
		return;
	}

	var name = prompt("プリセット名を入力してください", "Preset " + (new Date().toLocaleTimeString()));
	if (!name) return;

	// 現在のチェック状態を取得
	var currentData = [];
	var lis = document.querySelectorAll('li[data-layer-key]');
	lis.forEach(function (li) {
		var key = li.dataset.layerKey;
		var input = li.querySelector('input');
		var nameSpan = li.querySelector('.layer-name');
		var layerName = nameSpan ? nameSpan.textContent : null;

		if (input && !input.disabled && (input.type === 'checkbox' || input.type === 'radio')) {
			currentData.push({
				key: key,
				layerName: layerName,
				visible: input.checked
			});
		}
	});

	var key = getPresetKey(g_lastCompId);
	var presets = [];
	var json = localStorage.getItem(key);
	if (json) {
		try { presets = JSON.parse(json); } catch (e) { }
	}

	presets.push({
		name: name,
		data: currentData
	});

	localStorage.setItem(key, JSON.stringify(presets));
	loadPresets(g_lastCompId);
}

function renamePreset(compId, index, oldName) {
	var newName = prompt("新しいプリセット名を入力してください", oldName);
	if (newName && newName !== oldName) {
		var key = getPresetKey(compId);
		var json = localStorage.getItem(key);
		if (json) {
			var presets = JSON.parse(json);
			if (presets[index]) {
				presets[index].name = newName;
				localStorage.setItem(key, JSON.stringify(presets));
				loadPresets(compId);
			}
		}
	}
}

function deletePreset(compId, index) {
	var key = getPresetKey(compId);
	var json = localStorage.getItem(key);
	if (json) {
		var presets = JSON.parse(json);
		presets.splice(index, 1);
		localStorage.setItem(key, JSON.stringify(presets));
		loadPresets(compId);
	}
}

function applyPreset(savedData, e) {
	if (!g_lastCompId) return;

	// Ctrlキーが押されている場合の特別処理
	if (e && e.ctrlKey) {
		csInterface.evalScript('moveTimeToSelectedLayerInPoint()', function (res) {
			// 移動処理が終わったら続きを実行
			// 選択がない場合は移動しないだけで通常動作
			continueApplyPreset(savedData);
		});
	} else {
		continueApplyPreset(savedData);
	}
}

function continueApplyPreset(savedData) {
	// 1. まず最新の階層構造を取得する (インデックスのズレ防止)
	csInterface.evalScript('getHierarchy()', function (res) {
		var hierarchy = JSON.parse(res);
		if (hierarchy.status === 'error') {
			alert("階層データの取得に失敗しました: " + hierarchy.message);
			return;
		}

		// 2. プリセットデータをMap化して検索しやすくする
		// Key: "ID:(id)" or "NAME:(name)" -> Value: boolean (visible)
		var presetMap = {};
		savedData.forEach(function (item) {
			if (item.key) presetMap[item.key] = item.visible;
		});

		var batchDataByComp = {}; // { compId: [ {index, visible}, ... ] }

		// 3. 最新の階層ツリーを走査して、プリセットに含まれるレイヤーを探す
		// 同時にツリーデータの visible プロパティも更新して、UI描画に備える
		function traverseAndMatch(node, currentCompId) {
			// 現在のCompIDでリスト初期化
			if (!batchDataByComp[currentCompId]) {
				batchDataByComp[currentCompId] = [];
			}

			// 子要素（レイヤー）の走査
			if (node.children) {
				node.children.forEach(function (child) {
					// もしchildがフォルダ（プリコンプ）なら、その中身はそのプリコンプIDに属する
					// currentCompIdは「childが存在するCompのID」

					// まず自分自身の処理
					// ルート以外のレイヤー/フォルダ
					if (child.index !== undefined) {
						var key = getLayerKey(child);
						if (presetMap.hasOwnProperty(key)) {
							var shouldVisible = presetMap[key];

							// AE送信データに追加 (現在のCompIDに対して)
							batchDataByComp[currentCompId].push({
								index: child.index,
								visible: shouldVisible
							});

							// UI用データ更新
							child.visible = shouldVisible;
							child.opacity = shouldVisible ? 100 : 0;
						}
					}

					// 再帰処理
					// もしこのchildがフォルダ(comp)なら、そのchildrenは child.compId に属する
					if (child.children && child.children.length > 0) {
						var nextCompId = child.compId ? child.compId : currentCompId;
						traverseAndMatch(child, nextCompId);
					}
				});
			}
		}

		// 初期呼び出し: hierarchyの直下は g_lastCompId (または hierarchy.id) に属する
		traverseAndMatch(hierarchy, hierarchy.id);

		// 4. UIの再描画 (ユーザーへの即時フィードバック)
		renderTree(hierarchy);
		if (hierarchy.id) loadPresets(hierarchy.id);

		// 5. AEへ送信 (全コンポジションをまとめて1Undo)
		csInterface.evalScript('applyGlobalBatchVisibility(' + JSON.stringify(batchDataByComp) + ')', function (res) {
			console.log("Preset applied globally: " + res);
		});
	});
}

function loadHierarchy() {
	// 現在の状態を保存してからロード
	saveExpansionState();

	csInterface.evalScript('getHierarchy()', function (res) {
		var data = JSON.parse(res);
		if (data.status === 'error') {
			renderMessage("コンポジションが開かれていません。<br>対象のコンポジションを開いてから「再読み込み」を押してください。");
		} else {
			if (data.projectPath) {
				g_currentProjectPath = data.projectPath;
			} else {
				g_currentProjectPath = null; // 未保存の場合は共用または別扱い
			}

			renderTree(data);
			if (data.id) loadPresets(data.id);
		}
	});
}

function saveExpansionState() {
	if (!g_lastCompId) return;

	var state = {};
	// ツリー内のすべてのLIをチェックし、展開状態（ulがblockかどうか）を記録
	// data-layer-key を持つ要素のみ対象
	var lis = document.querySelectorAll('li[data-layer-key]');
	lis.forEach(function (li) {
		var key = li.dataset.layerKey;
		var childUl = li.querySelector('ul');
		if (childUl && childUl.style.display !== 'none') {
			state[key] = true;
		}
	});

	g_expansionState[g_lastCompId] = state;
}

function renderMessage(msg) {
	var container = document.getElementById('tree-container');
	container.innerHTML = '<p style="color: #bbb; text-align: center; margin-top: 20px;">' + msg + '</p>';
}

function collapseAllFolders() {
	var uls = document.querySelectorAll('#tree-container ul ul'); // Root以外のUL
	uls.forEach(function (ul) {
		ul.style.display = 'none';
	});
	// アイコンも戻す
	var toggles = document.querySelectorAll('.toggle-icon');
	toggles.forEach(function (t) {
		if (t.textContent === '▼') t.textContent = '▶';
	});
}

function renderTree(data) {
	var container = document.getElementById('tree-container');
	container.innerHTML = '';

	if (data.status === 'error') {
		renderMessage(data.message);
		return;
	}

	// カレントのCompIDを記録（次回の保存のため）
	g_lastCompId = data.id;
	g_lastHierarchy = data;

	var rootUl = document.createElement('ul');
	rootUl.className = 'tree-root';

	// サムネイル用に、ツリーと同じ形のノード (DOM 参照と AE 上の名前のパス) を作る
	var rootThumb = { item: null, path: [], parent: null, children: [] };

	// ルートの子要素（実際のレイヤー群）を描画. Depth starts at 1.
	data.children.forEach(function (child) {
		rootUl.appendChild(createNode(child, data.id, 1, true, rootThumb));
	});

	container.appendChild(rootUl);
	g_thumbRoot = rootThumb;
	loadThumbnails(rootThumb);
}

function getLayerKey(item) {
	if (item.layerId !== undefined && item.layerId !== null) {
		return "ID:" + item.layerId;
	}
	// Fallback
	return "NAME:" + item.name;
}

function createNode(item, parentCompId, depth, parentVisible, parentThumb) {
	var li = document.createElement('li');

	var thumbNode = { item: item, path: parentThumb.path.concat([item.name]), parent: parentThumb, children: [] };
	parentThumb.children.push(thumbNode);

	var div = document.createElement('div');
	div.className = 'item-container';

	// 現在のアイテムの可視状態（チェックされているか）を判定
	var isSelfVisible = false;
	if (item.mode === 'locked') {
		isSelfVisible = true;
	} else {
		if (!item.visible || (item.opacity !== undefined && item.opacity <= 0)) {
			isSelfVisible = false;
		} else {
			isSelfVisible = true;
		}
	}

	// フォルダ展開用トグル
	var toggle = document.createElement('span');
	toggle.className = 'toggle-icon';

	// 展開状態の決定
	// 1. 保存された状態(g_expansionState)があればそれを優先
	// 2. なければ、デフォルトロジックに従う

	var isExpanded = false;

	// キーの生成
	var layerKey = getLayerKey(item);

	// 復元ロジック
	var savedState = g_expansionState[g_lastCompId];
	var hasSavedState = (savedState !== undefined);

	if (hasSavedState) {
		// 保存されていた場合、そのKeyがTrueなら展開
		if (savedState[layerKey] === true) {
			isExpanded = true;
		} else {
			isExpanded = false;
		}
	} else {
		// デフォルトロジック
		if (depth < 2) {
			// 第一階層: 自身が表示状態なら展開
			isExpanded = isSelfVisible;
		} else {
			isExpanded = false;
		}
	}

	if (item.children && item.children.length > 0) {
		// 現在の状態に合わせてアイコン設定
		toggle.textContent = isExpanded ? '▼' : '▶';

		toggle.onclick = function (e) {
			var childUl = li.querySelector('ul');
			if (childUl) {
				var isHidden = childUl.style.display === 'none';
				var targetDisplay = isHidden ? 'block' : 'none';
				var targetIcon = isHidden ? '▼' : '▶';

				if (e.altKey) {
					// Altキーが押されていたら、配下すべてのフォルダに適用
					var allUls = li.querySelectorAll('ul');
					allUls.forEach(function (u) { u.style.display = targetDisplay; });

					var allToggles = li.querySelectorAll('.toggle-icon');
					allToggles.forEach(function (t) {
						if (t.textContent.trim() !== '') {
							t.textContent = targetIcon;
						}
					});
				} else {
					// 通常動作
					childUl.style.display = targetDisplay;
					toggle.textContent = targetIcon;
				}
			}
		};
	} else {
		toggle.innerHTML = '&nbsp;';
	}
	div.appendChild(toggle);

	// 入力コントロール
	var input = document.createElement('input');

	if (item.mode === 'locked') {
		input.type = 'checkbox';
		input.checked = true;
		input.disabled = true;
	} else if (item.mode === 'radio') {
		input.type = 'radio';
		input.name = 'radio_group_' + parentCompId;
	} else {
		input.type = 'checkbox';
	}

	// 初期状態反映
	if (item.mode !== 'locked') {
		if (!isSelfVisible) {
			input.checked = false;
		} else {
			input.checked = true;
		}
	}

	// ロジック実行関数
	var executeLogic = function () {
		var currentCompId = parentCompId;

		if (item.mode === 'radio') {
			var siblingsIndices = [];
			var parentUl = li.parentElement;
			var childLis = parentUl.children;
			for (var i = 0; i < childLis.length; i++) {
				var cLi = childLis[i];
				var cInput = cLi.querySelector('input');
				if (cInput && cInput.type === 'radio') {
					siblingsIndices.push(parseInt(cLi.dataset.index));
				}
			}

			csInterface.evalScript('setRadioVisibility(' + currentCompId + ', ' + item.index + ', ' + JSON.stringify(siblingsIndices) + ')', function (res) {
				console.log(res);
			});

		} else if (item.mode === 'check' && !input.disabled) {
			var visible = input.checked;
			csInterface.evalScript('setLayerVisibility(' + currentCompId + ', ' + item.index + ', ' + visible + ')', function (res) {
				console.log(res);
			});
		}
	};

	input.onclick = function (e) {
		executeLogic();
		refreshFolderThumbs(thumbNode.parent);
	};
	thumbNode.input = input;

	div.appendChild(input);

	var labelClick = function (e) {
		if (input.disabled) return;
		input.click();
	};

	var icon = document.createElement('span');
	icon.className = item.type === 'folder' ? 'layer-icon folder-icon' : 'layer-icon';
	icon.onclick = labelClick;
	div.appendChild(icon);
	thumbNode.icon = icon;

	var label = document.createElement('span');
	label.className = 'layer-name ' + (item.mode === 'locked' ? 'locked' : '');
	label.textContent = item.name;
	label.onclick = labelClick;
	div.appendChild(label);

	li.appendChild(div);
	li.dataset.index = item.index;
	li.dataset.layerKey = layerKey; // キー保存

	if (item.children && item.children.length > 0) {
		var childUl = document.createElement('ul');
		childUl.style.display = isExpanded ? 'block' : 'none';

		var nextCompId = item.compId ? item.compId : parentCompId;

		item.children.forEach(function (child) {
			// 子階層へも isSelfVisibleなどの状態を渡す（現状ではロジックに使っていないが、構造維持）
			childUl.appendChild(createNode(child, nextCompId, depth + 1, isSelfVisible, thumbNode));
		});
		li.appendChild(childUl);
	}

	return li;
}

// ===== Layer Thumbnails =====
// PSD 由来のレイヤーは元の PSD を panel 側で解析して縮小画像を表示する。
// フォルダは、配下で現在表示中のレイヤーを重ねた画像 (クリッピングを考慮) を表示する。
var THUMB_SETTINGS_KEY = 'psdtool_show_thumbnails';
var g_thumbGen = 0; // 再描画のたびに増やし、古い読み込み結果を捨てる
var g_thumbRoot = null; // 現在のツリーのサムネイル用ノード (口パク設定のプルダウンからも参照する)

function isThumbnailEnabled() {
	try {
		return localStorage.getItem(THUMB_SETTINGS_KEY) !== '0';
	} catch (e) {
		return true;
	}
}

function initThumbnailToggle() {
	var chk = document.getElementById('chk-thumbnails');
	chk.checked = isThumbnailEnabled();
	chk.addEventListener('change', function () {
		try {
			localStorage.setItem(THUMB_SETTINGS_KEY, chk.checked ? '1' : '0');
		} catch (e) { }
		if (g_lastCompId) loadHierarchy();
	});
}

function collectThumbLeaves(node, out) {
	node.children.forEach(function (c) {
		if (c.item.type === 'folder') collectThumbLeaves(c, out);
		else out.push(c);
	});
	return out;
}

function loadThumbnails(rootThumb) {
	var gen = ++g_thumbGen;
	var status = document.getElementById('status-thumb');
	status.textContent = '';
	hideThumbPreview();
	if (!isThumbnailEnabled()) return;

	var files = [];
	collectThumbLeaves(rootThumb, []).forEach(function (n) {
		if (n.item.psdFile && files.indexOf(n.item.psdFile) < 0) files.push(n.item.psdFile);
	});
	PsdThumb.prune(files);
	if (files.length === 0) return;

	status.textContent = 'サムネイルを読み込み中...';
	var psds = {};
	var errors = [];
	var pending = files.length;
	files.forEach(function (file) {
		var fileName = file.replace(/^.*[\\\/]/, '');
		PsdThumb.load(file).then(function (psd) {
			psds[file] = psd;
			if (psd.warning) errors.push(fileName + ': ' + psd.warning);
		}, function (e) {
			errors.push(fileName + ': ' + e.message);
		}).then(function () {
			if (--pending > 0 || gen !== g_thumbGen) return;
			applyThumbnails(rootThumb, psds);
			status.textContent = errors.length ? 'サムネイル: ' + errors.join('\n') : '';
		});
	});
}

// AE のツリーと PSD のレイヤーを、名前のパスで対応付ける。
// AE 側は PSD のコンポより上の階層を含むことがあるので、パスの末尾が一致する最長のものを探す。
// 同じパスのレイヤーが複数あるときは、上から順に出てきた順番で割り当てる
function matchPsdLayer(node, psd, counters) {
	var names = [node.item.psdName || node.item.name];
	if (names[0] !== node.item.name) names.push(node.item.name);
	for (var n = 0; n < names.length; n++) {
		var path = node.path.slice(0, -1).concat([names[n]]);
		for (var i = 0; i < path.length; i++) {
			var key = path.slice(i).join('\u0000');
			var list = psd.index[key];
			if (!list) continue;
			var counterKey = node.item.psdFile + '\u0001' + key;
			var count = counters[counterKey] || 0;
			counters[counterKey] = count + 1;
			return list[count % list.length];
		}
	}
	return null;
}

function applyThumbnails(rootThumb, psds) {
	var counters = {};
	collectThumbLeaves(rootThumb, []).forEach(function (node) {
		var psd = psds[node.item.psdFile];
		if (!psd) return;
		node.psdLayer = matchPsdLayer(node, psd, counters);
		var src = node.psdLayer && node.psdLayer.canvas;
		if (!src) return;
		setThumbCanvas(node, copyThumbCanvas(src));
	});

	var walkFolders = function (node) {
		node.children.forEach(function (c) {
			if (c.item.type !== 'folder') return;
			walkFolders(c);
			updateFolderThumb(c);
		});
	};
	walkFolders(rootThumb);
}

function copyThumbCanvas(src) {
	var canvas = document.createElement('canvas');
	canvas.width = src.width;
	canvas.height = src.height;
	canvas.getContext('2d').drawImage(src, 0, 0);
	canvas.className = 'layer-thumb';
	return canvas;
}

function setThumbCanvas(node, canvas) {
	if (!node.thumbCanvas) {
		node.icon.classList.add('has-thumb');
		node.icon.addEventListener('mouseenter', function (e) { showThumbPreview(node.thumbCanvas, e); });
		node.icon.addEventListener('mousemove', moveThumbPreview);
		node.icon.addEventListener('mouseleave', hideThumbPreview);
	}
	node.icon.innerHTML = '';
	canvas.className = 'layer-thumb';
	node.icon.appendChild(canvas);
	node.thumbCanvas = canvas;
}

function isThumbNodeOn(node) {
	return node.item.mode === 'locked' || (node.input && node.input.checked);
}

function hasPsdPixels(node) {
	if (node.item.type === 'folder') return node.children.some(hasPsdPixels);
	return !!node.psdLayer;
}

// frame: ドキュメント座標 (x, y) を倍率 s でキャンバスに写す
function drawThumbNode(node, ctx, frame) {
	if (node.item.type === 'folder') {
		composeThumbChildren(node.children, ctx, frame);
		return;
	}
	var layer = node.psdLayer;
	if (!layer || !layer.canvas) return;
	ctx.globalAlpha = layer.opacity / 255;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(layer.canvas, (layer.left - frame.x) * frame.s, (layer.top - frame.y) * frame.s, layer.width * frame.s, layer.height * frame.s);
	ctx.globalAlpha = 1;
}

// 下のレイヤーから重ねる。クリッピングされたレイヤーは直下のベースレイヤーの不透明部分にだけ描く
function composeThumbChildren(children, ctx, frame) {
	var base = null;
	var flush = function () {
		if (base) ctx.drawImage(base, 0, 0);
		base = null;
	};
	for (var i = children.length - 1; i >= 0; i--) {
		var c = children[i];
		if (!hasPsdPixels(c)) continue;
		var clipping = c.item.type !== 'folder' && c.psdLayer.clipping;
		if (!clipping) {
			flush();
			if (!isThumbNodeOn(c)) continue;
			base = document.createElement('canvas');
			base.width = frame.w;
			base.height = frame.h;
			drawThumbNode(c, base.getContext('2d'), frame);
		} else if (base && isThumbNodeOn(c)) {
			var bctx = base.getContext('2d');
			bctx.globalCompositeOperation = 'source-atop';
			drawThumbNode(c, bctx, frame);
			bctx.globalCompositeOperation = 'source-over';
		}
	}
	flush();
}

function updateFolderThumb(node) {
	var leaves = collectThumbLeaves(node, []).filter(function (n) { return n.psdLayer && n.psdLayer.canvas; });
	if (leaves.length === 0) return;
	// 別々の PSD が混ざるフォルダは座標系が合わないので作らない
	var file = leaves[0].item.psdFile;
	if (leaves.some(function (n) { return n.item.psdFile !== file; })) return;

	// 表示切り替えで画像が動かないよう、範囲は表示状態に関係なく配下全体で決める
	var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
	leaves.forEach(function (n) {
		var l = n.psdLayer;
		x0 = Math.min(x0, l.left);
		y0 = Math.min(y0, l.top);
		x1 = Math.max(x1, l.left + l.width);
		y1 = Math.max(y1, l.top + l.height);
	});
	var s = Math.min(1, PsdThumb.STORE_MAX / Math.max(x1 - x0, y1 - y0));
	var frame = { x: x0, y: y0, s: s, w: Math.max(1, Math.ceil((x1 - x0) * s)), h: Math.max(1, Math.ceil((y1 - y0) * s)) };

	var canvas = node.thumbCanvas || document.createElement('canvas');
	canvas.width = frame.w;
	canvas.height = frame.h;
	composeThumbChildren(node.children, canvas.getContext('2d'), frame);
	if (!node.thumbCanvas) setThumbCanvas(node, canvas);
}

// 表示を切り替えたら、上位フォルダの合成サムネイルを作り直す
function refreshFolderThumbs(node) {
	for (; node && node.item; node = node.parent) {
		if (node.thumbCanvas) updateFolderThumb(node);
	}
}

function showThumbPreview(src, e) {
	if (!src) return;
	var preview = document.getElementById('thumb-preview');
	var canvas = preview.querySelector('canvas');
	canvas.width = src.width;
	canvas.height = src.height;
	canvas.getContext('2d').drawImage(src, 0, 0);
	var k = PsdThumb.STORE_MAX / Math.max(src.width, src.height);
	canvas.style.width = Math.round(src.width * k) + 'px';
	canvas.style.height = Math.round(src.height * k) + 'px';
	preview.style.display = 'block';
	moveThumbPreview(e);
}

function moveThumbPreview(e) {
	var preview = document.getElementById('thumb-preview');
	if (preview.style.display !== 'block') return;
	var w = preview.offsetWidth;
	var h = preview.offsetHeight;
	var x = e.clientX + 16;
	if (x + w > window.innerWidth) x = Math.max(0, e.clientX - w - 16);
	var y = Math.min(Math.max(0, e.clientY - h / 2), Math.max(0, window.innerHeight - h));
	preview.style.left = x + 'px';
	preview.style.top = y + 'px';
}

function hideThumbPreview() {
	document.getElementById('thumb-preview').style.display = 'none';
}

function updateTheme() {
	var hostEnv = csInterface.getHostEnvironment();
	if (!hostEnv || !hostEnv.appSkinInfo) return;

	var skin = hostEnv.appSkinInfo;
	var panelBg = skin.panelBackgroundColor.color;

	var bgStr = toHex(panelBg);
	document.body.style.backgroundColor = bgStr;

	var brightness = (panelBg.red * 299 + panelBg.green * 587 + panelBg.blue * 114) / 1000;

	if (brightness > 128) {
		// Light Theme
		document.body.style.color = "#333333";
		setCSSVar('--btn-bg', "#e0e0e0");
		setCSSVar('--btn-fg', "#333333");
		setCSSVar('--btn-border', "#aaaaaa");
		setCSSVar('--btn-hover', "#d0d0d0");
		setCSSVar('--item-hover', "#e8e8e8");
	} else {
		// Dark Theme
		document.body.style.color = "#cccccc";
		setCSSVar('--btn-bg', "#383838");
		setCSSVar('--btn-fg', "#f0f0f0");
		setCSSVar('--btn-border', "#505050");
		setCSSVar('--btn-hover', "#484848");
		setCSSVar('--item-hover', "#2a2a2a");
	}

	if (skin.baseFontSize) {
		document.body.style.fontSize = skin.baseFontSize + "px";
	}
}

function toHex(color) {
	function hex(n) { return (n < 16 ? "0" : "") + Math.round(n).toString(16); }
	return "#" + hex(color.red) + hex(color.green) + hex(color.blue);
}

function setCSSVar(name, value) {
	document.documentElement.style.setProperty(name, value);
}

// ------ Import / Export Logic ------

function exportPresets() {
	if (!g_lastCompId) {
		alert("コンポジションが読み込まれていません。");
		return;
	}

	var key = getPresetKey(g_lastCompId);
	var json = localStorage.getItem(key);

	if (!json || JSON.parse(json).length === 0) {
		alert("保存されているプリセットがありません。");
		return;
	}

	// 階層情報を取得してIDから名前へのマッピングを行う（別プロジェクトへの移行用）
	csInterface.evalScript('getHierarchy()', function (res) {
		var hierarchy = JSON.parse(res);
		if (hierarchy.status === 'error') {
			alert("コンポジション情報の取得に失敗しました。");
			return;
		}

		// ID -> Name Map
		var idToName = {};
		function traverse(node) {
			if (node.layerId !== undefined) {
				idToName["ID:" + node.layerId] = node.name;
			}
			if (node.children) node.children.forEach(traverse);
		}
		traverse(hierarchy);

		var savedPresets = JSON.parse(json);
		var exportData = [];

		savedPresets.forEach(function (p) {
			var newData = [];
			if (p.data) {
				p.data.forEach(function (item) {
					var k = item.key;
					var v = item.visible;
					if (k && k.indexOf("ID:") === 0) {
						// IDキーなら名前に変換してエクスポート
						// マップにあれば変換。なければスキップ（存在しないレイヤーはエクスポートしない方が安全）
						if (idToName[k]) {
							newData.push({ key: "NAME:" + idToName[k], visible: v });
						}
					} else if (k && k.indexOf("NAME:") === 0) {
						// 既にNAMEキーならそのまま
						newData.push({ key: k, visible: v });
					}
				});
			}
			if (newData.length > 0) {
				exportData.push({ name: p.name, data: newData });
			}
		});

		if (exportData.length === 0) {
			alert("エクスポート可能なデータが見つかりませんでした。");
			return;
		}

		var result = window.cep.fs.showSaveDialogEx(
			"プリセットのエクスポート",
			g_lastCompId + "_presets.json",
			["json"],
			"psdtool_presets.json"
		);

		if (result.data) {
			var err = window.cep.fs.writeFile(result.data, JSON.stringify(exportData, null, 2));
			if (err.err === 0) {
				alert("エクスポートしました。");
			} else {
				alert("保存に失敗しました: " + err.err);
			}
		}
	});
}

function importPresets() {
	if (!g_lastCompId) {
		alert("コンポジションが読み込まれていません。");
		return;
	}

	var result = window.cep.fs.showOpenDialogEx(
		true, false, "プリセットのインポート", null, ["json"]
	);

	if (result.data && result.data.length > 0) {
		var filePath = result.data[0];
		var readRes = window.cep.fs.readFile(filePath);

		if (readRes.err === 0) {
			try {
				var importedPresets = JSON.parse(readRes.data);
				if (!Array.isArray(importedPresets)) {
					alert("不正なファイル形式です。");
					return;
				}

				// バリデーションのために現在の階層構造を取得
				csInterface.evalScript('getHierarchy()', function (res) {
					var hierarchy = JSON.parse(res);
					if (hierarchy.status === 'error') {
						alert("コンポジション情報の取得に失敗したため、インポートを中止します。");
						return;
					}

					// 名前 -> ID Map の作成 (現在のコンポジション環境に合わせるため)
					var nameToId = {};
					function collectKeys(node) {
						if (node.layerId !== undefined) {
							// "NAME:レイヤー名" -> "ID:レイヤーID" の対応を作る
							nameToId["NAME:" + node.name] = "ID:" + node.layerId;
						}
						if (node.children) node.children.forEach(collectKeys);
					}
					if (hierarchy.children) hierarchy.children.forEach(collectKeys);

					// インポートデータの検証
					var errorMessages = [];
					var validPresets = [];

					importedPresets.forEach(function (preset) {
						if (!preset.data || !Array.isArray(preset.data)) return;

						var convertedData = [];
						var missingCount = 0;

						preset.data.forEach(function (item) {
							var k = item.key;
							if (!k) return;

							// エクスポートデータは "NAME:xxx" になっているはず
							if (k.indexOf("NAME:") === 0) {
								if (nameToId[k]) {
									// 現在のCompに対応するレイヤーIDが見つかった -> IDキーに変換して取り込む
									convertedData.push({ key: nameToId[k], visible: item.visible });
								} else {
									missingCount++;
								}
							} else {
								// もしIDキーのまま渡されたら、別Compでは使えないのでNGとする
								missingCount++;
							}
						});

						if (missingCount > 0) {
							errorMessages.push("プリセット '" + preset.name + "' に含まれる " + missingCount + " 個のレイヤーが現在のコンポジションで見つかりません（名前不一致）。");
						} else {
							if (convertedData.length > 0) {
								validPresets.push({ name: preset.name, data: convertedData });
							}
						}
					});

					if (errorMessages.length > 0) {
						alert("インポートエラー:\n" + errorMessages.join("\n") + "\n\nすべてのレイヤー名が一致する必要があります。");
						return;
					}

					if (validPresets.length === 0) {
						alert("インポートできる有効なデータがありませんでした。");
						return;
					}

					// 検証OKなら追加
					var key = getPresetKey(g_lastCompId);
					var existingJson = localStorage.getItem(key);
					var existingPresets = existingJson ? JSON.parse(existingJson) : [];

					// 重複チェックはせず追記する（名前が同じでも内容は違う可能性があるため）
					validPresets.forEach(function (p) {
						existingPresets.push(p);
					});

					localStorage.setItem(key, JSON.stringify(existingPresets));
					loadPresets(g_lastCompId);
					alert("インポートが完了しました。");

				});

			} catch (e) {
				alert("JSONパースエラー: " + e);
			}
		} else {
			alert("ファイル読み込みエラー: " + readRes.err);
		}
	}
}

// ------ Storage Management ------

function renderStorageList() {
	var listContainer = document.getElementById("storage-list-container");
	listContainer.innerHTML = "";

	var items = [];
	for (var i = 0; i < localStorage.length; i++) {
		var key = localStorage.key(i);
		if (key.indexOf("psdtool_presets") === 0) {
			var data = localStorage.getItem(key);
			var presetCount = 0;
			try {
				var json = JSON.parse(data);
				if (Array.isArray(json)) presetCount = json.length;
			} catch (e) { }

			// Parse Key
			var lastUnder = key.lastIndexOf("_");
			var compId = key.substring(lastUnder + 1);
			var prefix = key.substring(0, lastUnder);
			var path = "(未保存プロジェクト)";

			if (prefix === "psdtool_presets") {
				// No path part
			} else if (prefix.indexOf("psdtool_presets_") === 0) {
				var encoded = prefix.substring("psdtool_presets_".length);
				try {
					path = decodeURIComponent(encoded);
				} catch (e) {
					path = encoded;
				}
			}

			items.push({
				key: key,
				path: path,
				compId: compId,
				count: presetCount
			});
		}
	}

	if (items.length === 0) {
		listContainer.innerHTML = "<p style='color:#888; text-align:center; padding-top:20px;'>保存されたプリセットはありません。</p>";
		return;
	}

	// Sort by path
	items.sort(function (a, b) {
		return a.path.localeCompare(b.path) || a.compId.localeCompare(b.compId);
	});

	items.forEach(function (item) {
		var div = document.createElement("div");
		div.className = "storage-item";

		var infoDiv = document.createElement("div");
		infoDiv.className = "storage-info";

		// ファイル名を抽出して大きく表示
		var fileName = item.path;
		if (fileName.indexOf("\\") > 0) fileName = fileName.split("\\").pop();
		if (fileName.indexOf("/") > 0) fileName = fileName.split("/").pop();

		var nameSpan = document.createElement("span");
		nameSpan.className = "storage-name";
		nameSpan.textContent = fileName;
		nameSpan.title = "Project: " + fileName;

		var pathSpan = document.createElement("span");
		pathSpan.className = "storage-path";
		pathSpan.title = item.path;
		pathSpan.textContent = item.path;

		var detailsSpan = document.createElement("span");
		detailsSpan.className = "storage-comp";
		detailsSpan.textContent = "CompID: " + item.compId + " / Presets: " + item.count;

		infoDiv.appendChild(nameSpan);
		infoDiv.appendChild(pathSpan);
		infoDiv.appendChild(detailsSpan);

		var actionsDiv = document.createElement("div");
		actionsDiv.className = "storage-actions";

		var importBtn = document.createElement("button");
		importBtn.className = "storage-import";
		importBtn.textContent = "インポート";
		importBtn.onclick = function () {
			importPresetsFromData(item.key);
		};

		var delBtn = document.createElement("button");
		delBtn.className = "storage-delete";
		delBtn.textContent = "削除";
		delBtn.onclick = function () {
			if (confirm("以下のデータを削除しますか？\n\nパス: " + item.path + "\nCompID: " + item.compId)) {
				localStorage.removeItem(item.key);
				renderStorageList(); // Refresh list

				// Make sure to refresh main UI if we deleted the currently active presets
				if (g_lastCompId) {
					var currentKey = getPresetKey(g_lastCompId);
					if (currentKey === item.key) {
						loadPresets(g_lastCompId);
					}
				}
			}
		};

		actionsDiv.appendChild(importBtn);
		actionsDiv.appendChild(delBtn);

		div.appendChild(infoDiv);
		div.appendChild(actionsDiv);
		listContainer.appendChild(div);
	});
}

function importPresetsFromData(storageKey) {
	if (!g_lastCompId) {
		alert("コンポジションが読み込まれていません。");
		return;
	}

	var json = localStorage.getItem(storageKey);
	if (!json) {
		alert("データが見つかりませんでした。");
		return;
	}

	try {
		var importedPresets = JSON.parse(json);
		if (!Array.isArray(importedPresets)) {
			alert("データ形式が不正です。");
			return;
		}

		// バリデーションのために現在の階層構造を取得
		csInterface.evalScript('getHierarchy()', function (res) {
			var hierarchy = JSON.parse(res);
			if (hierarchy.status === 'error') {
				alert("コンポジション情報の取得に失敗したため、インポートを中止します。");
				return;
			}

			// 名前 -> ID Map と 有効ID Map の作成
			var nameToId = {};
			var validIds = {};
			function collectKeys(node) {
				if (node.layerId !== undefined) {
					nameToId["NAME:" + node.name] = "ID:" + node.layerId;
					validIds["ID:" + node.layerId] = true;
				}
				if (node.children) node.children.forEach(collectKeys);
			}
			if (hierarchy.children) hierarchy.children.forEach(collectKeys);

			var validPresets = [];
			var errorMessages = [];

			importedPresets.forEach(function (preset) {
				if (!preset.data || !Array.isArray(preset.data)) return;

				var convertedData = [];
				var missingCount = 0;

				preset.data.forEach(function (item) {
					var k = item.key;
					if (!k) return;

					if (k.indexOf("NAME:") === 0) {
						if (nameToId[k]) {
							convertedData.push({ key: nameToId[k], visible: item.visible });
						} else {
							missingCount++;
						}
					} else if (k.indexOf("ID:") === 0) {
						if (validIds[k]) {
							convertedData.push({ key: k, visible: item.visible });
						} else if (item.layerName && nameToId["NAME:" + item.layerName]) {
							// IDは一致しないが、バックアップされた名前で一致するレイヤーがある場合（プロジェクト移行時など）
							// 現在のプロジェクトのIDに変換して取り込む
							convertedData.push({ key: nameToId["NAME:" + item.layerName], visible: item.visible });
						} else {
							missingCount++;
						}
					}
				});

				if (missingCount > 0) {
					errorMessages.push("プリセット '" + preset.name + "' に含まれる " + missingCount + " 個のレイヤーが現在のコンポジションで見つかりません。");
				} else {
					if (convertedData.length > 0) {
						validPresets.push({ name: preset.name, data: convertedData });
					}
				}
			});

			if (errorMessages.length > 0) {
				alert("インポートエラー:\n" + errorMessages.join("\n") + "\n\nすべてのレイヤーが現在のコンポジションに存在する必要があります。");
				return;
			}

			if (validPresets.length === 0) {
				alert("インポートできる有効なデータがありませんでした。");
				return;
			}

			// 追加
			var activeKey = getPresetKey(g_lastCompId);
			var existingJson = localStorage.getItem(activeKey);
			var existingPresets = existingJson ? JSON.parse(existingJson) : [];

			validPresets.forEach(function (p) {
				existingPresets.push(p);
			});

			localStorage.setItem(activeKey, JSON.stringify(existingPresets));
			loadPresets(g_lastCompId);

			alert("インポートが完了しました。");

			// モーダルを閉じる
			document.getElementById("storage-modal").style.display = "none";
		});

	} catch (e) {
		alert("データの読み込みに失敗しました: " + e);
	}
}

// ------ LipSync ------

var LIPSYNC_SETTINGS_KEY = 'psdtool_lipsync_settings';
var LIPSYNC_SHAPES = [
	{ key: 'a', label: 'あ' },
	{ key: 'i', label: 'い' },
	{ key: 'u', label: 'う' },
	{ key: 'e', label: 'え' },
	{ key: 'o', label: 'お' },
	{ key: 'n', label: 'ん(閉)' }
];

function loadLipSyncSettings() {
	var settings = { regex: '.*-.*-(.*)-.*', leadFrames: 1, minFrames: 1 };
	try {
		var saved = JSON.parse(localStorage.getItem(LIPSYNC_SETTINGS_KEY));
		if (saved) {
			if (typeof saved.regex === 'string') settings.regex = saved.regex;
			if (typeof saved.leadFrames === 'number') settings.leadFrames = saved.leadFrames;
			if (typeof saved.minFrames === 'number') settings.minFrames = saved.minFrames;
		}
	} catch (e) { }
	return settings;
}

function saveLipSyncSettingsFromForm() {
	var regex = document.getElementById('lipsync-regex').value;
	try {
		new RegExp(regex);
	} catch (e) {
		alert("入力された正規表現が正しくありません。\nエラー: " + e.message);
		return;
	}
	var lead = parseInt(document.getElementById('lipsync-lead').value, 10);
	var min = parseInt(document.getElementById('lipsync-min').value, 10);
	localStorage.setItem(LIPSYNC_SETTINGS_KEY, JSON.stringify({
		regex: regex,
		leadFrames: isNaN(lead) || lead < 0 ? 0 : lead,
		minFrames: isNaN(min) || min < 1 ? 1 : min
	}));
}

function openLipSyncModal() {
	var settings = loadLipSyncSettings();
	document.getElementById('lipsync-regex').value = settings.regex;
	document.getElementById('lipsync-lead').value = settings.leadFrames;
	document.getElementById('lipsync-min').value = settings.minFrames;

	var list = document.getElementById('lipsync-config-list');
	list.innerHTML = '<p class="lipsync-empty">読み込み中...</p>';
	document.getElementById('lipsync-modal').style.display = 'block';

	csInterface.evalScript('getLipSyncConfigs()', function (res) {
		var data;
		try { data = JSON.parse(res); } catch (e) { data = { status: 'error', message: res }; }
		list.innerHTML = '';
		if (data.status !== 'success') {
			list.innerHTML = '<p class="lipsync-empty"></p>';
			list.firstChild.textContent = '設定の取得に失敗しました: ' + data.message;
			return;
		}
		data.configs.forEach(function (cfg) {
			var title = cfg.parentName ? cfg.parentName + ' / ' + cfg.compName : cfg.compName;
			list.appendChild(createLipSyncCard(cfg.compId, title, cfg.speaker, cfg.map, cfg.layerNames, true));
		});
		updateLipSyncEmptyMessage();
		refreshLipSyncCandidates();
	});
}

function closeLipSyncModal() {
	var unsaved = document.querySelectorAll('#lipsync-config-list .lipsync-card.unsaved');
	if (unsaved.length > 0 && !confirm('保存されていない設定があります。閉じてもよろしいですか？')) {
		return;
	}
	if (g_thumbSelectClose) g_thumbSelectClose();
	document.getElementById('lipsync-modal').style.display = 'none';
}

function updateLipSyncEmptyMessage() {
	var list = document.getElementById('lipsync-config-list');
	var empty = list.querySelector('.lipsync-empty');
	if (list.querySelector('.lipsync-card')) {
		if (empty) list.removeChild(empty);
	} else if (!empty) {
		var p = document.createElement('p');
		p.className = 'lipsync-empty';
		p.textContent = '口パク設定はまだありません。下の一覧から口差分のフォルダを選んで追加してください。';
		list.appendChild(p);
	}
}

// 現在のツリーから、ラジオボタン(*)の子を持つフォルダを口差分の候補として列挙する
function collectLipSyncCandidates() {
	var candidates = [];
	if (!g_lastHierarchy || !g_lastHierarchy.children) return candidates;

	function traverse(node, path) {
		if (!node.children) return;
		var currentPath = path.concat([node.name]);
		var hasRadio = node.children.some(function (c) { return c.mode === 'radio'; });
		if (node.type === 'folder' && hasRadio) {
			candidates.push({
				compId: node.compId,
				label: currentPath.join(' / '),
				rootName: currentPath.length > 1 ? currentPath[0] : g_lastHierarchy.name,
				layerNames: node.children.map(function (c) { return c.name; })
			});
		}
		node.children.forEach(function (c) { traverse(c, currentPath); });
	}
	g_lastHierarchy.children.forEach(function (c) { traverse(c, []); });
	return candidates;
}

function refreshLipSyncCandidates() {
	var select = document.getElementById('lipsync-candidate');
	select.innerHTML = '';

	var usedIds = {};
	document.querySelectorAll('#lipsync-config-list .lipsync-card').forEach(function (card) {
		usedIds[card.dataset.compId] = true;
	});

	var seen = {};
	collectLipSyncCandidates().forEach(function (c) {
		if (usedIds[c.compId] || seen[c.compId]) return;
		seen[c.compId] = true;
		var opt = document.createElement('option');
		opt.value = c.compId;
		opt.textContent = c.label;
		opt.candidate = c;
		select.appendChild(opt);
	});

	var disabled = select.options.length === 0;
	if (disabled) {
		var opt = document.createElement('option');
		opt.textContent = g_lastHierarchy ? '(追加できるフォルダがありません)' : '(ツリーを再読み込みしてください)';
		select.appendChild(opt);
	}
	select.disabled = disabled;
	document.getElementById('btn-lipsync-add').disabled = disabled;
}

function addLipSyncCandidate() {
	var select = document.getElementById('lipsync-candidate');
	var opt = select.options[select.selectedIndex];
	if (!opt || !opt.candidate) return;
	var c = opt.candidate;

	// 話者名の初期値は立ち絵のコンポジション名 (拡張子除く)
	var speaker = c.rootName.replace(/\.psd$/i, '');
	var card = createLipSyncCard(c.compId, c.label, speaker, {}, c.layerNames, false);
	document.getElementById('lipsync-config-list').appendChild(card);
	updateLipSyncEmptyMessage();
	refreshLipSyncCandidates();
	card.querySelector('input').focus();
}

function findThumbFolder(node, compId) {
	if (!node) return null;
	for (var i = 0; i < node.children.length; i++) {
		var c = node.children[i];
		if (c.item.type !== 'folder') continue;
		if (String(c.item.compId) === String(compId)) return c;
		var found = findThumbFolder(c, compId);
		if (found) return found;
	}
	return null;
}

// 口差分コンポ内のレイヤーのサムネイル。ツリーに無い・読み込み前なら null
function getLipSyncLayerThumb(compId, name) {
	if (!name) return null;
	var folder = findThumbFolder(g_thumbRoot, compId);
	if (!folder) return null;
	for (var i = 0; i < folder.children.length; i++) {
		if (folder.children[i].item.name === name) return folder.children[i].thumbCanvas || null;
	}
	return null;
}

// ===== サムネイル付きプルダウン =====
// ネイティブの <select> は選択肢にマウスイベントが来ずプレビューを出せないので、自前で描く。
// 戻り値の要素は select と同じく .value で値を読み書きできる
var g_thumbSelectClose = null; // 開いているリストを閉じる関数

function createThumbSelect(names, getThumb, onChange) {
	var options = [{ value: '', label: '(未選択)' }].concat(names.map(function (n) {
		return { value: n, label: n };
	}));
	var current = '';

	var root = document.createElement('div');
	root.className = 'thumb-select';
	root.tabIndex = 0;

	var makeIcon = function (src) {
		var icon = document.createElement('span');
		icon.className = 'thumb-select-icon';
		if (src) icon.appendChild(copyThumbCanvas(src));
		return icon;
	};

	var render = function () {
		root.innerHTML = '';
		var src = getThumb(current);
		if (src) root.appendChild(makeIcon(src));
		var label = document.createElement('span');
		label.className = 'thumb-select-label';
		label.textContent = current || '(未選択)';
		root.appendChild(label);
	};

	var indexOfValue = function (v) {
		for (var i = 0; i < options.length; i++) {
			if (options[i].value === v) return i;
		}
		return 0;
	};

	var choose = function (v) {
		if (v === current) return;
		current = v;
		render();
		onChange();
	};

	// 開いている間だけ有効
	var list = null;
	var items = [];
	var active = 0;

	var setActive = function (i) {
		if (items[active]) items[active].classList.remove('active');
		active = Math.max(0, Math.min(items.length - 1, i));
		items[active].classList.add('active');
	};

	var close = function () {
		if (!list) return;
		document.removeEventListener('mousedown', onOutside, true);
		document.removeEventListener('scroll', onScroll, true);
		window.removeEventListener('resize', close);
		list.parentNode.removeChild(list);
		list = null;
		items = [];
		root.classList.remove('open');
		hideThumbPreview();
		if (g_thumbSelectClose === close) g_thumbSelectClose = null;
	};

	var onOutside = function (e) {
		if (!list.contains(e.target) && !root.contains(e.target)) close();
	};

	var onScroll = function (e) {
		if (!list.contains(e.target)) close();
	};

	var open = function () {
		if (g_thumbSelectClose) g_thumbSelectClose();
		hideThumbPreview();
		render(); // カードを作ったあとに読み込み終わったサムネイルを反映する

		list = document.createElement('div');
		list.className = 'thumb-select-list';
		var thumbs = options.map(function (o) { return getThumb(o.value); });
		var hasThumb = thumbs.some(function (t) { return !!t; });
		options.forEach(function (o, i) {
			var item = document.createElement('div');
			item.className = 'thumb-select-item';
			var src = thumbs[i];
			if (hasThumb) item.appendChild(makeIcon(src));
			var label = document.createElement('span');
			label.className = 'thumb-select-label';
			label.textContent = o.label;
			item.appendChild(label);

			item.addEventListener('mouseenter', function (e) {
				setActive(i);
				showThumbPreview(src, e);
			});
			item.addEventListener('mousemove', moveThumbPreview);
			item.addEventListener('mouseleave', hideThumbPreview);
			item.addEventListener('mousedown', function (e) {
				e.preventDefault(); // フォーカスを root に残す
			});
			// 押したままドラッグして離しても選べるよう mouseup で確定する。
			// すぐ消すと続く click がモーダルの背景に飛んでモーダルが閉じることがあるので、消すのは後で
			item.addEventListener('mouseup', function (e) {
				if (e.button !== 0) return;
				choose(o.value);
				setTimeout(close, 0);
			});
			list.appendChild(item);
			items.push(item);
		});
		document.body.appendChild(list);

		// 下に収まらず上の方が広ければ上に開く
		var r = root.getBoundingClientRect();
		var below = window.innerHeight - r.bottom - 4;
		var above = r.top - 4;
		list.style.minWidth = r.width + 'px';
		if (list.offsetHeight > below && above > below) {
			list.style.maxHeight = above + 'px';
			list.style.bottom = (window.innerHeight - r.top) + 'px';
		} else {
			list.style.maxHeight = below + 'px';
			list.style.top = r.bottom + 'px';
		}
		list.style.left = Math.max(0, Math.min(r.left, window.innerWidth - list.offsetWidth)) + 'px';

		setActive(indexOfValue(current));
		items[active].scrollIntoView({ block: 'nearest' });
		root.classList.add('open');

		document.addEventListener('mousedown', onOutside, true);
		document.addEventListener('scroll', onScroll, true);
		window.addEventListener('resize', close);
		g_thumbSelectClose = close;
	};

	root.addEventListener('mousedown', function (e) {
		if (e.button !== 0) return;
		if (list) close();
		else open();
	});

	root.addEventListener('keydown', function (e) {
		var key = e.key;
		if (list) {
			if (key === 'ArrowDown' || key === 'ArrowUp') {
				setActive(active + (key === 'ArrowDown' ? 1 : -1));
				items[active].scrollIntoView({ block: 'nearest' });
				var src = getThumb(options[active].value);
				var r = items[active].getBoundingClientRect();
				if (src) showThumbPreview(src, { clientX: r.right, clientY: r.top + r.height / 2 });
				else hideThumbPreview();
			} else if (key === 'Enter' || key === ' ') {
				choose(options[active].value);
				close();
			} else if (key === 'Escape' || key === 'Tab') {
				close();
				if (key === 'Tab') return;
			} else {
				return;
			}
		} else {
			if (key === 'ArrowDown' || key === 'ArrowUp') {
				var i = indexOfValue(current) + (key === 'ArrowDown' ? 1 : -1);
				if (i >= 0 && i < options.length) choose(options[i].value);
			} else if (key === 'Enter' || key === ' ') {
				open();
			} else {
				return;
			}
		}
		e.preventDefault();
		e.stopPropagation();
	});

	root.addEventListener('mouseenter', function (e) {
		if (!list) showThumbPreview(getThumb(current), e);
	});
	root.addEventListener('mousemove', moveThumbPreview);
	root.addEventListener('mouseleave', function () {
		if (!list) hideThumbPreview();
	});

	Object.defineProperty(root, 'value', {
		get: function () { return current; },
		set: function (v) {
			current = names.indexOf(v) >= 0 ? v : '';
			render();
		}
	});
	render();
	return root;
}

function createLipSyncCard(compId, title, speaker, map, layerNames, saved) {
	var card = document.createElement('div');
	card.className = 'lipsync-card' + (saved ? '' : ' unsaved');
	card.dataset.compId = compId;

	var titleDiv = document.createElement('div');
	titleDiv.className = 'lipsync-card-title';
	titleDiv.textContent = title;
	titleDiv.title = title;
	card.appendChild(titleDiv);

	var speakerField = document.createElement('div');
	speakerField.className = 'lipsync-field';
	var speakerLabel = document.createElement('label');
	speakerLabel.textContent = '話者名 (音声ファイル名から抽出される名前)';
	var speakerInput = document.createElement('input');
	speakerInput.type = 'text';
	speakerInput.value = speaker;
	speakerField.appendChild(speakerLabel);
	speakerField.appendChild(speakerInput);
	card.appendChild(speakerField);

	var markUnsaved = function () { card.classList.add('unsaved'); };
	speakerInput.addEventListener('input', markUnsaved);

	var mapDiv = document.createElement('div');
	mapDiv.className = 'lipsync-map';
	var selects = {};
	LIPSYNC_SHAPES.forEach(function (shape) {
		var label = document.createElement('label');
		label.textContent = shape.label;
		var select = createThumbSelect(layerNames, function (name) {
			return getLipSyncLayerThumb(compId, name);
		}, markUnsaved);
		select.value = map[shape.key] || '';

		selects[shape.key] = select;
		mapDiv.appendChild(label);
		mapDiv.appendChild(select);
	});
	card.appendChild(mapDiv);

	var actions = document.createElement('div');
	actions.className = 'lipsync-actions';
	var saveBtn = document.createElement('button');
	saveBtn.textContent = '保存';
	var deleteBtn = document.createElement('button');
	deleteBtn.textContent = '削除';
	actions.appendChild(saveBtn);
	actions.appendChild(deleteBtn);
	card.appendChild(actions);

	saveBtn.onclick = function () {
		var name = speakerInput.value.trim();
		if (!name) {
			alert('話者名を入力してください。');
			return;
		}
		var newMap = {};
		var missing = [];
		LIPSYNC_SHAPES.forEach(function (shape) {
			newMap[shape.key] = selects[shape.key].value;
			if (!newMap[shape.key]) missing.push(shape.label);
		});
		if (missing.length > 0) {
			alert('口差分が選択されていません: ' + missing.join('、') + '\n同じ差分を複数の母音に割り当てることもできます。');
			return;
		}

		var duplicated = false;
		document.querySelectorAll('#lipsync-config-list .lipsync-card').forEach(function (other) {
			if (other !== card && other.querySelector('input').value.trim() === name) duplicated = true;
		});
		if (duplicated && !confirm('話者名「' + name + '」は他のキャラクターにも設定されています。口パク生成時はどちらか一方のみ使われます。保存しますか？')) {
			return;
		}

		var cfg = { compId: compId, speaker: name, map: newMap };
		csInterface.evalScript('saveLipSyncConfig(' + JSON.stringify(JSON.stringify(cfg)) + ')', function (res) {
			var data;
			try { data = JSON.parse(res); } catch (e) { data = { status: 'error', message: res }; }
			if (data.status === 'success') {
				saved = true;
				speakerInput.value = name;
				card.classList.remove('unsaved');
			} else {
				alert('保存に失敗しました: ' + data.message);
			}
		});
	};

	deleteBtn.onclick = function () {
		var removeCard = function () {
			card.parentNode.removeChild(card);
			updateLipSyncEmptyMessage();
			refreshLipSyncCandidates();
		};
		if (!saved) {
			removeCard();
			return;
		}
		if (!confirm('「' + title + '」の口パク設定を削除しますか？')) return;
		csInterface.evalScript('deleteLipSyncConfig(' + compId + ')', function (res) {
			var data;
			try { data = JSON.parse(res); } catch (e) { data = { status: 'error', message: res }; }
			if (data.status === 'success') {
				removeCard();
			} else {
				alert('削除に失敗しました: ' + data.message);
			}
		});
	};

	return card;
}

function generateLipSync() {
	var statusDiv = document.getElementById('status-lipsync');
	var settings = loadLipSyncSettings();
	statusDiv.textContent = "生成中...";
	statusDiv.style.color = "#eeeeee";
	statusDiv.style.fontWeight = "normal";

	csInterface.evalScript('generateLipSync(' + JSON.stringify(JSON.stringify(settings)) + ')', function (res) {
		var data;
		try { data = JSON.parse(res); } catch (e) { data = { status: 'error', message: res }; }

		if (data.status !== 'success') {
			statusDiv.textContent = data.message;
			statusDiv.style.color = "#ff4444";
			statusDiv.style.fontWeight = "bold";
			return;
		}

		var okCount = 0;
		var lines = [];
		data.results.forEach(function (r) {
			if (r.status === 'ok') {
				okCount++;
			} else {
				lines.push('・' + r.layer + ': ' + r.message);
			}
		});
		var summary = "口パク生成: " + okCount + "件";
		if (lines.length > 0) summary += " / 未処理: " + lines.length + "件";
		statusDiv.textContent = [summary].concat(lines).join('\n');
		statusDiv.style.color = lines.length === 0 ? "#4CAF50" : (okCount > 0 ? "#eebb00" : "#ff4444");
		statusDiv.style.fontWeight = "bold";
	});
}

// ------ Silence Cut ------

var SILENCE_SETTINGS_KEY = 'psdtool_silence_settings';
var SILENCE_WINDOW_SEC = 0.01;    // 音量を測る窓の長さ
var SILENCE_BRIDGE_SEC = 0.05;    // これより短い音量の落ち込みは発話の一部とみなす
var SILENCE_MIN_VOICE_SEC = 0.05; // これより短い有音 (クリックノイズなど) は無視する

function loadSilenceSettings() {
	var settings = { thresholdDb: -50, paddingMs: 100, split: false, minGapMs: 500, ripple: false };
	try {
		var saved = JSON.parse(localStorage.getItem(SILENCE_SETTINGS_KEY));
		if (saved) {
			Object.keys(settings).forEach(function (key) {
				if (typeof saved[key] === typeof settings[key]) settings[key] = saved[key];
			});
		}
	} catch (e) { }
	return settings;
}

function saveSilenceSettingsFromForm() {
	var threshold = parseFloat(document.getElementById('silence-threshold').value);
	var padding = parseInt(document.getElementById('silence-padding').value, 10);
	var minGap = parseInt(document.getElementById('silence-min-gap').value, 10);
	var split = document.getElementById('silence-split').checked;
	localStorage.setItem(SILENCE_SETTINGS_KEY, JSON.stringify({
		thresholdDb: isNaN(threshold) ? -50 : Math.min(threshold, 0),
		paddingMs: isNaN(padding) || padding < 0 ? 0 : padding,
		split: split,
		minGapMs: isNaN(minGap) || minGap < 50 ? 50 : minGap,
		ripple: document.getElementById('silence-ripple').checked
	}));
	document.getElementById('silence-min-gap').disabled = !split;
}

function openSilenceModal() {
	var settings = loadSilenceSettings();
	document.getElementById('silence-threshold').value = settings.thresholdDb;
	document.getElementById('silence-padding').value = settings.paddingMs;
	document.getElementById('silence-split').checked = settings.split;
	document.getElementById('silence-min-gap').value = settings.minGapMs;
	document.getElementById('silence-min-gap').disabled = !settings.split;
	document.getElementById('silence-ripple').checked = settings.ripple;
	document.getElementById('silence-modal').style.display = 'block';
}

function closeSilenceModal() {
	document.getElementById('silence-modal').style.display = 'none';
}

// WAV ファイルを読み込み、窓ごとの音量 (全チャンネルの RMS, dBFS) を返す
function readWavLevels(path) {
	var res = window.cep.fs.readFile(path, window.cep.encoding.Base64);
	if (res.err !== 0) throw new Error('ファイルを読み込めません (エラー ' + res.err + ')');
	var bin = atob(res.data);
	var bytes = new Uint8Array(bin.length);
	for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	var view = new DataView(bytes.buffer);

	var tag = function (pos) {
		return String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
	};
	if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('WAVファイルではありません');

	var fmt = null;
	var dataPos = -1;
	var dataSize = 0;
	for (var pos = 12; pos + 8 <= bytes.length;) {
		var id = tag(pos);
		var size = view.getUint32(pos + 4, true);
		var body = pos + 8;
		if (id === 'fmt ') {
			fmt = {
				format: view.getUint16(body, true),
				channels: view.getUint16(body + 2, true),
				sampleRate: view.getUint32(body + 4, true),
				bits: view.getUint16(body + 14, true)
			};
			// WAVE_FORMAT_EXTENSIBLE は SubFormat の先頭 2 バイトが実際の形式
			if (fmt.format === 0xFFFE && size >= 26) fmt.format = view.getUint16(body + 24, true);
		} else if (id === 'data') {
			dataPos = body;
			dataSize = Math.min(size, bytes.length - body);
			break;
		}
		pos = body + size + (size & 1);
	}
	if (!fmt || dataPos < 0 || fmt.channels === 0) throw new Error('WAVファイルの形式が正しくありません');

	var read;
	if (fmt.format === 1 && fmt.bits === 8) read = function (p) { return (bytes[p] - 128) / 128; };
	else if (fmt.format === 1 && fmt.bits === 16) read = function (p) { return view.getInt16(p, true) / 32768; };
	else if (fmt.format === 1 && fmt.bits === 24) read = function (p) { return ((view.getInt8(p + 2) << 16) | (bytes[p + 1] << 8) | bytes[p]) / 8388608; };
	else if (fmt.format === 1 && fmt.bits === 32) read = function (p) { return view.getInt32(p, true) / 2147483648; };
	else if (fmt.format === 3 && fmt.bits === 32) read = function (p) { return view.getFloat32(p, true); };
	else if (fmt.format === 3 && fmt.bits === 64) read = function (p) { return view.getFloat64(p, true); };
	else throw new Error('未対応のWAV形式です (format ' + fmt.format + ', ' + fmt.bits + 'bit)');

	var bytesPerSample = fmt.bits / 8;
	var blockAlign = fmt.channels * bytesPerSample;
	var frameCount = Math.floor(dataSize / blockAlign);
	var win = Math.max(1, Math.round(fmt.sampleRate * SILENCE_WINDOW_SEC));
	var db = new Float32Array(Math.ceil(frameCount / win));
	for (var w = 0; w < db.length; w++) {
		var f0 = w * win;
		var f1 = Math.min(f0 + win, frameCount);
		var sum = 0;
		for (var p = dataPos + f0 * blockAlign, end = dataPos + f1 * blockAlign; p < end; p += bytesPerSample) {
			var v = read(p);
			sum += v * v;
		}
		db[w] = 10 * Math.log10(sum / ((f1 - f0) * fmt.channels));
	}
	return { db: db, windowSec: win / fmt.sampleRate, duration: frameCount / fmt.sampleRate };
}

// 間隔が maxGap 未満の区間同士を結合する
function mergeRanges(ranges, maxGap) {
	var merged = [];
	ranges.forEach(function (r) {
		var last = merged[merged.length - 1];
		if (last && r[0] - last[1] < maxGap) {
			last[1] = Math.max(last[1], r[1]);
		} else {
			merged.push([r[0], r[1]]);
		}
	});
	return merged;
}

// 残す区間 [[start, end], ...] (ファイル先頭からの秒) を求める
function detectVoicedRanges(levels, settings) {
	var win = levels.windowSec;
	var runs = [];
	var start = -1;
	for (var i = 0; i <= levels.db.length; i++) {
		var loud = i < levels.db.length && levels.db[i] > settings.thresholdDb;
		if (loud && start < 0) start = i;
		if (!loud && start >= 0) {
			runs.push([start * win, Math.min(i * win, levels.duration)]);
			start = -1;
		}
	}

	// 発話中の短い落ち込みをつなげてから、孤立した短いノイズを除く
	runs = mergeRanges(runs, SILENCE_BRIDGE_SEC).filter(function (r) {
		return r[1] - r[0] >= SILENCE_MIN_VOICE_SEC;
	});
	// 分割しない場合は全体を 1 区間にまとめる (先頭と末尾だけを削る)
	runs = mergeRanges(runs, settings.split ? settings.minGapMs / 1000 : Infinity);

	var pad = settings.paddingMs / 1000;
	return mergeRanges(runs.map(function (r) {
		return [Math.max(0, r[0] - pad), Math.min(levels.duration, r[1] + pad)];
	}), 0);
}

function cutSilence() {
	var statusDiv = document.getElementById('status-silence');
	var settings = loadSilenceSettings();
	var showError = function (message) {
		statusDiv.textContent = message;
		statusDiv.style.color = "#ff4444";
		statusDiv.style.fontWeight = "bold";
	};
	statusDiv.textContent = "解析中...";
	statusDiv.style.color = "#eeeeee";
	statusDiv.style.fontWeight = "normal";

	csInterface.evalScript('getSelectedAudioLayers()', function (res) {
		var data;
		try { data = JSON.parse(res); } catch (e) { data = { status: 'error', message: res }; }
		if (data.status !== 'success') {
			showError(data.message);
			return;
		}

		// 同じファイルを使うレイヤーが複数あっても解析は 1 回
		var levelsByPath = {};
		var items = [];
		var lines = [];
		data.layers.forEach(function (layer) {
			if (layer.message) {
				lines.push('・' + layer.name + ': ' + layer.message);
				return;
			}
			try {
				if (!levelsByPath[layer.path]) levelsByPath[layer.path] = readWavLevels(layer.path);
				items.push({ index: layer.index, path: layer.path, ranges: detectVoicedRanges(levelsByPath[layer.path], settings) });
			} catch (e) {
				lines.push('・' + layer.name + ': ' + e.message);
			}
		});
		if (items.length === 0) {
			showError(["無音カット: 0件"].concat(lines).join('\n'));
			return;
		}

		var opt = { compId: data.compId, ripple: settings.ripple, items: items };
		csInterface.evalScript('applySilenceCut(' + JSON.stringify(JSON.stringify(opt)) + ')', function (res2) {
			var result;
			try { result = JSON.parse(res2); } catch (e) { result = { status: 'error', message: res2 }; }
			if (result.status !== 'success') {
				showError(result.message);
				return;
			}

			var okLines = [];
			result.results.forEach(function (r) {
				(r.status === 'ok' ? okLines : lines).push('・' + r.layer + ': ' + r.message);
			});
			var summary = "無音カット: " + okLines.length + "件";
			if (lines.length > 0) summary += " / 未処理: " + lines.length + "件";
			statusDiv.textContent = [summary].concat(okLines, lines).join('\n');
			statusDiv.style.color = lines.length === 0 ? "#4CAF50" : (okLines.length > 0 ? "#eebb00" : "#ff4444");
			statusDiv.style.fontWeight = "bold";
		});
	});
}
