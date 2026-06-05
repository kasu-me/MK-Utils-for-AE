var csInterface = new CSInterface();
var g_lyricsBlocks = null;

var MAPPER_EXTENSION_ID = 'com.example.lyrics.mapper';
// 両パネルが共有する受け渡しファイル（同じ拡張フォルダ直下）
var TRANSFER_PATH = urlToFsPath(window.location.href.replace(/[^\/]*$/, '') + 'lyrics_transfer.json');

updateTheme();
csInterface.addEventListener(CSInterface.THEME_COLOR_CHANGED_EVENT, updateTheme);

// Lyrics Mapper を CEP の別ウィンドウとして開く
document.getElementById('btn-open-mapper').addEventListener('click', function () {
	var beforeId = readTransferId();
	csInterface.requestOpenExtension(MAPPER_EXTENSION_ID, '');
	// ModalDialog が閉じた後（＝ここに制御が戻った時）に受け渡しファイルを読む。
	// 非同期で戻る環境に備え、短時間だけポーリングのフォールバックも行う。
	pollTransfer(beforeId, 0);
});

// 受け渡しファイルから取り込み済み判定用の id を取得
function readTransferId() {
	if (!window.cep || !window.cep.fs) return null;
	var r = window.cep.fs.readFile(TRANSFER_PATH);
	if (r.err !== 0) return null;
	try {
		return JSON.parse(r.data).id;
	} catch (e) {
		return null;
	}
}

// 受け渡しファイルを監視し、新しい送信があれば取り込む
function pollTransfer(beforeId, tries) {
	if (!window.cep || !window.cep.fs) {
		showStatus('エラー: ファイルIO APIが利用できません', true);
		return;
	}
	var r = window.cep.fs.readFile(TRANSFER_PATH);
	if (r.err === 0) {
		var payload = null;
		try {
			payload = JSON.parse(r.data);
		} catch (e) { payload = null; }
		if (payload && payload.id !== beforeId && validateBlocks(payload.blocks)) {
			setLyricsData(payload.blocks);
			showStatus('Lyrics Mapperからデータを取り込みました');
			return;
		}
	}
	if (tries < 40) { // 最大約20秒間フォールバック監視
		setTimeout(function () { pollTransfer(beforeId, tries + 1); }, 500);
	}
}

// file:/// URL を Windows のファイルシステムパスに変換
function urlToFsPath(url) {
	var s = url.replace(/^file:\/+/, '');
	s = decodeURIComponent(s);
	return s.replace(/\//g, '\\');
}

// JSON ファイルを直接選択
document.getElementById('btn-select-json').addEventListener('click', function () {
	document.getElementById('json-input').click();
});

document.getElementById('json-input').addEventListener('change', function (e) {
	var file = e.target.files[0];
	if (!file) return;

	var reader = new FileReader();
	reader.onload = function (ev) {
		var blocks;
		try {
			blocks = JSON.parse(ev.target.result);
		} catch (err) {
			showStatus('エラー: JSONのパースに失敗しました', true);
			return;
		}
		if (!validateBlocks(blocks)) {
			showStatus('エラー: JSONの形式が正しくありません', true);
			return;
		}
		setLyricsData(blocks);
		showStatus('JSONファイルを読み込みました');
	};
	reader.readAsText(file, 'utf-8');
	e.target.value = '';
});

// テキスト配置実行
document.getElementById('btn-place').addEventListener('click', function () {
	if (!g_lyricsBlocks) return;

	var mode = document.querySelector('input[name="lyricsMode"]:checked').value;
	var fn = mode === 'keyframes' ? 'importLyricsAsKeyframes' : 'importLyricsAsLayers';

	var jsonStr = JSON.stringify(g_lyricsBlocks);
	var escaped = JSON.stringify(jsonStr);
	csInterface.evalScript(fn + '(' + escaped + ')', function (result) {
		try {
			var res = JSON.parse(result);
			if (res.error) {
				showStatus('エラー: ' + res.error, true);
			} else {
				showStatus('完了: ' + res.count + '件配置しました');
			}
		} catch (err) {
			showStatus('エラー: 予期しない応答', true);
		}
	});
});

function setLyricsData(blocks) {
	g_lyricsBlocks = blocks;
	document.getElementById('json-loaded').textContent = blocks.length + '件のデータを読み込み済み';
	document.getElementById('btn-place').disabled = false;
}

function validateBlocks(blocks) {
	return Array.isArray(blocks) && !blocks.some(function (b) {
		return typeof b.startSec !== 'number' ||
			typeof b.endSec !== 'number' ||
			typeof b.text !== 'string';
	});
}

function showStatus(msg, isError) {
	var el = document.getElementById('status');
	el.textContent = msg;
	el.style.color = isError ? '#ff6666' : 'var(--status-fg)';
}

function updateTheme() {
	var hostEnv = csInterface.getHostEnvironment();
	if (!hostEnv || !hostEnv.appSkinInfo) return;

	var skin = hostEnv.appSkinInfo;
	var panelBg = skin.panelBackgroundColor.color;

	document.body.style.backgroundColor = toHex(panelBg);

	var brightness = (panelBg.red * 299 + panelBg.green * 587 + panelBg.blue * 114) / 1000;

	if (brightness > 128) {
		document.body.style.color = '#333333';
		setCSSVar('--btn-bg', '#e0e0e0');
		setCSSVar('--btn-fg', '#333333');
		setCSSVar('--btn-border', '#aaaaaa');
		setCSSVar('--btn-hover', '#d0d0d0');
		setCSSVar('--label-fg', '#666666');
		setCSSVar('--status-fg', '#555555');
	} else {
		document.body.style.color = '#cccccc';
		setCSSVar('--btn-bg', '#555555');
		setCSSVar('--btn-fg', '#f0f0f0');
		setCSSVar('--btn-border', '#666666');
		setCSSVar('--btn-hover', '#666666');
		setCSSVar('--label-fg', '#888888');
		setCSSVar('--status-fg', '#888888');
	}

	if (skin.baseFontSize) {
		document.body.style.fontSize = skin.baseFontSize + 'px';
	}
}

function toHex(color) {
	function hex(n) { return (n < 16 ? '0' : '') + Math.round(n).toString(16); }
	return '#' + hex(color.red) + hex(color.green) + hex(color.blue);
}

function setCSSVar(name, value) {
	document.documentElement.style.setProperty(name, value);
}
