
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
		}
		children.push(item);
	}
	return children;
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

// 選択中の音声レイヤーごとに、同名の lab ファイルから口パクのキーフレームを生成する
function generateLipSync(optionsStr) {
	var comp = app.project.activeItem;
	if (!comp || !(comp instanceof CompItem)) {
		return JSON.stringify({ status: "error", message: "コンポジションを選択してから実行してください。" });
	}
	if (comp.selectedLayers.length === 0) {
		return JSON.stringify({ status: "error", message: "対象の音声レイヤーを選択してください。" });
	}

	var opt;
	var regex;
	try {
		opt = JSON.parse(optionsStr);
		regex = new RegExp(opt.regex);
	} catch (e) {
		return JSON.stringify({ status: "error", message: "設定が正しくありません: " + e.toString() });
	}

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
	var selected = comp.selectedLayers;
	app.beginUndoGroup("口パク生成");
	try {
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
	} finally {
		app.endUndoGroup();
	}
	return JSON.stringify({ status: "success", results: results });
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

