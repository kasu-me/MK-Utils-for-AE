
// JSON Polyfill (Minimal)
if (typeof JSON !== 'object') {
	JSON = {};
}
(function () {
	'use strict';
	function f(n) { return n < 10 ? '0' + n : n; }
	if (typeof Date.prototype.toJSON !== 'function') {
		Date.prototype.toJSON = function () {
			return isFinite(this.valueOf())
				? this.getUTCFullYear() + '-' +
				f(this.getUTCMonth() + 1) + '-' +
				f(this.getUTCDate()) + 'T' +
				f(this.getUTCHours()) + ':' +
				f(this.getUTCMinutes()) + ':' +
				f(this.getUTCSeconds()) + 'Z'
				: null;
		};
		String.prototype.toJSON = Number.prototype.toJSON = Boolean.prototype.toJSON = function () { return this.valueOf(); };
	}
	var cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
		escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
		meta = { '\b': '\\b', '\t': '\\t', '\n': '\\n', '\f': '\\f', '\r': '\\r', '"': '\\"', '\\': '\\\\' };
	function quote(string) {
		escapable.lastIndex = 0;
		return escapable.test(string) ? '"' + string.replace(escapable, function (a) {
			var c = meta[a];
			return typeof c === 'string' ? c : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
		}) + '"' : '"' + string + '"';
	}
	function str(key, holder) {
		var i, k, v, length, mind = gap, partial, value = holder[key];
		if (value && typeof value === 'object' && typeof value.toJSON === 'function') { value = value.toJSON(key); }
		if (typeof rep === 'function') { value = rep.call(holder, key, value); }
		switch (typeof value) {
			case 'string': return quote(value);
			case 'number': return isFinite(value) ? String(value) : 'null';
			case 'boolean':
			case 'null': return String(value);
			case 'object':
				if (!value) return 'null';
				gap += indent;
				partial = [];
				if (Object.prototype.toString.apply(value) === '[object Array]') {
					length = value.length;
					for (i = 0; i < length; i += 1) { partial[i] = str(i, value) || 'null'; }
					v = partial.length === 0 ? '[]' : gap ? '[\n' + gap + partial.join(',\n' + gap) + '\n' + mind + ']' : '[' + partial.join(',') + ']';
					gap = mind;
					return v;
				}
				if (rep && typeof rep === 'object') {
					length = rep.length;
					for (i = 0; i < length; i += 1) { if (typeof rep[i] === 'string') { k = rep[i]; v = str(k, value); if (v) { partial.push(quote(k) + (gap ? ': ' : ':') + v); } } }
				} else {
					for (k in value) { if (Object.prototype.hasOwnProperty.call(value, k)) { v = str(k, value); if (v) { partial.push(quote(k) + (gap ? ': ' : ':') + v); } } }
				}
				v = partial.length === 0 ? '{}' : gap ? '{\n' + gap + partial.join(',\n' + gap) + '\n' + mind + '}' : '{' + partial.join(',') + '}';
				gap = mind;
				return v;
		}
	}
	if (typeof JSON.stringify !== 'function') {
		var gap, indent, rep;
		JSON.stringify = function (value, replacer, space) {
			var i; gap = ''; indent = '';
			if (typeof space === 'number') { for (i = 0; i < space; i += 1) { indent += ' '; } }
			else if (typeof space === 'string') { indent = space; }
			rep = replacer;
			if (replacer && typeof replacer !== 'function' && (typeof replacer !== 'object' || typeof replacer.length !== 'number')) { throw new Error('JSON.stringify'); }
			return str('', { '': value });
		};
	}
	if (typeof JSON.parse !== 'function') {
		JSON.parse = function (text) { return eval('(' + text + ')'); };
	}
}());

// Main Functions

function importPSD() {
	try {
		var importOptions = new ImportOptions();
		var f = File.openDialog("PSDファイルを選択してください", "*.psd");
		if (!f) return JSON.stringify({ status: "cancelled" });

		importOptions.file = f;
		importOptions.importAs = ImportAsType.COMP;
		importOptions.sequence = false;

		var importedItem = app.project.importFile(importOptions);

		// インポートされたコンポジションを開く
		if (importedItem instanceof CompItem) {
			importedItem.openInViewer();
			return JSON.stringify({ status: "success", compId: importedItem.id, compName: importedItem.name });
		} else {
			// フォルダとしてインポートされた場合（編集可能なレイヤースタイルなど）
			// コンポジションを探す
			return JSON.stringify({ status: "success", message: "Imported but comp ID logic might need check" });
		}

	} catch (e) {
		return JSON.stringify({ status: "error", message: e.toString() });
	}
}

// ---------------------------------------------------------
// Keyframe Operations
// ---------------------------------------------------------

var g_storedKeyframes = []; // Array of { prop: Property, keyIndex: number, layerChain: Array<Layer> }

function getKeyframesFromActiveComp(isShift) {
	try {
		g_storedKeyframes = [];
		var comp = app.project.activeItem;
		if (!comp || !(comp instanceof CompItem)) {
			return "false";
		}

		// 再帰的にキーフレームを収集
		// rootCompTime, layerChain=[]
		collectKeysForMove(comp, comp.time, [], isShift);

		if (g_storedKeyframes.length > 0) {
			return "true";
		}
		return "false";
	} catch (e) {
		alert("Error in getKeyframesFromActiveComp: " + e.toString());
		return "false";
	}
}

function collectKeysForMove(comp, time, layerChain, isShift) {
	for (var i = 1; i <= comp.numLayers; i++) {
		var layer = comp.layer(i);

		// Scan properties of this layer first using current comp time
		// Pass layerChain from parent context (do not include current layer yet)
		scanPropsForMove(layer, time, layerChain, isShift);

		// If it's a pre-comp, recurse
		if (layer.source instanceof CompItem) {
			// Calculate inner time for the pre-comp
			// Simple Formula: (parentTime - startTime) * (100 / stretch)
			// Note: Does not support Time Remap for now.
			var localTime = (time - layer.startTime) * (100 / layer.stretch);

			var newChain = layerChain.concat([]); // shallow copy
			newChain.push(layer);

			collectKeysForMove(layer.source, localTime, newChain, isShift);
		}
	}
}

function scanPropsForMove(propGroup, time, layerChain, isShift) {
	// Traverse properties
	var numProps = propGroup.numProperties;
	if (!numProps) return;

	for (var i = 1; i <= numProps; i++) {
		var prop = propGroup.property(i);

		if (prop.propertyType === PropertyType.PROPERTY) {
			if (prop.numKeys > 0) {
				if (isShift) {
					// 現在の時間以降の全てのキーを取得
					for (var k = 1; k <= prop.numKeys; k++) {
						if (prop.keyTime(k) >= time - 0.0001) {
							g_storedKeyframes.push({
								property: prop,
								keyIndex: k,
								layerChain: layerChain
							});
						}
					}
				} else {
					// Check if there is a keyframe at 'time'
					var nearestIndex = prop.nearestKeyIndex(time);

					// If no keys, nearestKeyIndex might return 0 or 1 depending on AE version/state, check bounds
					if (nearestIndex > 0 && nearestIndex <= prop.numKeys) {
						var keyTime = prop.keyTime(nearestIndex);

						// Tolerance for floating point comparison (e.g. 1/frameRate is too large, use small epsilon)
						// 0.0001 is usually enough (1/30 frame is ~0.033)
						if (Math.abs(keyTime - time) < 0.0001) {
							// Found a keyframe!
							g_storedKeyframes.push({
								property: prop,
								keyIndex: nearestIndex,
								layerChain: layerChain
							});
						}
					}
				}
			}
		} else if (prop.propertyType === PropertyType.NAMED_GROUP || prop.propertyType === PropertyType.INDEXED_GROUP) {
			scanPropsForMove(prop, time, layerChain, isShift);
		}
	}
}

function localTimeToRootTime(localTime, layerChain) {
	var time = localTime;
	for (var j = layerChain.length - 1; j >= 0; j--) {
		var layer = layerChain[j];
		time = time * (layer.stretch / 100) + layer.startTime;
	}
	return time;
}

function rootTimeToLocalTime(rootTime, layerChain) {
	var targetTime = rootTime;
	for (var j = 0; j < layerChain.length; j++) {
		var layer = layerChain[j];
		targetTime = (targetTime - layer.startTime) * (100 / layer.stretch);
	}
	return targetTime;
}

function moveKeyframesToCurrentTime() {
	try {
		if (g_storedKeyframes.length === 0) {
			return JSON.stringify({ status: "error", message: "記録中のキーフレームがありません (Memory Empty)" });
		}

		var rootComp = app.project.activeItem;
		if (!rootComp || !(rootComp instanceof CompItem)) {
			return JSON.stringify({ status: "error", message: "コンポジションがアクティブではありません" });
		}

		var rootTime = rootComp.time;

		var minRootTime = null;
		var keyDataList = [];
		for (var i = 0; i < g_storedKeyframes.length; i++) {
			var item = g_storedKeyframes[i];
			var prop = item.property;
			if (!prop.canVaryOverTime) continue;

			var oldLocalTime = prop.keyTime(item.keyIndex);
			var oldRootTime = localTimeToRootTime(oldLocalTime, item.layerChain);

			if (minRootTime === null || oldRootTime < minRootTime) {
				minRootTime = oldRootTime;
			}

			keyDataList.push({
				originalItem: item,
				oldRootTime: oldRootTime
			});
		}

		if (keyDataList.length === 0) {
			return JSON.stringify({ status: "error", message: "移動可能なキーフレームがありません" });
		}

		var offsetRootTime = rootTime - minRootTime;

		var groupedProps = [];
		for (var i = 0; i < keyDataList.length; i++) {
			var data = keyDataList[i];
			var item = data.originalItem;
			var prop = item.property;

			var newRootTime = data.oldRootTime + offsetRootTime;
			var newLocalTime = rootTimeToLocalTime(newRootTime, item.layerChain);

			var kAttr = extractKeyframeData(prop, item.keyIndex);
			if (!kAttr) continue;

			kAttr.newLocalTime = newLocalTime;
			kAttr.oldKeyIndex = item.keyIndex;

			var foundGroup = null;
			for (var g = 0; g < groupedProps.length; g++) {
				if (groupedProps[g].prop === prop) {
					foundGroup = groupedProps[g];
					break;
				}
			}
			if (!foundGroup) {
				foundGroup = { prop: prop, keys: [] };
				groupedProps.push(foundGroup);
			}
			foundGroup.keys.push(kAttr);
		}

		var successCount = 0;
		var failCount = 0;
		var details = "";

		app.beginUndoGroup("Move Keyframes via Script");

		for (var g = 0; g < groupedProps.length; g++) {
			var group = groupedProps[g];
			var prop = group.prop;
			var keys = group.keys;

			keys.sort(function (a, b) { return b.oldKeyIndex - a.oldKeyIndex; });

			for (var k = 0; k < keys.length; k++) {
				try {
					prop.removeKey(keys[k].oldKeyIndex);
				} catch (e) { }
			}

			keys.sort(function (a, b) { return a.newLocalTime - b.newLocalTime; });

			for (var k = 0; k < keys.length; k++) {
				try {
					applyKeyframeData(prop, keys[k]);
					successCount++;
				} catch (e) {
					failCount++;
					details += "AddError " + prop.name + "; ";
				}
			}
		}

		g_storedKeyframes = [];
		app.endUndoGroup();

		if (successCount > 0) {
			return JSON.stringify({ status: "success", message: "Moved " + successCount + " keys (" + failCount + " failed)" });
		} else {
			return JSON.stringify({ status: "error", message: "移動失敗 (成功0, 失敗" + failCount + "): " + details });
		}

	} catch (e) {
		return JSON.stringify({ status: "error", message: "Fatal Error: " + e.toString() });
	}
}

function extractKeyframeData(prop, keyIndex) {
	try {
		var data = {};
		data.value = prop.keyValue(keyIndex);

		data.inTempEase = prop.keyInTemporalEase(keyIndex);
		data.outTempEase = prop.keyOutTemporalEase(keyIndex);
		data.inInterp = prop.keyInInterpolationType(keyIndex);
		data.outInterp = prop.keyOutInterpolationType(keyIndex);
		data.tempCont = prop.keyTemporalContinuous(keyIndex);
		data.tempAuto = prop.keyTemporalAutoBezier(keyIndex);

		var isSpatial = (prop.propertyValueType === PropertyValueType.TwoD_SPATIAL || prop.propertyValueType === PropertyValueType.ThreeD_SPATIAL);
		data.isSpatial = isSpatial;

		if (isSpatial) {
			data.inSpat = prop.keyInSpatialTangent(keyIndex);
			data.outSpat = prop.keyOutSpatialTangent(keyIndex);
			data.spatAuto = prop.keySpatialAutoBezier(keyIndex);
			data.spatCont = prop.keySpatialContinuous(keyIndex);
			try { data.roving = prop.keyRoving(keyIndex); } catch (e) { data.roving = false; }
		}
		return data;
	} catch (e) {
		return null;
	}
}

function applyKeyframeData(prop, data) {
	var newKeyIndex = prop.addKey(data.newLocalTime);
	if (data.value !== null) prop.setValueAtKey(newKeyIndex, data.value);

	if (data.inTempEase && data.outTempEase) prop.setTemporalEaseAtKey(newKeyIndex, data.inTempEase, data.outTempEase);
	prop.setInterpolationTypeAtKey(newKeyIndex, data.inInterp, data.outInterp);

	if (data.isSpatial) {
		if (data.inSpat && data.outSpat) {
			prop.setSpatialTangentsAtKey(newKeyIndex, data.inSpat, data.outSpat);
		}
		prop.setSpatialAutoBezierAtKey(newKeyIndex, data.spatAuto);
		prop.setSpatialContinuousAtKey(newKeyIndex, data.spatCont);
		try { prop.setRovingAtKey(newKeyIndex, data.roving); } catch (e) { }
	}

	prop.setTemporalContinuousAtKey(newKeyIndex, data.tempCont);
	prop.setTemporalAutoBezierAtKey(newKeyIndex, data.tempAuto);
}

function removeKeyframesAtCurrentTime(isShift, isSelectedOnly) {
	var undoName = "Remove Keyframes at Current Time";
	var comp = app.project.activeItem;
	if (!comp || !(comp instanceof CompItem)) {
		return JSON.stringify({ status: "error", message: "コンポジションがアクティブではありません" });
	}

	var selectedLayers = null;
	if (isSelectedOnly) {
		selectedLayers = comp.selectedLayers;
		if (!selectedLayers || selectedLayers.length === 0) {
			return JSON.stringify({ status: "error", message: "レイヤーが選択されていません" });
		}
	}

	app.beginUndoGroup(undoName);

	try {
		var counter = { count: 0 };
		if (selectedLayers) {
			// 選択レイヤーと、プリコンポの場合はその中身を対象
			for (var i = 0; i < selectedLayers.length; i++) {
				removeKeysFromLayerTree(selectedLayers[i], comp.time, counter, isShift);
			}
		} else {
			removeKeysRecursive(comp, comp.time, counter, isShift);
		}

		if (counter.count > 0) {
			// Undoグループを閉じるには正常終了後に閉じる必要があるが、
			// エラー時はfinallyなどで閉じられるようにすべきか、
			// あるいはここで閉じてから結果を返す。
			app.endUndoGroup();
			return JSON.stringify({ status: "success", count: counter.count });
		} else {
			// 何も削除しなかった場合でもUndo履歴に残したくない場合はキャンセル扱いにする手もあるが、
			// ユーザーが「削除を実行したが何もなかった」とわかるようにそのまま終了する。
			app.endUndoGroup();
			return JSON.stringify({ status: "error", message: "削除対象のキーフレームが見つかりませんでした" });
		}
	} catch (e) {
		app.endUndoGroup(); // エラー時も閉じる
		return JSON.stringify({ status: "error", message: "Fatal Error: " + e.toString() });
	}
}

function removeKeysRecursive(comp, time, counter, isShift) {
	for (var i = 1; i <= comp.numLayers; i++) {
		removeKeysFromLayerTree(comp.layer(i), time, counter, isShift);
	}
}

// レイヤー自身のキーを削除し、プリコンポなら中身も再帰的に削除する
function removeKeysFromLayerTree(layer, time, counter, isShift) {
	// プリコンポ内の時間を先に計算する
	// （先に自身のキーを消すとタイムリマップの値が変わってしまうため）
	var innerTime = null;
	if (layer.source instanceof CompItem) {
		if (layer.timeRemapEnabled) {
			// タイムリマップ有効の場合、現在時刻でのタイムリマップ値を使用
			var trProp = layer.property("Time Remap");
			if (trProp) {
				innerTime = trProp.valueAtTime(time, false);
			}
		} else {
			// 通常の時間計算
			// comp time -> layer local time -> source comp time
			// stretch: 100 means 100% speed. stretch 200 means 50% speed (2x duration).
			// Correct formula: (time - layer.startTime) * (100 / layer.stretch)
			innerTime = (time - layer.startTime) * (100 / layer.stretch);
		}
	}

	// 現在のレイヤーのプロパティからキーを削除
	removeKeysFromLayer(layer, time, counter, isShift);

	// If it's a pre-comp, recurse
	if (innerTime !== null) {
		removeKeysRecursive(layer.source, innerTime, counter, isShift);
	}
}

function removeKeysFromLayer(propGroup, time, counter, isShift) {
	var numProps = propGroup.numProperties;
	if (!numProps) return;

	for (var i = 1; i <= numProps; i++) {
		var prop = propGroup.property(i);

		if (prop.propertyType === PropertyType.PROPERTY) {
			if (prop.numKeys > 0) {
				if (isShift) {
					for (var k = prop.numKeys; k >= 1; k--) {
						var keyTime = prop.keyTime(k);
						if (keyTime >= time - 0.0001) {
							prop.removeKey(k);
							counter.count++;
						}
					}
				} else {
					var nearestIndex = prop.nearestKeyIndex(time);

					if (nearestIndex > 0 && nearestIndex <= prop.numKeys) {
						var keyTime = prop.keyTime(nearestIndex);

						if (Math.abs(keyTime - time) < 0.0001) {
							prop.removeKey(nearestIndex);
							counter.count++;
						}
					}
				}
			}
		} else if (prop.propertyType === PropertyType.NAMED_GROUP || prop.propertyType === PropertyType.INDEXED_GROUP) {
			removeKeysFromLayer(prop, time, counter, isShift);
		}
	}
}

function getHierarchy() {
	var comp = app.project.activeItem;
	if (!(comp instanceof CompItem)) {
		return JSON.stringify({ status: "error", message: "コンポジションを選択してください。" });
	}

	var projectPath = "";
	if (app.project.file) {
		projectPath = app.project.file.fsName;
	}

	var root = {
		name: comp.name,
		id: comp.id,
		projectPath: projectPath,
		type: "root",
		children: parseComp(comp)
	};
	return JSON.stringify(root);
}

function parseComp(comp) {
	var children = [];
	for (var i = 1; i <= comp.numLayers; i++) {
		var layer = comp.layer(i);
		var item = {
			index: layer.index,
			layerId: layer.id, // CSInterface / modern AE needed
			name: layer.name,
			visible: layer.enabled, // 簡易的な表示状態 (目のアイコン)
			opacity: layer.opacity.value // 不透明度
		};

		// レイヤ名の接頭辞判定
		if (item.name.indexOf("*") === 0) item.mode = "radio";
		else if (item.name.indexOf("!") === 0) item.mode = "locked";
		else item.mode = "check";

		// プリコンポジションの場合、再帰的に解析するか？
		// PSDToolの仕様上、フォルダはプリコンプになることが多い
		// ここでは、ソースがCompItemなら「フォルダ」扱いする
		if (layer.source instanceof CompItem) {
			item.type = "folder";
			item.compId = layer.source.id; // 子コンポジションのID
			// item.children = parseComp(layer.source); // ここで再帰すると巨大になる可能性があるが、構造把握には必要
			// 今回は、再帰的に取得する
			item.children = parseComp(layer.source);
		} else {
			item.type = "layer";
			// PSD から読み込んだレイヤーなら、サムネイル用に元ファイルと PSD 上のレイヤー名を渡す
			var psd = getPsdSourceInfo(layer);
			if (psd) {
				item.psdFile = psd.file;
				item.psdName = psd.name;
			}
		}
		children.push(item);
	}
	return children;
}

// PSD の各レイヤーは「レイヤー名/ファイル名.psd」という名前のフッテージになる
function getPsdSourceInfo(layer) {
	var src = layer.source;
	if (!(src instanceof FootageItem) || !(src.mainSource instanceof FileSource) || !src.mainSource.file) return null;
	var path = src.mainSource.file.fsName;
	if (!/\.(psd|psb)$/i.test(path)) return null;
	var slash = src.name.lastIndexOf("/");
	return { file: path, name: slash > 0 ? src.name.substring(0, slash) : layer.name };
}

// レイヤーの表示・非表示を切り替える（キーフレーム作成）
function setLayerVisibility(compId, layerIndex, visible) {
	var comp = getCompById(compId);
	if (!comp) return "error: comp not found";

	var layer = comp.layer(layerIndex);
	if (!layer) return "error: layer not found";

	// 表示状態の制御
	// PSDTool的なアプローチでは、Opacityで制御することが多い（フェードなどはしない前提）
	// あるいは「目のアイコン」 (enabled) だが、enabledはキーフレーム打てない。
	// Opacityにキーフレームを打つ。

	var opacityProp = layer.property("Opacity");
	var time = comp.time;
	var value = visible ? 100 : 0;

	// もしレイヤーが無効化(目のアイコンOFF)されていたら、表示時には有効化する
	if (visible) layer.enabled = true;

	// 現在の時間にキーフレームを追加
	var keyIndex = opacityProp.addKey(time);
	opacityProp.setValueAtKey(keyIndex, value);

	// ホールドキーフレームに設定 (ToggleHoldKeyframe 相当)
	opacityProp.setInterpolationTypeAtKey(keyIndex, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);

	return "success";
}

// 複数のレイヤーを一括設定（ラジオボタン用）
// targetLayerIndexをON、それ以外のsiblingsをOFFにする
function setRadioVisibility(compId, targetIndex, siblingIndices) {
	app.beginUndoGroup("Radio Visibility Change");
	var comp = getCompById(compId);
	if (!comp) return;

	var time = comp.time;

	// Target ON
	var targetLayer = comp.layer(targetIndex);
	if (targetLayer) targetLayer.enabled = true; // 強制的に有効化

	var tProp = targetLayer.property("Opacity");
	var tKey = tProp.addKey(time);
	tProp.setValueAtKey(tKey, 100);
	tProp.setInterpolationTypeAtKey(tKey, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);

	// Siblings OFF
	for (var i = 0; i < siblingIndices.length; i++) {
		var idx = siblingIndices[i];
		if (idx === targetIndex) continue;

		var layer = comp.layer(idx);
		// ロックされているものは無視するなど必要ならここで判定
		// レイヤ名の先頭が ! ならスキップ
		if (layer.name.indexOf("!") === 0) continue;

		var prop = layer.property("Opacity");
		var key = prop.addKey(time);
		prop.setValueAtKey(key, 0);
		prop.setInterpolationTypeAtKey(key, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
	}
	app.endUndoGroup();
	return "success";
}

function getCompById(id) {
	for (var i = 1; i <= app.project.numItems; i++) {
		var item = app.project.item(i);
		if (item instanceof CompItem && item.id == id) {
			return item;
		}
	}
	return null;
}

function applyVisibilityToCompRaw(comp, items) {
	var time = comp.time;
	for (var i = 0; i < items.length; i++) {
		var item = items[i];
		var layer = comp.layer(item.index);
		if (!layer) continue;
		if (layer.name.indexOf("!") === 0) continue;

		if (item.visible) layer.enabled = true;
		var prop = layer.property("Opacity");
		var keyIndex = prop.addKey(time);
		var val = item.visible ? 100 : 0;
		prop.setValueAtKey(keyIndex, val);
		prop.setInterpolationTypeAtKey(keyIndex, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
	}
}

// 全コンポジションに対して一括適用（単一のアンドゥグループ）
function applyGlobalBatchVisibility(globalDataStr) {
	app.beginUndoGroup("Apply Preset Global");
	try {
		var globalData = globalDataStr;
		if (typeof globalData === 'string') {
			try { globalData = JSON.parse(globalData); } catch (e) { }
		}

		if (!globalData || typeof globalData !== 'object') {
			return JSON.stringify({ status: "error", message: "Invalid data" });
		}

		for (var compId in globalData) {
			if (globalData.hasOwnProperty(compId)) {
				var comp = getCompById(compId);
				if (comp) {
					applyVisibilityToCompRaw(comp, globalData[compId]);
				}
			}
		}
	} catch (e) {
		return JSON.stringify({ status: "error", message: e.toString() });
	} finally {
		app.endUndoGroup();
	}
	return JSON.stringify({ status: "success" });
}

// プリセット用の一括適用
function applyBatchVisibility(compId, visibilityData) {
	app.beginUndoGroup("Apply Preset");
	var comp = getCompById(compId);
	if (!comp) {
		app.endUndoGroup();
		return JSON.stringify({ status: "error", message: "Comp not found" });
	}

	var data = visibilityData;
	if (typeof visibilityData === 'string') {
		try {
			data = JSON.parse(visibilityData);
		} catch (e) {
			app.endUndoGroup();
			return JSON.stringify({ status: "error", message: "Invalid JSON: " + e.message });
		}
	}

	if (!data || typeof data.length === 'undefined') {
		app.endUndoGroup();
		return JSON.stringify({ status: "error", message: "Data is not an array" });
	}

	applyVisibilityToCompRaw(comp, data);

	app.endUndoGroup();
	return JSON.stringify({ status: "success" });
}

var g_capturedKeyframes = [];

function captureKeyframes() {
	try {
		var comp = app.project.activeItem;
		if (!(comp instanceof CompItem)) {
			return JSON.stringify({ status: 'error', message: 'コンポジションを選択してください。' });
		}

		g_capturedKeyframes = [];
		// 再帰的に検索 (初期チェーンは空)
		scanLayersRecursive(comp, comp.time, []);

		return JSON.stringify({ status: 'success', count: g_capturedKeyframes.length });
	} catch (e) {
		return JSON.stringify({ status: 'error', message: e.toString() + ' (Line: ' + e.line + ')' });
	}
}

function scanLayersRecursive(comp, currentTime, layerChain) {
	for (var i = 1; i <= comp.numLayers; i++) {
		var layer = comp.layer(i);

		// 可視レイヤーのみ、あるいは選択レイヤーのみ？ -> 全レイヤー対象

		if (layer.source instanceof CompItem) {
			// プリコンポジションの場合 (レイヤー自体のプロパティもスキャンする)
			scanProperties(layer, currentTime, layerChain);

			// 内部時間の計算
			var childTime;
			if (layer.timeRemapEnabled) {
				// タイムリマップ有効時
				childTime = layer.property('Time Remap').valueAtTime(currentTime, false);
			} else {
				// 通常時: (親時間 - 開始時間) * (100 / ストレッチ)
				childTime = (currentTime - layer.startTime) * (100 / layer.stretch);
			}

			// 子コンポジションへ再帰 (チェーンにこのレイヤーを追加)
			var newChain = layerChain.concat(layer);
			scanLayersRecursive(layer.source, childTime, newChain);

		} else {
			// 通常レイヤー
			scanProperties(layer, currentTime, layerChain);
		}
	}
}

function scanProperties(propGroup, time, layerChain) {
	var numProps = 0;
	try { numProps = propGroup.numProperties; } catch (e) { return; }

	for (var i = 1; i <= numProps; i++) {
		var prop = propGroup.property(i);

		if (prop.propertyType === PropertyType.PROPERTY) {
			// プロパティの場合、キーフレームがあるかチェック
			if (prop.numKeys > 0) {
				// 指定時間の近くにキーフレームがあるか？
				var nearestKeyIndex = 0;
				try { nearestKeyIndex = prop.nearestKeyIndex(time); } catch (e) { continue; }

				if (nearestKeyIndex > 0) {
					var keyTime = prop.keyTime(nearestKeyIndex);
					// 許容誤差 (0.001s)
					var epsilon = 0.001;
					if (Math.abs(keyTime - time) < epsilon) {
						try {
							// ユーザー要件: "collects keyframes at the 'current playback head position' ... moves to the 'new current playback head position'"
							// ここでは、選択されているかどうかは確認せず、時間位置にあるものは全て拾う。

							g_capturedKeyframes.push({
								property: prop,
								keyIndex: nearestKeyIndex,
								originalTime: keyTime,
								layerChain: layerChain.slice() // Pathを保存
							});
						} catch (e) {
							// NOP
						}
					}
				}
			}
		} else if (prop.propertyType === PropertyType.NAMED_GROUP || prop.propertyType === PropertyType.INDEXED_GROUP) {
			// グループの場合、再帰
			scanProperties(prop, time, layerChain);
		}
	}
}


function moveKeyframes() {
	app.beginUndoGroup('Move Keyframes Hierarchy');
	try {
		var rootComp = app.project.activeItem;
		if (!(rootComp instanceof CompItem)) {
			return JSON.stringify({ status: 'error', message: 'コンポジションを選択してください。' });
		}

		var rootTime = rootComp.time;
		var movedCount = 0;

		for (var i = 0; i < g_capturedKeyframes.length; i++) {
			var item = g_capturedKeyframes[i];
			var prop = item.property;

			// プロパティ有効性チェック
			try {
				if (!prop.isValid) continue;
				if (prop.numKeys === 0) continue;
			} catch (e) { continue; }

			// ルート時間からローカル時間に変換
			var targetTime = rootTime;

			for (var j = 0; j < item.layerChain.length; j++) {
				var layer = item.layerChain[j];
				try {
					if (layer.timeRemapEnabled) {
						// タイムリマップ: 親時間におけるリマップ値が子の時間
						targetTime = layer.property('Time Remap').valueAtTime(targetTime, false);
					} else {
						targetTime = (targetTime - layer.startTime) * (100 / layer.stretch);
					}
				} catch (e) {
					// レイヤー喪失等
				}
			}

			// 移動処理
			// 1. 元のキーを探す (収集時と同じ時間にあるか？)
			var currentIndex = 0;
			// まずitem.keyIndexを確認
			if (prop.numKeys >= item.keyIndex && Math.abs(prop.keyTime(item.keyIndex) - item.originalTime) < 0.001) {
				currentIndex = item.keyIndex;
			} else {
				// インデックスずれの可能性
				currentIndex = prop.nearestKeyIndex(item.originalTime);
				if (Math.abs(prop.keyTime(currentIndex) - item.originalTime) > 0.001) {
					// キーが見つからない、移動済み、削除済み
					continue;
				}
			}

			// 元の時間と移動後の時間がほぼ同じなら何もしない
			if (Math.abs(targetTime - item.originalTime) < 0.001) continue;

			// キー情報の抽出・コピー
			var keyVal, inInterp, outInterp;
			var inTan, outTan, spatialInTan, spatialOutTan;
			var isSpatial = (prop.propertyValueType === PropertyValueType.TwoD_SPATIAL || prop.propertyValueType === PropertyValueType.ThreeD_SPATIAL);
			var roving = false;
			var tempAutoBezier, temporalContinuous;

			// コピー
			keyVal = prop.keyValue(currentIndex);
			inInterp = prop.keyInInterpolationType(currentIndex);
			outInterp = prop.keyOutInterpolationType(currentIndex);

			if (inInterp !== KeyframeInterpolationType.HOLD && inInterp !== KeyframeInterpolationType.LINEAR) {
				inTan = prop.keyInTemporalEase(currentIndex);
			}
			if (outInterp !== KeyframeInterpolationType.HOLD && outInterp !== KeyframeInterpolationType.LINEAR) {
				outTan = prop.keyOutTemporalEase(currentIndex);
			}

			if (isSpatial) {
				spatialInTan = prop.keyInSpatialTangent(currentIndex);
				spatialOutTan = prop.keyOutSpatialTangent(currentIndex);
				roving = prop.keyRoving(currentIndex);
			}

			tempAutoBezier = prop.keyTemporalAutoBezier(currentIndex);
			temporalContinuous = prop.keyTemporalContinuous(currentIndex);

			// 削除
			prop.removeKey(currentIndex);

			// 追加
			var newKeyIndex = prop.addKey(targetTime);

			// 値・補間設定
			if (keyVal !== null) prop.setValueAtKey(newKeyIndex, keyVal);

			if (inInterp && outInterp) {
				prop.setInterpolationTypeAtKey(newKeyIndex, inInterp, outInterp);
			}

			if (inTan && outTan) {
				prop.setTemporalEaseAtKey(newKeyIndex, inTan, outTan);
			}

			if (isSpatial) {
				prop.setSpatialTangentsAtKey(newKeyIndex, spatialInTan, spatialOutTan);
				prop.setRovingAtKey(newKeyIndex, roving); // Roving設定
			}

			prop.setTemporalAutoBezierAtKey(newKeyIndex, tempAutoBezier);
			prop.setTemporalContinuousAtKey(newKeyIndex, temporalContinuous);

			// 最後に選択
			prop.setSelectedAtKey(newKeyIndex, true);

			movedCount++;
		}

		return JSON.stringify({ status: 'success', count: movedCount });

	} catch (e) {
		return JSON.stringify({ status: 'error', message: e.toString() + ' (Line: ' + e.line + ')' });
	} finally {
		app.endUndoGroup();
	}
}

function moveTimeToSelectedLayerInPoint() {
	var comp = app.project.activeItem;
	if (!comp || !(comp instanceof CompItem)) {
		return "false";
	}
	var selectedLayers = comp.selectedLayers;
	if (selectedLayers.length > 0) {
		comp.time = selectedLayers[0].inPoint;
		return "true";
	}
	return "false";
}

// ---------------------------------------------------------
// LipSync (lab ファイルによる母音口パク)
// ---------------------------------------------------------
// 口パク設定は口差分フォルダ（プリコンプ）のコメント欄に JSON で保存する。
// プロジェクトファイル自体に保存されるため、テンプレートプロジェクトを複製しても設定が引き継がれる。
//   comment = "[psdtool_lipsync]" + JSON.stringify({ speaker: "音街ウナ", map: { a: "ワ", i: "にっ", ... } })

var LIPSYNC_COMMENT_PREFIX = "[psdtool_lipsync]";
var LIPSYNC_SHAPES = ["a", "i", "u", "e", "o", "n"];
var LIPSYNC_EPS = 0.0001;

// 母音 (大文字は無声化母音)
var LIPSYNC_VOWELS = { a: "a", i: "i", u: "u", e: "e", o: "o", A: "a", I: "i", U: "u", E: "e", O: "o" };
// 口を閉じる音素: 撥音・促音・無音・両唇音
var LIPSYNC_CLOSED = { N: true, cl: true, pau: true, sil: true, m: true, my: true, b: true, by: true, p: true, py: true };

// lab テキストを [{ start, end, ph }] (秒) に変換する。時刻の単位は 100ns。
function lipSyncParseLab(text) {
	var segs = [];
	var lines = text.split(/\r\n|\r|\n/);
	for (var i = 0; i < lines.length; i++) {
		var parts = lines[i].replace(/^\s+|\s+$/g, "").split(/\s+/);
		if (parts.length < 3) continue;
		var start = parseFloat(parts[0]);
		var end = parseFloat(parts[1]);
		if (isNaN(start) || isNaN(end)) continue;
		segs.push({ start: start / 10000000, end: end / 10000000, ph: parts[2] });
	}
	return segs;
}

// 音素列を口の形の区間列 [{ start, end, shape }] に変換する。
// 子音は直後の母音の形を先取りし、lab に行がない隙間は閉じ口で埋める。
function lipSyncBuildShapes(segs) {
	var out = [];
	for (var i = 0; i < segs.length; i++) {
		var seg = segs[i];
		var shape;
		if (LIPSYNC_VOWELS.hasOwnProperty(seg.ph)) {
			shape = LIPSYNC_VOWELS[seg.ph];
		} else if (LIPSYNC_CLOSED.hasOwnProperty(seg.ph)) {
			shape = "n";
		} else {
			var next = segs[i + 1];
			shape = (next && LIPSYNC_VOWELS.hasOwnProperty(next.ph)) ? LIPSYNC_VOWELS[next.ph] : "n";
		}

		var last = out[out.length - 1];
		if (last && seg.start > last.end + 0.0001) {
			out.push({ start: last.end, end: seg.start, shape: "n" });
		}
		out.push({ start: seg.start, end: seg.end, shape: shape });
	}
	return out;
}

// 秒単位の区間をフレーム単位 [{ f0, f1, shape }] に丸め、短すぎる区間と同じ形の連続をまとめる。
function lipSyncQuantize(shapes, toFrame, minFrames) {
	var segs = [];
	for (var i = 0; i < shapes.length; i++) {
		var f0 = toFrame(shapes[i].start);
		var f1 = toFrame(shapes[i].end);
		if (f1 > f0) segs.push({ f0: f0, f1: f1, shape: shapes[i].shape });
	}

	var merged = [];
	for (var j = 0; j < segs.length; j++) {
		var s = segs[j];
		var last = merged[merged.length - 1];
		if (last && (s.shape === last.shape || s.f1 - s.f0 < minFrames)) {
			last.f1 = s.f1;
		} else {
			merged.push({ f0: s.f0, f1: s.f1, shape: s.shape });
		}
	}

	// 先頭の短い区間は後ろへ吸収
	if (merged.length > 1 && merged[0].f1 - merged[0].f0 < minFrames) {
		merged[1].f0 = merged[0].f0;
		merged.shift();
	}

	// 吸収の結果、同じ形が隣り合ったものを結合
	var result = [];
	for (var k = 0; k < merged.length; k++) {
		var prev = result[result.length - 1];
		if (prev && prev.shape === merged[k].shape) {
			prev.f1 = merged[k].f1;
		} else {
			result.push(merged[k]);
		}
	}
	return result;
}

function lipSyncReadConfig(comp) {
	var c = comp.comment;
	if (!c || c.indexOf(LIPSYNC_COMMENT_PREFIX) !== 0) return null;
	try {
		return JSON.parse(c.substring(LIPSYNC_COMMENT_PREFIX.length));
	} catch (e) {
		return null;
	}
}

// 口差分コンポジションを使用している親コンポジション名 (表示用)
function lipSyncParentCompName(comp) {
	for (var i = 1; i <= app.project.numItems; i++) {
		var item = app.project.item(i);
		if (!(item instanceof CompItem)) continue;
		for (var j = 1; j <= item.numLayers; j++) {
			if (item.layer(j).source === comp) return item.name;
		}
	}
	return "";
}

function getLipSyncConfigs() {
	try {
		var configs = [];
		for (var i = 1; i <= app.project.numItems; i++) {
			var item = app.project.item(i);
			if (!(item instanceof CompItem)) continue;
			var cfg = lipSyncReadConfig(item);
			if (!cfg) continue;

			var layerNames = [];
			for (var j = 1; j <= item.numLayers; j++) layerNames.push(item.layer(j).name);

			configs.push({
				compId: item.id,
				compName: item.name,
				parentName: lipSyncParentCompName(item),
				speaker: cfg.speaker || "",
				map: cfg.map || {},
				layerNames: layerNames
			});
		}
		return JSON.stringify({ status: "success", configs: configs });
	} catch (e) {
		return JSON.stringify({ status: "error", message: e.toString() });
	}
}

function saveLipSyncConfig(configStr) {
	try {
		var cfg = JSON.parse(configStr);
		var comp = getCompById(cfg.compId);
		if (!comp) return JSON.stringify({ status: "error", message: "口差分のコンポジションが見つかりません" });

		if (comp.comment && comp.comment.indexOf(LIPSYNC_COMMENT_PREFIX) !== 0) {
			return JSON.stringify({ status: "error", message: "コンポジション「" + comp.name + "」のコメント欄が使用中のため保存できません。コメントを空にしてから再度保存してください。" });
		}

		app.beginUndoGroup("口パク設定を保存");
		comp.comment = LIPSYNC_COMMENT_PREFIX + JSON.stringify({ speaker: cfg.speaker, map: cfg.map });
		app.endUndoGroup();
		return JSON.stringify({ status: "success" });
	} catch (e) {
		return JSON.stringify({ status: "error", message: e.toString() });
	}
}

function deleteLipSyncConfig(compId) {
	try {
		var comp = getCompById(compId);
		if (!comp) return JSON.stringify({ status: "error", message: "口差分のコンポジションが見つかりません" });
		if (lipSyncReadConfig(comp)) {
			app.beginUndoGroup("口パク設定を削除");
			comp.comment = "";
			app.endUndoGroup();
		}
		return JSON.stringify({ status: "success" });
	} catch (e) {
		return JSON.stringify({ status: "error", message: e.toString() });
	}
}

// root から target までのプリコンプレイヤーの連鎖を探す (見つからなければ null)
function lipSyncFindCompPath(root, target) {
	if (root === target) return [];
	for (var i = 1; i <= root.numLayers; i++) {
		var layer = root.layer(i);
		if (!(layer.source instanceof CompItem)) continue;
		var sub = lipSyncFindCompPath(layer.source, target);
		if (sub) return [layer].concat(sub);
	}
	return null;
}

function lipSyncOpacity(layer) {
	return layer.property("ADBE Transform Group").property("ADBE Opacity");
}

function lipSyncSetHoldKey(prop, time, value) {
	var keyIndex = prop.addKey(time);
	prop.setValueAtKey(keyIndex, value);
	prop.setInterpolationTypeAtKey(keyIndex, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
}

// アクティブなコンポジションと選択レイヤーを返す。実行できない状態なら error にメッセージを入れて返す
function getActiveSelection(noSelectionMessage) {
	var comp = app.project.activeItem;
	if (!comp || !(comp instanceof CompItem)) {
		return { error: "コンポジションを選択してから実行してください。" };
	}
	if (comp.selectedLayers.length === 0) {
		return { error: noSelectionMessage };
	}
	return { comp: comp, layers: comp.selectedLayers };
}

// 選択中の音声レイヤーごとに、同名の lab ファイルから口パクのキーフレームを生成する
function generateLipSync(optionsStr) {
	var target = getActiveSelection("対象の音声レイヤーを選択してください。");
	if (target.error) return JSON.stringify({ status: "error", message: target.error });

	var opt;
	var regex;
	try {
		opt = JSON.parse(optionsStr);
		regex = new RegExp(opt.regex);
	} catch (e) {
		return JSON.stringify({ status: "error", message: "設定が正しくありません: " + e.toString() });
	}

	var results;
	app.beginUndoGroup("口パク生成");
	try {
		results = lipSyncProcessLayers(target.comp, target.layers, regex, opt);
	} finally {
		app.endUndoGroup();
	}
	return JSON.stringify({ status: "success", results: results });
}

// 口パク生成の処理本体 (アンドゥグループは呼び出し側で管理する)
function lipSyncProcessLayers(comp, selected, regex, opt) {
	// 話者名 -> 口差分コンポジション
	var configsBySpeaker = {};
	for (var i = 1; i <= app.project.numItems; i++) {
		var item = app.project.item(i);
		if (!(item instanceof CompItem)) continue;
		var cfg = lipSyncReadConfig(item);
		if (cfg && cfg.speaker && !configsBySpeaker.hasOwnProperty(cfg.speaker)) {
			configsBySpeaker[cfg.speaker] = { comp: item, map: cfg.map };
		}
	}

	var results = [];
	var jobs = [];
	for (var j = 0; j < selected.length; j++) {
		var result = { layer: selected[j].name };
		try {
			var job = lipSyncPrepareLayer(comp, selected[j], regex, configsBySpeaker, opt, result);
			if (job) {
				job.order = j;
				jobs.push(job);
			}
		} catch (e) {
			result.status = "error";
			result.message = e.toString() + " (Line: " + e.line + ")";
		}
		results.push(result);
	}

	// 区間が重なる場合は後から始まる音声を優先するため、開始時刻順に処理する
	jobs.sort(function (a, b) {
		return (a.inFrame - b.inFrame) || (a.order - b.order);
	});
	lipSyncSampleBefore(jobs);
	for (var w = 0; w < jobs.length; w++) {
		try {
			lipSyncWriteJob(jobs[w]);
		} catch (e) {
			jobs[w].result.status = "error";
			jobs[w].result.message = e.toString() + " (Line: " + e.line + ")";
		}
	}
	return results;
}

// 音声レイヤー 1 つ分の口パクを計算する (キーは書き込まない)。対象外なら result に理由を入れて null を返す
function lipSyncPrepareLayer(rootComp, layer, regex, configsBySpeaker, opt, result) {
	if (!layer.source || !layer.source.mainSource || !layer.source.mainSource.file) {
		result.status = "skip";
		result.message = "音声ファイルのレイヤーではありません";
		return;
	}

	var audioFile = layer.source.mainSource.file;
	var dot = audioFile.fsName.lastIndexOf(".");
	var labFile = new File(audioFile.fsName.substring(0, dot > -1 ? dot : audioFile.fsName.length) + ".lab");
	if (!labFile.exists) {
		result.status = "skip";
		result.message = "labファイルがありません";
		return;
	}

	var fileName = decodeURI(audioFile.name);
	var match = fileName.substring(0, fileName.lastIndexOf(".")).match(regex);
	if (!match || match.length < 2) {
		result.status = "skip";
		result.message = "ファイル名から話者名を抽出できません";
		return;
	}
	var speaker = match[1];
	result.speaker = speaker;

	var config = configsBySpeaker[speaker];
	if (!config) {
		result.status = "skip";
		result.message = "話者「" + speaker + "」の口パク設定がありません";
		return;
	}

	var mouthComp = config.comp;
	var chain = lipSyncFindCompPath(rootComp, mouthComp);
	if (!chain) {
		result.status = "skip";
		result.message = "このコンポジション内に「" + speaker + "」の立ち絵が見つかりません";
		return;
	}
	for (var c = 0; c < chain.length; c++) {
		if (chain[c].timeRemapEnabled) {
			result.status = "skip";
			result.message = "タイムリマップが有効な立ち絵には未対応です (" + chain[c].name + ")";
			return;
		}
	}

	// 口差分レイヤー: ラジオボタン (*) のものを対象とし、なければロック (!) 以外すべて
	var mouthLayers = [];
	for (var i = 1; i <= mouthComp.numLayers; i++) {
		if (mouthComp.layer(i).name.indexOf("*") === 0) mouthLayers.push(mouthComp.layer(i));
	}
	if (mouthLayers.length === 0) {
		for (var i2 = 1; i2 <= mouthComp.numLayers; i2++) {
			if (mouthComp.layer(i2).name.indexOf("!") !== 0) mouthLayers.push(mouthComp.layer(i2));
		}
	}

	var shapeLayers = {};
	for (var s = 0; s < LIPSYNC_SHAPES.length; s++) {
		var shape = LIPSYNC_SHAPES[s];
		var target = null;
		for (var m = 0; m < mouthLayers.length; m++) {
			if (mouthLayers[m].name === config.map[shape]) { target = mouthLayers[m]; break; }
		}
		if (!target) {
			result.status = "error";
			result.message = "口差分レイヤー「" + config.map[shape] + "」が見つかりません。口パク設定を確認してください";
			return;
		}
		shapeLayers[shape] = target;
	}

	labFile.encoding = "UTF-8";
	labFile.open("r");
	var labText = labFile.read();
	labFile.close();

	var shapes = lipSyncBuildShapes(lipSyncParseLab(labText));
	if (shapes.length === 0) {
		result.status = "skip";
		result.message = "labファイルに音素がありません";
		return;
	}

	// 掃除・生成する区間 (ルートのフレーム番号): 音声レイヤーの見えている範囲を先行フレーム分前にずらしたもの
	var fd = rootComp.frameDuration;
	var lead = opt.leadFrames || 0;
	var inFrame = Math.round(layer.inPoint / fd) - lead;
	var outFrame = Math.round(layer.outPoint / fd) - lead;
	if (outFrame <= inFrame) {
		result.status = "skip";
		result.message = "音声レイヤーの長さが足りません";
		return null;
	}

	// lab の時刻は音声ファイル先頭からの秒数。トリムで見えていない部分は区間の端に切り詰めて捨てる
	var toFrame = function (sec) {
		var f = Math.round((layer.startTime + sec * layer.stretch / 100) / fd) - lead;
		return Math.min(Math.max(f, inFrame), outFrame);
	};
	var segs = lipSyncQuantize(shapes, toFrame, Math.max(1, opt.minFrames || 1));
	if (segs.length === 0) {
		result.status = "skip";
		result.message = "発話区間が短すぎます";
		return null;
	}

	var toLocal = function (frame) {
		return rootTimeToLocalTime(frame * fd, chain);
	};
	return {
		result: result,
		mouthComp: mouthComp,
		mouthLayers: mouthLayers,
		shapeLayers: shapeLayers,
		segs: segs,
		inFrame: inFrame,
		toLocal: toLocal,
		r0: toLocal(inFrame),
		r1: toLocal(outFrame)
	};
}

// 各区間の直前の表示状態 (発話の前後に保つ値) を記録する。
// 直前が同じ口差分に対する別の選択音声の区間内 (または隣接) なら、その音声の記録を引き継ぐ。
// 今回書き換える範囲の値を読まないので、前回の生成結果に左右されない
function lipSyncSampleBefore(jobs) {
	var eps = LIPSYNC_EPS;
	for (var i = 0; i < jobs.length; i++) {
		var job = jobs[i];
		job.before = null;
		for (var p = i - 1; p >= 0; p--) {
			var prev = jobs[p];
			if (prev.mouthComp === job.mouthComp && job.r0 >= prev.r0 - eps && job.r0 <= prev.r1 + eps) {
				job.before = prev.before;
				break;
			}
		}
		if (!job.before) {
			job.before = [];
			for (var a = 0; a < job.mouthLayers.length; a++) {
				job.before.push(lipSyncOpacity(job.mouthLayers[a]).valueAtTime(job.r0 - eps, true));
			}
		}
	}
}

// 区間内の既存キーを削除してから口パクのキーを書き込む
function lipSyncWriteJob(job) {
	var eps = LIPSYNC_EPS;
	var mouthLayers = job.mouthLayers;
	var segs = job.segs;

	for (var a = 0; a < mouthLayers.length; a++) {
		var prop = lipSyncOpacity(mouthLayers[a]);
		for (var k = prop.numKeys; k >= 1; k--) {
			var kt = prop.keyTime(k);
			if (kt >= job.r0 - eps && kt < job.r1 - eps) prop.removeKey(k);
		}
	}

	// lab の先頭が区間の開始より後なら、発話開始までは区間直前の表示状態を保つ
	if (segs[0].f0 > job.inFrame) {
		for (var b = 0; b < mouthLayers.length; b++) {
			lipSyncSetHoldKey(lipSyncOpacity(mouthLayers[b]), job.r0, job.before[b]);
		}
	}

	// 口の形が変わる時点ごとにキーを打つ (先頭は全レイヤー、以降は変化したレイヤーのみ)
	var current = null;
	for (var g = 0; g < segs.length; g++) {
		var visibleLayer = job.shapeLayers[segs[g].shape];
		if (visibleLayer === current) continue; // 複数の母音に同じ差分を割り当てている場合
		var time = job.toLocal(segs[g].f0);
		for (var n = 0; n < mouthLayers.length; n++) {
			var ml = mouthLayers[n];
			if (current !== null && ml !== current && ml !== visibleLayer) continue;
			if (ml === visibleLayer) ml.enabled = true;
			lipSyncSetHoldKey(lipSyncOpacity(ml), time, ml === visibleLayer ? 100 : 0);
		}
		current = visibleLayer;
	}

	// 発話終了時点で区間直前の表示状態に戻す
	var tEnd = job.toLocal(segs[segs.length - 1].f1);
	for (var r = 0; r < mouthLayers.length; r++) {
		lipSyncSetHoldKey(lipSyncOpacity(mouthLayers[r]), tEnd, job.before[r]);
	}

	job.result.status = "ok";
	job.result.message = segs.length + "区間";
}

// ---------------------------------------------------------
// 無音カット
// ---------------------------------------------------------
// WAV の解析はパネル側 (main.js) で行い、ここでは有音区間に合わせてレイヤーのイン/アウトを切り詰める。
// ソースファイルは変更しないため、lab (口パク) や txt (字幕) との対応はそのまま保たれる。

var SILENCE_EPS = 0.0001;

// 無音カットできないレイヤーなら理由を返す
function silenceCutCheckLayer(layer) {
	if (!(layer instanceof AVLayer) || !(layer.source instanceof FootageItem) || !layer.source.mainSource || !layer.source.mainSource.file) {
		return "音声ファイルのレイヤーではありません";
	}
	if (!layer.hasAudio) return "音声がありません";
	if (layer.locked) return "ロックされています";
	if (layer.timeRemapEnabled) return "タイムリマップが有効なレイヤーには未対応です";
	if (layer.stretch <= 0) return "逆再生のレイヤーには未対応です";
	return null;
}

// 選択中のレイヤーと音声ファイルのパスを返す (パネル側で WAV を解析するため)
function getSelectedAudioLayers() {
	var comp = app.project.activeItem;
	if (!comp || !(comp instanceof CompItem)) {
		return JSON.stringify({ status: "error", message: "コンポジションを選択してから実行してください。" });
	}
	if (comp.selectedLayers.length === 0) {
		return JSON.stringify({ status: "error", message: "対象の音声レイヤーを選択してください。" });
	}
	var layers = [];
	var selected = comp.selectedLayers;
	for (var i = 0; i < selected.length; i++) {
		var layer = selected[i];
		var entry = { index: layer.index, name: layer.name };
		var reason = silenceCutCheckLayer(layer);
		if (reason) {
			entry.message = reason;
		} else {
			entry.path = layer.source.mainSource.file.fsName;
		}
		layers.push(entry);
	}
	return JSON.stringify({ status: "success", compId: comp.id, layers: layers });
}

function silenceCutSetRange(layer, t0, t1) {
	// 新しいインが現在のアウト以降だとイン > アウトになるため、先にアウトを動かす
	if (t0 < layer.outPoint) {
		layer.inPoint = t0;
		layer.outPoint = t1;
	} else {
		layer.outPoint = t1;
		layer.inPoint = t0;
	}
}

// optionsStr: { compId, ripple, items: [{ index, path, ranges: [[start, end], ...] (ファイル先頭からの秒) }] }
function applySilenceCut(optionsStr) {
	var opt;
	try {
		opt = JSON.parse(optionsStr);
	} catch (e) {
		return JSON.stringify({ status: "error", message: "設定が正しくありません: " + e.toString() });
	}
	var comp = getCompById(opt.compId);
	if (!comp) return JSON.stringify({ status: "error", message: "コンポジションが見つかりません" });

	// 複製でインデックスがずれるため、先に対象レイヤーをすべて確定させる。
	// 解析中にレイヤー順などが変わっていたら何もしない
	var targets = [];
	for (var i = 0; i < opt.items.length; i++) {
		var item = opt.items[i];
		var layer = item.index <= comp.numLayers ? comp.layer(item.index) : null;
		if (!layer || silenceCutCheckLayer(layer) || layer.source.mainSource.file.fsName !== item.path) {
			return JSON.stringify({ status: "error", message: "解析中にレイヤーが変更されました。もう一度実行してください。" });
		}
		targets.push({ layer: layer, ranges: item.ranges, result: { layer: layer.name } });
	}

	var results = [];
	var pieces = [];
	app.beginUndoGroup("無音カット");
	try {
		for (var t = 0; t < targets.length; t++) {
			try {
				silenceCutLayer(comp, targets[t], pieces);
			} catch (e) {
				targets[t].result.status = "error";
				targets[t].result.message = e.toString() + " (Line: " + e.line + ")";
			}
			results.push(targets[t].result);
		}
		if (opt.ripple) silenceCutRipple(comp, pieces);
	} finally {
		app.endUndoGroup();
	}
	return JSON.stringify({ status: "success", results: results });
}

// 有音区間ごとにレイヤーを分け (2 区間目以降は複製)、イン/アウトをフレーム単位で区間に合わせる
function silenceCutLayer(comp, target, pieces) {
	var layer = target.layer;
	var result = target.result;
	var fd = comp.frameDuration;
	var inFrame = Math.round(layer.inPoint / fd);
	var outFrame = Math.round(layer.outPoint / fd);
	var toComp = function (sec) {
		return (layer.startTime + sec * layer.stretch / 100) / fd;
	};

	// 有音側に広げてフレームに丸め、現在のイン/アウトの範囲内に切り詰める
	var spans = [];
	for (var i = 0; i < target.ranges.length; i++) {
		var f0 = Math.max(Math.floor(toComp(target.ranges[i][0]) + SILENCE_EPS), inFrame);
		var f1 = Math.min(Math.ceil(toComp(target.ranges[i][1]) - SILENCE_EPS), outFrame);
		if (f1 <= f0) continue;
		var last = spans[spans.length - 1];
		if (last && f0 <= last.f1) {
			last.f1 = Math.max(last.f1, f1);
		} else {
			spans.push({ f0: f0, f1: f1 });
		}
	}
	if (spans.length === 0) {
		result.status = "skip";
		result.message = "有音部分が見つかりません";
		return;
	}

	var layers = [layer];
	for (var d = 1; d < spans.length; d++) {
		var dup = layer.duplicate();
		dup.moveAfter(layers[layers.length - 1]);
		layers.push(dup);
	}

	// 音声の開始がフレームの途中にある場合、フレームに丸めた端がソースの外に出ないようにする
	var srcStart = layer.startTime;
	var srcEnd = layer.startTime + layer.source.duration * layer.stretch / 100;
	var kept = 0;
	for (var k = 0; k < spans.length; k++) {
		silenceCutSetRange(layers[k], Math.max(spans[k].f0 * fd, srcStart), Math.min(spans[k].f1 * fd, srcEnd));
		layers[k].selected = true;
		pieces.push({ layer: layers[k], f0: spans[k].f0, f1: spans[k].f1 });
		kept += spans[k].f1 - spans[k].f0;
	}

	var cutSec = Math.max(0, outFrame - inFrame - kept) * fd;
	result.status = "ok";
	result.message = (spans.length > 1 ? spans.length + "分割, " : "") + cutSec.toFixed(2) + "秒カット";
}

// 処理したレイヤー全体で、どれも鳴っていない区間を詰める。
// 各レイヤーは自分より前にある隙間の合計だけ前へ移動する (重なっている音声同士の関係は保たれる)
function silenceCutRipple(comp, pieces) {
	var sorted = pieces.slice().sort(function (a, b) { return a.f0 - b.f0; });
	var gaps = [];
	var reach = null;
	for (var i = 0; i < sorted.length; i++) {
		if (reach !== null && sorted[i].f0 > reach) gaps.push({ end: sorted[i].f0, len: sorted[i].f0 - reach });
		reach = reach === null ? sorted[i].f1 : Math.max(reach, sorted[i].f1);
	}

	for (var p = 0; p < pieces.length; p++) {
		var shift = 0;
		for (var g = 0; g < gaps.length; g++) {
			if (gaps[g].end <= pieces[p].f0) shift += gaps[g].len;
		}
		if (shift > 0) pieces[p].layer.startTime -= shift * comp.frameDuration;
	}
}


// ---------------------------------------------------------
// 字幕 (音声と同名の txt ファイルをテキストレイヤーへ反映)
// ---------------------------------------------------------
// 音声ファイル名から正規表現で抽出した文字列と前方一致する名前のテキストレイヤーに字幕を書き込み、
// 音声レイヤーの区間内は対象のテキストレイヤーだけを表示する (不透明度のホールドキー)。

// 時刻をフレーム境界に合わせる。浮動小数点誤差はマイクロ秒精度で丸める
function subtitleSnapToFrame(time, frameDuration) {
	var frameIndex = Math.round(time / frameDuration);
	return Math.round(frameIndex * frameDuration * 1000000) / 1000000;
}

// [t0, t1) にあるキーフレームを削除する
function subtitleRemoveKeysInRange(prop, t0, t1) {
	var eps = 0.0001;
	for (var k = prop.numKeys; k >= 1; k--) {
		var kt = prop.keyTime(k);
		if (kt >= t0 - eps && kt < t1 - eps) prop.removeKey(k);
	}
}

function subtitleSourceText(textLayer) {
	return textLayer.property("ADBE Text Properties").property("ADBE Text Document");
}

// 選択中の音声レイヤーごとに、同名の txt ファイルの内容を字幕として書き込む
function applySubtitles(optionsStr) {
	var target = getActiveSelection("対象の音声レイヤーを選択してください。");
	if (target.error) return JSON.stringify({ status: "error", message: target.error });

	var regex;
	try {
		regex = new RegExp(JSON.parse(optionsStr).regex);
	} catch (e) {
		return JSON.stringify({ status: "error", message: "設定が正しくありません: " + e.toString() });
	}

	var results;
	app.beginUndoGroup("テキストを反映");
	try {
		results = subtitleProcessLayers(target.comp, target.layers, regex);
	} finally {
		app.endUndoGroup();
	}
	return JSON.stringify({ status: "success", results: results });
}

// 字幕の反映処理本体 (アンドゥグループは呼び出し側で管理する)
function subtitleProcessLayers(comp, selected, regex) {
	var textLayers = [];
	for (var t = 1; t <= comp.numLayers; t++) {
		if (comp.layer(t) instanceof TextLayer) textLayers.push(comp.layer(t));
	}

	var results = [];
	var jobs = [];
	for (var i = 0; i < selected.length; i++) {
		var result = { layer: selected[i].name };
		try {
			var job = subtitlePrepareLayer(comp, selected[i], regex, textLayers, result);
			if (job) {
				job.order = i;
				jobs.push(job);
			}
		} catch (e) {
			result.status = "error";
			result.message = e.toString() + " (Line: " + e.line + ")";
		}
		results.push(result);
	}

	// 区間が重なる場合は後から始まる音声を優先するため、開始時刻順に処理する
	jobs.sort(function (a, b) {
		return (a.startTime - b.startTime) || (a.order - b.order);
	});
	for (var w = 0; w < jobs.length; w++) {
		try {
			subtitleWriteJob(jobs[w], textLayers);
		} catch (e) {
			jobs[w].result.status = "error";
			jobs[w].result.message = e.toString() + " (Line: " + e.line + ")";
		}
	}
	return results;
}

// 音声レイヤー 1 つ分の書き込み内容を求める (キーは書き込まない)。対象外なら result に理由を入れて null を返す
function subtitlePrepareLayer(comp, layer, regex, textLayers, result) {
	if (!layer.source || !layer.source.mainSource || !layer.source.mainSource.file) {
		result.status = "skip";
		result.message = "音声ファイルのレイヤーではありません";
		return null;
	}

	var audioFile = layer.source.mainSource.file;
	var dot = audioFile.fsName.lastIndexOf(".");
	var txtFile = new File(audioFile.fsName.substring(0, dot > -1 ? dot : audioFile.fsName.length) + ".txt");
	if (!txtFile.exists) {
		result.status = "skip";
		result.message = "txtファイルがありません";
		return null;
	}

	var fileName = decodeURI(audioFile.name);
	var match = fileName.substring(0, fileName.lastIndexOf(".")).match(regex);
	if (!match || match.length < 2 || !match[1]) {
		result.status = "skip";
		result.message = "ファイル名から文字列を抽出できません";
		return null;
	}
	var prefix = match[1];

	var targetLayer = null;
	for (var j = 0; j < textLayers.length; j++) {
		if (textLayers[j].name.indexOf(prefix) === 0) {
			targetLayer = textLayers[j];
			break;
		}
	}
	if (!targetLayer) {
		result.status = "skip";
		result.message = "「" + prefix + "」で始まるテキストレイヤーがありません";
		return null;
	}

	txtFile.encoding = "UTF-8";
	txtFile.open("r");
	var textContent = txtFile.read();
	txtFile.close();

	// 音声レイヤーの区間 [インポイント, アウトポイント) をフレーム境界に合わせる
	var startTime = subtitleSnapToFrame(layer.inPoint, comp.frameDuration);
	var endTime = subtitleSnapToFrame(layer.outPoint, comp.frameDuration);

	// 掃除前の区間開始時点のスタイルを保持したままテキストだけ書き換える (再生ヘッド位置に依存させない)
	var sourceText = subtitleSourceText(targetLayer);
	var textDoc = sourceText.valueAtTime(startTime, true);
	textDoc.text = textContent;

	return { result: result, startTime: startTime, endTime: endTime, target: targetLayer, sourceText: sourceText, textDoc: textDoc };
}

// 区間内の既存キーを全テキストレイヤーから削除してから、字幕と不透明度のキーを書き込む
function subtitleWriteJob(job, textLayers) {
	for (var c = 0; c < textLayers.length; c++) {
		subtitleRemoveKeysInRange(subtitleSourceText(textLayers[c]), job.startTime, job.endTime);
		subtitleRemoveKeysInRange(lipSyncOpacity(textLayers[c]), job.startTime, job.endTime);
	}

	job.sourceText.setValueAtTime(job.startTime, job.textDoc);

	// 対象のテキストレイヤーは不透明度を 100 に、それ以外は 0 にする
	for (var k = 0; k < textLayers.length; k++) {
		lipSyncSetHoldKey(lipSyncOpacity(textLayers[k]), job.startTime, textLayers[k] === job.target ? 100 : 0);
	}

	job.result.status = "ok";
	job.result.message = job.target.name;
}

// ---------------------------------------------------------
// 字幕・口パクの一括生成
// ---------------------------------------------------------

// optionsStr: { regex, leadFrames, minFrames }
// 選択中の音声レイヤーから字幕と口パクを生成する。アンドゥ 1 回でまとめて取り消せる
function generateSubtitleAndLipSync(optionsStr) {
	var target = getActiveSelection("対象の音声レイヤーを選択してください。");
	if (target.error) return JSON.stringify({ status: "error", message: target.error });

	var opt;
	var regex;
	try {
		opt = JSON.parse(optionsStr);
		regex = new RegExp(opt.regex);
	} catch (e) {
		return JSON.stringify({ status: "error", message: "設定が正しくありません: " + e.toString() });
	}

	var subtitleResults;
	var lipSyncResults;
	app.beginUndoGroup("字幕・口パク生成");
	try {
		subtitleResults = subtitleProcessLayers(target.comp, target.layers, regex);
		lipSyncResults = lipSyncProcessLayers(target.comp, target.layers, regex, opt);
	} finally {
		app.endUndoGroup();
	}
	return JSON.stringify({ status: "success", subtitle: subtitleResults, lipSync: lipSyncResults });
}

// ---------------------------------------------------------
// BudouX 改行
// ---------------------------------------------------------
/*
Copyright 2026 Google Inc.
Copyright 2026 M_Kasumi

The BudouX section of this file is a translation of https://github.com/google/budoux/tree/main and has been modified
(translated) by M_Kasumi on 2026-04-01.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

See the License for the specific language governing permissions and
limitations under the License.
*/
var BUDOUX_MODEL = { "UW3": { "。": 6699, "に": 3897, "、": 4784, "の": 3706, "が": 4162, "を": 5769, "は": 4221, "と": 2900, "る": 2971, "く": 2902, "も": 3155, "う": 2242, "て": 2447, "で": 3372, "た": 2217, "い": 1855, "な": 2357, "っ": -1853, "方": 2814, "ら": 1353, "ん": 967, "ば": 1790, "］": 2166, "か": 1899, "，": 3358, "り": 1013, "！": 3252, "ー": -102, "や": 2149, "？": 3703, "．": 2093, "・": 1074, "…": 2428, "部": 1732, "ど": 992, "ご": -2327, "）": 2573, "ッ": -2137, "☆": 2675, "お": -1495, "上": 428, "以": -1870, "つ": 1078, "」": 1608, "♪": 2714, "電": -1669, "ク": 335, "だ": 866, "へ": 2073, "ろ": 1142, "笑": 2335, "ず": 1456, "面": 475, "び": 514, "あ": 1179, "今": 1080, "ぐ": 2053, "分": 1111, "感": 1389, "大": -1134, "京": -1396, "中": 998, "人": 486, "場": -794, "イ": -568, "す": 938, "さ": -599, "ま": -370, "利": -681, "間": 752, "０": -870, "ぁ": 1322, "フ": -1285, "ン": -284, "「": -1434, "当": -337, "き": 530, "日": 713, "ス": -901, "ゃ": 1112, "後": 1224, "々": 1435, "シ": -1196, "度": 982, "観": -976, "食": -517, "行": -725, "ド": -995, "リ": -636, "え": 728, "空": 902, "夜": 1480, "ア": -700, "』": 1404, "１": -550, "体": 1000, "秋": 1464, "入": -819, "プ": -718, "昔": 1287, "［": -960, "題": 1113, "能": -710, "皆": 1294, "む": 920, "学": -552, "態": -749, "月": 584, "係": 701, "変": 328, "超": 976, "ぶ": 672, "然": 515, "〜": 489, "れ": 295, "由": 680, "段": 13, "非": 768, "光": -218, "意": -477, "ぞ": 825, "年": 344, "べ": -711, "機": -463, "言": -419, "ち": 363, "気": 130, "み": 275, "ｏ": -520, "＞": 588, "し": 181, "け": 159, "移": -635, "見": 160, "ズ": 304, "自": -352, "果": 767, "番": 252, "色": 469, "　": 257, "ぱ": 454, "出": -160, "屋": 338, "カ": -102, "メ": -136, "指": -240, "店": 203, "一": -50, "別": 285, "頭": 486, "朝": 270, "想": 398, "味": 101, "生": -160, "語": 159, "”": 215, "着": -149, "所": 189, "：": 94, "神": -111, "応": 149, "程": 145, "不": -93, "料": -76, "寺": 50, "水": 54, "レ": -54, "パ": -29, "サ": 33, "グ": 12, "有": -16 }, "UW4": { "。": -7440, "の": -4018, "が": -3577, "に": -4299, "て": -3839, "る": -5462, "、": -7452, "は": -3332, "っ": -4313, "で": -3120, "を": -4861, "う": -2446, "と": -2917, "り": -4081, "ま": -1296, "た": -1675, "あ": 501, "れ": -4326, "な": -1928, "そ": 456, "く": -2884, "か": -2662, "ら": -4391, "ご": 591, "し": -1725, "こ": -517, "だ": -2037, "き": -2074, "い": -1531, "ん": -3821, "ー": -2899, "も": -2746, "み": -1111, "食": 652, "行": 411, "思": 1386, "す": -1159, "空": 2526, "大": 788, "」": -5393, "じ": -2352, "や": -1257, "け": -3441, "め": -1867, "さ": -1716, "よ": -643, "「": 2301, "表": 1003, "日": 695, "広": 1811, "場": 333, "一": 576, "時": 564, "ち": -1762, "冷": 2351, "京": 614, "，": -4205, "わ": -1624, "人": 512, "私": 1957, "！": -4469, "え": -1844, "ッ": -2189, "当": 384, "・": -677, "ン": -2078, "１": 710, "方": -816, "べ": -2964, "手": 270, "来": 430, "ろ": -2793, "せ": -1498, "ル": -1178, "ば": -2432, "つ": -1195, "使": 1131, "（": 2399, "持": 180, "…": -2208, "ゆ": -2265, "？": -3412, "）": -4207, "ぶ": -2267, "何": 1291, "彼": 1247, "び": -1619, "笑": -3444, "本": -1249, "ど": -697, "［": 1760, "．": -2874, "言": 227, "お": 820, "ず": -1966, "イ": -507, "今": 1002, "ゃ": -2441, "見": 386, "自": 792, "２": 533, "最": 1072, "用": -716, "帯": -1138, "間": -393, "携": 441, "多": 1062, "リ": -707, "能": -1270, "』": -3209, "］": -1427, "気": 235, "入": 412, "有": 744, "ね": -1659, "白": 451, "ぁ": -1501, "ぎ": -1428, "中": 34, "ひ": 1076, "遊": 1409, "”": -817, "風": 673, "コ": 344, "ょ": -1527, "水": 286, "情": -375, "０": -374, "む": -1261, "合": -948, "公": 724, "ぼ": -949, "♪": -1513, "小": 736, "僕": 856, "☆": -1296, "〜": -1156, "ド": -76, "楽": 308, "全": 475, "書": 411, "ス": -218, "二": 481, "態": -582, "少": 436, "不": 505, "返": -347, "定": -356, "ぜ": -907, "高": 229, "特": 623, "祭": 413, "他": 368, "づ": -776, "目": 117, "ぞ": -935, "話": 316, "子": -233, "ぐ": -840, "年": -625, "３": 22, "道": 181, "的": -500, "ｏ": -489, "実": 368, "買": 366, "無": 192, "街": 443, "東": 470, "物": -204, "ュ": -434, "ほ": -176, "込": -568, "甘": 383, "タ": -212, "換": -278, "現": 191, "新": 150, "夏": 403, "フ": -157, "ト": -148, "げ": -455, "ざ": -327, "デ": 174, "券": -471, "感": 28, "秋": 307, "難": 179, "外": 153, "へ": -247, "ョ": -156, "流": 254, "舞": 138, "サ": 75, "前": -75, "店": 101, "押": 264, "開": 61, "　": -148, "＾": -256, "度": -125, "５": 52, "々": -142, "写": 159, "回": -154, "ラ": -56, "関": -145, "安": 63, "相": 54, "参": 45, "百": 45, "取": -45, "ム": -41, "屋": -8, "通": -8, "勝": 4, "美": 4 }, "UW5": { "。": -2177, "で": -955, "す": -681, "、": -1011, "な": -608, "ま": -353, "て": 169, "っ": 964, "る": 175, "は": -874, "き": 1177, "し": -394, "お": 345, "を": -674, "く": 287, "こ": 500, "じ": 886, "に": -612, "そ": -421, "能": 219, "わ": 710, "べ": 1871, "え": 637, "ん": 1001, "あ": -271, "た": 198, "み": 293, "い": 345, "・": -1082, "と": -617, "よ": -587, "の": -641, "ろ": -360, "上": -1087, "か": 210, "だ": -338, "め": 851, "帯": 303, "れ": 495, "ざ": 1494, "ら": 222, "ず": 1173, "さ": -327, "つ": 1091, "ル": -472, "面": 776, "」": -1068, "電": -285, "ぼ": 1415, "日": 342, "が": -272, "び": 826, "せ": -303, "思": -891, "ち": 572, "冷": 1123, "り": 409, "年": 876, "使": -1390, "利": 365, "葉": 791, "！": -384, "］": -470, "合": 255, "ぶ": 15, "券": -1133, "意": 708, "ぐ": 159, "バ": -254, "も": -93, "う": 325, "入": -341, "移": -571, "ト": -313, "体": -1085, "当": 401, "々": 505, "分": 173, "イ": 171, "見": -272, "来": -122, "料": 579, "寺": -461, "ぎ": 348, "手": 179, "続": -872, "む": 458, "通": -209, "．": -184, "タ": 244, "行": -180, "？": -192, "水": -154, "先": -562, "都": 40, "一": -151, "ど": -41, "ば": 209, "ア": -123, "学": 49, "最": -116, "降": 104, "ｏ": 95, "へ": -146, "何": -176, "効": 111, "ン": -30, "ょ": 90, "ー": 4, "　": -135, "（": -67, "種": 42, "７": -101, "的": -54, "成": 46, "ラ": 29, "Ｎ": 104, "１": -29, "有": -37, "中": 8, "場": 4 }, "UW2": { "。": -1401, "、": -1370, "を": -2403, "に": -1207, "が": -653, "は": -1010, "か": 18, "れ": 5, "っ": 269, "以": 2215, "て": -985, "う": -489, "全": 1762, "の": -695, "そ": -534, "で": -810, "だ": 523, "ゆ": 1668, "さ": 922, "く": -812, "め": 81, "と": -751, "も": -813, "あ": -233, "一": 1197, "し": -49, "ん": 344, "お": -711, "食": 981, "ご": -682, "き": -556, "毎": 1671, "結": 1952, "彼": 754, "少": 676, "最": 445, "ほ": 1001, "わ": -118, "舞": 2257, "上": -421, "よ": 577, "同": 567, "り": -479, "機": 1341, "人": 201, "意": 531, "な": -492, "「": -482, "ば": -464, "関": 745, "京": -377, "本": 694, "い": -79, "大": 266, "目": -1004, "多": 387, "着": -477, "つ": -423, "ケ": -246, "振": -1313, "ゃ": 283, "題": 848, "手": 663, "ひ": -1353, "容": 956, "水": 335, "我": -1421, "る": -207, "裏": -1437, "ー": 274, "ぜ": 567, "ぱ": 396, "名": 341, "フ": -264, "寺": -551, "葉": 787, "ま": -173, "夕": 826, "ぶ": 435, "絶": 1181, "高": 498, "今": 276, "友": 494, "ら": -91, "ン": 167, "た": -109, "み": -123, "料": 70, "イ": -122, "電": 315, "冷": -664, "打": 557, "メ": -47, "世": -793, "パ": 289, "女": -487, "ｒ": 990, "プ": -195, "取": -360, "＾": 149, "場": 190, "こ": 161, "，": -306, "落": -499, "選": 313, "知": -361, "極": 748, "入": -160, "良": 183, "ラ": -210, "ス": 54, "遊": -310, "用": -161, "式": 93, "々": 80, "車": 124, "立": -292, "下": 154, "ル": 31, "甘": 227, "実": 97, "重": 159, "乗": -115, "当": 94, "：": 106, "］": -50, "Ｈ": -84, "的": 42, "相": 75, "三": 58, "け": 16, "格": 130, "正": 100, "［": -16, "日": -25, "公": -33, "４": 20, "ィ": -12, "ろ": -4 }, "UW6": { "が": 320, "。": -307, "て": -16, "で": 219, "は": 307, "し": 581, "入": 621, "ど": 828, "あ": -496, "空": 1589, "な": 218, "す": -90, "だ": 95, "め": 1415, "券": 1711, "さ": 555, "ご": -283, "の": 85, "性": 2064, "う": 35, "や": 819, "り": 578, "場": -864, "に": 245, "つ": 506, "ろ": 352, "き": -17, "っ": 301, "る": 71, "か": 231, "い": 365, "ら": 65, "そ": -101, "ば": 527, "け": -213, "ー": -66, "ん": 324, "彼": -1272, "ク": -346, "ル": 207, "０": 626, "く": 240, "、": 180, "食": -284, "遊": -906, "寺": 611, "・": -639, "：": 1217, "言": -361, "ゆ": 755, "態": 221, "込": 679, "を": 85, "的": 479, "可": 567, "タ": 380, "気": 415, "思": -111, "ぱ": 813, "ま": 170, "メ": 239, "お": -18, "ピ": 780, "カ": 292, "送": -896, "来": -261, "過": 846, "イ": -244, "効": -725, "シ": -130, "ケ": -388, "ず": -403, "ぶ": -248, "焼": 643, "れ": 119, "広": -150, "機": 216, "わ": 60, "ン": -64, "方": -235, "１": 33, "こ": 41, "店": 164, "印": 360, "び": 129, "回": -94, "ぎ": 280, "不": 204, "も": -18, "自": 123, "む": 168, "パ": -112, "周": 275, "出": 68, "参": 114, "神": 33, "着": -20, "間": -4, "練": 8, "ゃ": -4 }, "UW1": { "は": -273, "う": 275, "ま": 128, "お": 922, "ご": 890, "と": 165, "が": -385, "る": -34, "せ": 210, "い": -91, "ん": 289, "あ": -230, "で": -127, "学": 209, "り": -102, "浮": 1464, "に": -344, "甘": -1424, "つ": 241, "バ": 511, "な": -220, "て": 60, "水": 1969, "、": -26, "電": 127, "当": -1038, "ふ": 1899, "ら": 72, "れ": -44, "携": -86, "を": -176, "そ": 137, "っ": 194, "ろ": 303, "［": -601, "ー": 113, "か": -110, "間": 572, "ち": 285, "ゆ": -428, "し": -30, "外": 301, "フ": -155, "も": -96, "０": 275, "空": -524, "ス": -251, "く": 134, "自": 412, "す": 151, "用": 599, "さ": -164, "チ": 183, "ケ": -196, "入": 266, "ツ": 134, "困": 574, "利": -371, "生": 254, "機": 318, "安": -400, "画": -53, "庭": 619, "イ": 211, "３": -258, "メ": 96, "面": -306, "何": 173, "こ": 64, "問": 588, "方": 124, "白": -248, "じ": -49, "社": 225, "様": 365, "田": 137, "国": -382, "込": 42, "の": -31, "高": 170, "。": -17, "ッ": 117, "だ": 63, "新": 178, "．": -72, "ラ": 92, "使": -79, "見": 76, "？": 113, "振": 209, "！": 65, "撮": -182, "券": 79, "ざ": 120, "周": 137, "長": 144, "や": -42, "山": 114, "パ": 63, "好": 50, "ペ": 126, "着": -16, "め": -12, "み": -8, "個": -79, "上": 12, "え": -8, "連": -29, "ボ": 16 }, "BW2": { "たと": 1475, "とお": -3875, "とい": 274, "うや": -2003, "ない": -2999, "のみ": -2622, "てい": -1296, "であ": -3302, "のよ": -838, "です": -3035, "たま": -2116, "いた": -1737, "の機": -2082, "ので": -921, "でき": -2119, "には": -1012, "にも": -1213, "はじ": -2465, "、そ": -1810, "がと": -1022, "くな": -1771, "でも": -1689, "はな": -331, "のは": -1100, "ると": -643, "てお": -2518, "など": -1807, "帯電": -1351, "でし": -1856, "、と": -558, "また": -2737, "ただ": -2687, "くし": -1520, "るよ": -944, "いも": 709, "もあ": -935, "りも": -1014, "てあ": -2039, "たい": -1183, "てみ": -1524, "そこ": -652, "もし": -490, "てく": -1248, "ども": -675, "うど": -1684, "の前": -820, "のだ": -873, "なく": -956, "にな": -362, "人が": 1674, "んど": -722, "もの": -753, "いま": -421, "と思": 545, "れた": -890, "はい": -770, "すご": -1196, "くだ": -1043, "・・": -1221, "てき": -1069, "がっ": -1494, "はあ": -1185, "では": -1027, "いつ": -659, "とな": 159, "時間": -681, "がし": 280, "にし": -458, "うま": -1227, "たち": -851, "のお": 458, "ばい": -968, "、な": -145, "た時": 421, "のも": -489, "とか": -782, "らな": -64, "なか": -299, "のか": -278, "でな": -1003, "たも": 318, "とこ": -337, "もな": -157, "した": -402, "もつ": -433, "いい": -357, "ード": -523, "とき": -230, "もち": -157, "たよ": -393, "はで": 41, "とも": -359, "いし": -401, "いよ": -494, "はず": -333, "やす": -524, "と同": -442, "よう": -175, "いな": -144, "ーな": 476, "るの": -197, "しい": -297, "、１": -643, "ても": -151, "りな": 191, "がよ": 195, "の１": -539, "うか": -137, "、清": -374, "今日": -360, "とす": -127, "つの": 186, "］京": -152, "うい": -93, "のが": -101, "い人": 80, "けど": -126, "ーで": 83, "がち": 62, "の方": 96, "らい": -54, "でい": -33, "てた": -37, "どこ": -20 }, "BW1": { "のみ": 3058, "以上": 1223, "まま": 2830, "から": 1723, "たま": 2162, "れた": 1494, "白い": 3534, "ちが": -2703, "めて": 969, "ない": 1045, "その": -1066, "では": -518, "った": 166, "たと": -948, "こと": -1455, "くれ": 922, "とか": 1688, "るの": -1593, "うな": 513, "たの": -1543, "のは": 1277, "より": 1376, "でも": 667, "とが": -1393, "しい": 917, "かも": -1290, "ック": 631, "よう": -1620, "んな": 471, "とう": 1085, "。・": 2456, "たら": 949, "気に": -70, "ても": 623, "利用": 1018, "最近": 1515, "がと": -1545, "この": -1039, "にも": 816, "もつ": 1694, "が、": 1178, "れて": -1090, "りが": -96, "りと": 1198, "んで": -325, "まだ": 1343, "には": 588, "もう": 1414, "少し": 1375, "とき": 1349, "こそ": 1413, "りも": 1231, "れば": 936, "けど": 1014, "同じ": 1427, "ると": 202, "た．": 1736, "まり": 1018, "いう": 138, "は、": 436, "とい": -725, "い、": -329, "なら": 1251, "思い": -1273, "て、": 702, "ある": 141, "って": -196, "で、": 572, "なぜ": 1571, "りに": 356, "りの": -399, "まる": -429, "れる": 350, "たい": 242, "それ": 293, "もし": 1050, "の間": 1155, "など": 1137, "いの": -369, "うや": -1096, "だけ": 391, "てい": -522, "とで": 941, "くて": 680, "んだ": 515, "ケー": -781, "いで": -844, "普段": 655, "のも": 725, "思う": 57, "えば": 791, "きな": 687, "に感": -579, "いた": 310, "、と": 310, "もの": -538, "ただ": 398, "のが": 482, "てる": 372, "大変": 401, "の後": 753, "る人": 626, "しか": 96, "でき": -364, "るで": 252, "まぁ": 444, "使い": -715, "こう": -591, "かな": -137, "買い": -698, "！！": 322, "める": -429, "に、": 564, "０円": 304, "、今": 302, "ージ": 789, "する": -159, "友達": 625, "クル": 437, "るに": -442, "やら": 416, "。あ": -619, "きり": 449, "と、": 245, "の上": 589, "ため": 524, "まで": 160, "か、": -255, "うち": 218, "なく": 149, "来て": 386, "きた": 236, "べき": 424, "じて": 254, "ぱり": 342, "んど": -303, "・・": 237, "だな": -302, "ろう": -315, "現在": 281, "。３": 274, "お店": 199, "てた": 147, "すら": 190, "いも": -216, "にか": 180, "いな": -98, "気が": 115, "たり": 102, "わら": -71, "実際": 83, "とに": -20, "も、": 29, "くさ": -24, "国人": 24, "うか": 12, "は１": 37, "とは": -4 }, "BW3": { "うま": 4971, "もの": 3479, "あり": 1053, "いた": 712, "よう": -404, "いう": 719, "上が": 1571, "ます": -943, "はじ": 3173, "とう": -693, "たま": 1383, "ちが": 1979, "いい": 1237, "おり": -2875, "のみ": 3096, "可能": 402, "ちゃ": -1016, "こと": 899, "そこ": 647, "でも": 1643, "その": 1844, "なっ": -512, "とい": -1257, "ある": -339, "この": 1656, "とき": 1917, "そう": -1050, "手に": 1242, "から": -1223, "持っ": 1098, "でき": 980, "かけ": 2909, "とて": 2245, "なる": 481, "はし": 3011, "ちょ": 1986, "して": 278, "とお": 678, "もら": 2538, "メー": 364, "ころ": -190, "そし": -184, "かか": 1752, "もう": 2306, "どん": -397, "・・": -1499, "より": -1463, "しま": -93, "とも": 1038, "めて": -1778, "もん": 1078, "いろ": 832, "まぁ": 1442, "だけ": -941, "した": 813, "さん": -1566, "うち": 444, "きっ": 727, "よく": 1082, "すご": 897, "以上": -807, "ない": 287, "ため": 686, "これ": 1075, "どう": 296, "はま": 1041, "す。": -152, "とっ": 917, "来た": 408, "しゃ": 1283, "かっ": -802, "ただ": 1198, "しい": -519, "すぐ": 1094, "もと": 1264, "やっ": 422, "かも": -670, "める": -1304, "電車": 121, "まし": -670, "いか": 480, "パソ": 589, "わか": 691, "なく": 348, "いる": 556, "とこ": 742, "中で": 414, "さい": -672, "みた": -739, "かつ": 821, "いて": -372, "なか": 198, "なら": -160, "だい": 680, "あっ": -93, "もっ": 626, "また": -479, "いや": 732, "考え": 429, "うか": -268, "もつ": 666, "まだ": 296, "きま": -514, "まで": -677, "お茶": 627, "こそ": -520, "とり": 539, "いら": 621, "です": -239, "まり": -596, "出来": -428, "つな": 437, "ほし": -350, "たい": -238, "ここ": 552, "はい": 272, "行き": -218, "楽し": 128, "し、": -136, "めっ": 260, "んは": 438, "出て": 128, "いま": 85, "つけ": 251, "みが": -374, "まず": 233, "だろ": -357, "ルー": 249, "がち": -345, "料理": 8, "祭り": 214, "使っ": 109, "と思": -161, "ぼく": 329, "イン": 203, "逆に": 246, "で、": 119, "どこ": 46, "ずっ": 121, "つい": 62, "ませ": -58, "あの": 71, "過ぎ": -95, "始め": -28, "まっ": -24, "程度": -24, "書い": 12 }, "TW3": { "という": 970, "もなく": -1899, "ところ": -1724, "として": 655, "、ある": -2756, "ている": -1375, "はない": -473, "のまま": -961, "すこと": 710, "てしま": -1361, "らない": -1075, "はそれ": -1539, "ていく": -289, "とした": -1169, "と言っ": -1166, "ていう": 769, "である": -749, "、なん": -293, "ること": -49, "であっ": -812, "となっ": 229, "なんで": 574, "いとこ": 75, "もいい": -408, "もあり": -183, "であり": -535, "ういう": -120, "ばいい": -137, "にして": -37, "ていた": -66, "るとき": 108, "でした": -54, "うこと": -4 }, "TW4": { "ところ": 2195, "ように": -1673, "くらい": 1598, "した。": -1569, "ありま": -1767, "かなり": 2848, "できた": 2069, "ます。": -1366, "ような": -2232, "ことが": -824, "いた。": 1066, "だから": 1092, "うどん": 1258, "そうで": -925, "ことに": -856, "もちろ": 1697, "しかし": 1383, "ことで": 380, "ない。": 191, "ことも": -588, "あり、": -595, "ちなみ": 1130, "だった": -1150, "すると": 406, "こと。": 683, "でも、": 628, "いろい": 590, "いかな": 651, "メール": 256, "ようで": -896, "なかな": 669, "なくな": 253, "しない": 438, "ソフト": 512, "ことを": 255, "わけで": -234, "まって": -824, "なんと": 481, "すごい": 314, "してき": 278, "いえば": 397, "らしい": 424, "しかも": 494, "ことは": -232, "あたり": -390, "食べて": 140, "しても": -174, "できま": 52, "なんか": 116, "なんて": -102, "いくら": 170, "観光客": -75, "いいと": -63, "いる。": 37, "ちょっ": 20, "そうい": 16 }, "TW2": { "気に入": -4086, "ではな": -1086, "とがあ": -1130, "かもし": -463, "んでい": -2306, "そもそ": -1441, "うにな": -803, "してい": -406, "でもあ": -936, "ったこ": -267, "しかな": 440, "ともあ": -757, "からな": -477, "えるこ": -436, "でもな": -207, "とはい": -59, "えてい": 50, "してお": -37 }, "TW1": { "という": 545, "ていく": 1686, "ような": 1298, "・・・": 1104, "持って": -1851, "しかし": 2079, "てくれ": 1444, "のまま": 1162, "かなり": 2083, "やはり": 1728, "ながら": 1223, "ょうど": 1174, "もなく": 947, "思った": 811, "とんど": 1250, "、それ": 412, "ない、": -1039, "なんと": -691, "を利用": -1017, "がって": -418, "ひとつ": 732, "と思う": 251, "ました": -268, "である": 267, "かなか": 698, "そして": 556, "っかり": 599, "。ただ": 676, "リーグ": 309, "きない": 141, "はその": -68, "ちろん": 196, "くさん": 225, "ること": -271, "だって": 164, "なって": -86, "すごく": 163, "ろいろ": 54, "。その": 16, "くらい": 4 } };
var BUDOUX_BASE_SCORE = -1479;

function budouxGetScore(group, key) {
	var g = BUDOUX_MODEL[group];
	if (g && g[key] !== undefined) return g[key];
	return 0;
}

function budouxParse(sentence) {
	if (!sentence || sentence.length === 0) return [sentence || ''];
	var boundaries = [];
	for (var i = 1; i < sentence.length; i++) {
		var score = BUDOUX_BASE_SCORE;
		score += budouxGetScore('UW1', sentence.substring(i - 3, i - 2));
		score += budouxGetScore('UW2', sentence.substring(i - 2, i - 1));
		score += budouxGetScore('UW3', sentence.substring(i - 1, i));
		score += budouxGetScore('UW4', sentence.substring(i, i + 1));
		score += budouxGetScore('UW5', sentence.substring(i + 1, i + 2));
		score += budouxGetScore('UW6', sentence.substring(i + 2, i + 3));
		score += budouxGetScore('BW1', sentence.substring(i - 2, i));
		score += budouxGetScore('BW2', sentence.substring(i - 1, i + 1));
		score += budouxGetScore('BW3', sentence.substring(i, i + 2));
		score += budouxGetScore('TW1', sentence.substring(i - 3, i));
		score += budouxGetScore('TW2', sentence.substring(i - 2, i + 1));
		score += budouxGetScore('TW3', sentence.substring(i - 1, i + 2));
		score += budouxGetScore('TW4', sentence.substring(i, i + 3));
		if (score > 0) boundaries.push(i);
	}
	var result = [];
	var start = 0;
	for (var j = 0; j < boundaries.length; j++) {
		result.push(sentence.substring(start, boundaries[j]));
		start = boundaries[j];
	}
	result.push(sentence.substring(start));
	return result;
}

// BudouXで分割したフレーズをテキストボックス幅に収まるよう折り返す
// boxWidth: テキストボックスの幅(px)、charWidth: 1文字あたりの概算幅(px)
function wrapPhrasesToWidth(phrases, boxWidth, charWidth) {
	if (boxWidth <= 0 || charWidth <= 0) {
		return phrases.join('\n');
	}
	var charsPerLine = Math.max(1, Math.floor(boxWidth / charWidth));
	var lines = [];
	var currentPhrases = [];
	var currentLen = 0;
	for (var p = 0; p < phrases.length; p++) {
		var phraseLen = phrases[p].length;
		if (currentLen > 0 && currentLen + phraseLen > charsPerLine) {
			lines.push(currentPhrases.join(''));
			currentPhrases = [phrases[p]];
			currentLen = phraseLen;
		} else {
			currentPhrases.push(phrases[p]);
			currentLen += phraseLen;
		}
	}
	if (currentPhrases.length > 0) {
		lines.push(currentPhrases.join(''));
	}
	return lines.join('\n');
}

function budouxApplyToDoc(textDoc) {
	var isBoxText = textDoc.boxText;
	var boxWidth = isBoxText ? textDoc.boxTextSize[0] : 0;
	// fontSize × horizontalScale でCJK文字の概算幅を計算
	// 1.05は若干の余裕を持たせるための係数（実際の文字幅はフォントやスタイルによって異なるため）
	var charWidth = textDoc.fontSize * (textDoc.horizontalScale || 1.0) * 1.05;

	// 既存の改行 (ユーザー入力 or 前回適用分) を除去して元の文章に戻してから再分割する
	var originalText = textDoc.text.replace(/[\r\n]/g, "");
	var phrases = budouxParse(originalText);

	if (isBoxText && boxWidth > 0) {
		textDoc.text = wrapPhrasesToWidth(phrases, boxWidth, charWidth);
	} else {
		textDoc.text = phrases.join("\n");
	}
	return textDoc;
}

// テキストレイヤー 1 つに適用する。適用先はキーフレームの選択状態で決まる
function budouxApplyToLayer(layer, result) {
	if (!(layer instanceof TextLayer)) {
		result.status = "skip";
		result.message = "テキストレイヤーではありません";
		return;
	}

	var sourceText = subtitleSourceText(layer);
	var selectedKeys = sourceText.selectedKeys;
	var k;
	if (selectedKeys && selectedKeys.length > 0) {
		// 選択されたキーフレームにのみ適用
		for (k = 0; k < selectedKeys.length; k++) {
			sourceText.setValueAtKey(selectedKeys[k], budouxApplyToDoc(sourceText.keyValue(selectedKeys[k])));
		}
	} else if (sourceText.numKeys > 0) {
		// キーフレームが存在するが未選択の場合：全キーフレームに適用
		for (k = 1; k <= sourceText.numKeys; k++) {
			sourceText.setValueAtKey(k, budouxApplyToDoc(sourceText.keyValue(k)));
		}
	} else {
		// キーフレームなしの場合：現在値に適用
		sourceText.setValue(budouxApplyToDoc(sourceText.value));
	}
	result.status = "ok";
}

// 選択中のテキストレイヤーに BudouX 改行を適用する
function applyBudoux() {
	var target = getActiveSelection("対象のテキストレイヤーを選択してください。");
	if (target.error) return JSON.stringify({ status: "error", message: target.error });

	var results = [];
	app.beginUndoGroup("BudouX改行を適用");
	try {
		for (var i = 0; i < target.layers.length; i++) {
			var result = { layer: target.layers[i].name };
			try {
				budouxApplyToLayer(target.layers[i], result);
			} catch (e) {
				result.status = "error";
				result.message = e.toString() + " (Line: " + e.line + ")";
			}
			results.push(result);
		}
	} finally {
		app.endUndoGroup();
	}
	return JSON.stringify({ status: "success", results: results });
}
