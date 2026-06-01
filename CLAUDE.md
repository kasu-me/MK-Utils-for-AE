# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 前提条件

- **受け答えは日本語で行ってください。**
- 全てのファイルはUTF-8で保存されています。
- 本プロジェクトは日本語で開発されています。

## Project Overview

**PSD Tool for AE** is an Adobe After Effects CEP (Common Extensibility Platform) extension panel. It provides a UI for managing PSD layer visibility hierarchies and performing keyframe operations in After Effects. The codebase targets Japanese animation workflows (stand-art animation).

## No Build System

This is a static CEP extension — no npm, no bundler, no transpilation. Files are deployed by copying them directly to the AE extension directory. There are no build, lint, or test commands.

**Installation path (Windows):**
```
C:\Users\<user>\AppData\Roaming\Adobe\CEP\extensions\psdtool_ae\
```

**Enabling unsigned extensions (Windows registry):**
```
HKEY_CURRENT_USER\Software\Adobe\CSXS.11 → PlayerDebugMode = 1
```

## Architecture

The extension follows the standard CEP two-process architecture:

```
After Effects Host Process
  └── hostscript.jsx  (ExtendScript — runs inside AE, has access to AE DOM)
        ↕ JSON over CSInterface.evalScript bridge
CEP Panel (Chromium process)
  └── index.html + js/main.js  (Vanilla JS — runs in embedded browser)
```

- **[js/main.js](js/main.js)** — All frontend logic: tree rendering, event handling, preset persistence (localStorage), keyframe button logic, theme sync with AE
- **[jsx/hostscript.jsx](jsx/hostscript.jsx)** — All AE scripting: layer hierarchy traversal, visibility toggling, keyframe get/move/delete
- **[jsx/ImportSubtitles.jsx](jsx/ImportSubtitles.jsx)** — Standalone ScriptUI panel (not part of the CEP panel) for subtitle import with BudouX Japanese line-breaking
- **[CSXS/manifest.xml](CSXS/manifest.xml)** — Extension ID `com.example.psdtool.panel`, targets AEFT (After Effects), CSXS runtime 9.0

## CEP Bridge Pattern

Frontend calls backend via `CSInterface.evalScript()`. All data exchange uses JSON strings:

```js
// Frontend (main.js)
csInterface.evalScript(`getHierarchy()`, (result) => {
    const data = JSON.parse(result);
});
```

```js
// Backend (hostscript.jsx) — functions must return JSON strings
function getHierarchy() {
    // ...
    return JSON.stringify(result);
}
```

Backend errors must be returned as JSON too (not thrown), since exceptions cross the bridge as undefined.

## Layer Naming Convention

The PSD layer naming determines UI control type in the tree:

| Prefix | Behavior |
|--------|----------|
| `*` | Radio button — mutually exclusive within sibling group |
| `!` | Locked — always visible, cannot be toggled |
| (none) | Checkbox — independent toggle |

This convention is parsed in `getHierarchy()` in [jsx/hostscript.jsx](jsx/hostscript.jsx).

## Key Data Structures

**Frontend global state (main.js):**
- `g_expansionState` — `{[nodeId]: bool}` — which tree nodes are expanded
- `g_storedKeyframes` — array of keyframe references collected for move operations
- Presets stored in localStorage with key: `psdtool_presets_[projectPath]_[compId]`

**Hierarchy node (JSON from backend):**
```json
{
  "name": "layerName",
  "type": "checkbox|radio|locked",
  "visible": true,
  "children": [...],
  "layerIndex": 3
}
```

## ImportSubtitles.jsx Specifics

This file is a **separate ScriptUI panel**, not loaded through CEP. It is installed to:
```
C:\Program Files\Adobe\Adobe After Effects 2026\Support Files\Scripts\ScriptUI Panels\
```

It embeds the BudouX Japanese phrase-breaking model inline as a hardcoded data structure (lines ~18-19). The model is from Google's BudouX project (Apache 2.0). The `budouxParse()` function uses this model to determine phrase boundaries for intelligent line-wrapping of Japanese subtitle text.
