var csInterface = new CSInterface();

updateTheme();
csInterface.addEventListener(CSInterface.THEME_COLOR_CHANGED_EVENT, updateTheme);

document.getElementById('btn-select-json').addEventListener('click', function() {
    document.getElementById('json-input').click();
});

document.getElementById('json-input').addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function(ev) {
        var jsonStr = ev.target.result;

        var blocks;
        try {
            blocks = JSON.parse(jsonStr);
        } catch (err) {
            showStatus('エラー: JSONのパースに失敗しました', true);
            return;
        }
        if (!Array.isArray(blocks) || blocks.some(function(b) {
            return typeof b.startSec !== 'number' ||
                   typeof b.endSec   !== 'number' ||
                   typeof b.text     !== 'string';
        })) {
            showStatus('エラー: JSONの形式が正しくありません', true);
            return;
        }

        var mode = document.querySelector('input[name="lyricsMode"]:checked').value;
        var fn = mode === 'keyframes' ? 'importLyricsAsKeyframes' : 'importLyricsAsLayers';

        // JSON文字列をブリッジ経由で渡すため二重エスケープ
        var escaped = JSON.stringify(jsonStr);
        csInterface.evalScript(fn + '(' + escaped + ')', function(result) {
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
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
});

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
