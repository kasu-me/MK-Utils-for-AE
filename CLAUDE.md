# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 前提条件

- **受け答えは日本語で行ってください。**
- 全てのファイルはUTF-8で保存されています。
- 本プロジェクトは日本語で開発されています。

## Repository Structure

This is a monorepo containing multiple independent tools:

| Directory | Type | Description |
|-----------|------|-------------|
| [psdtool_ae/](psdtool_ae/) | CEP Extension | PSD layer visibility control panel |
| [ImportSubtitles/](ImportSubtitles/) | ScriptUI Panel | Subtitle auto-generation script |
| [lyrics-mapper/](lyrics-mapper/) | Browser Tool | Lyric block editor (exports JSON for AE) |

## Project Overview

**PSD Tool for AE** is an Adobe After Effects CEP (Common Extensibility Platform) extension panel. It provides a UI for managing PSD layer visibility hierarchies and performing keyframe operations in After Effects. The codebase targets Japanese animation workflows (stand-art animation).

## No Build System

All tools are static — no npm, no bundler, no transpilation. CEP extensions are deployed by copying (or symlinking) directories to the AE extension path. There are no build, lint, or test commands.

**CEP extension installation path (Windows):**
```
C:\Users\<user>\AppData\Roaming\Adobe\CEP\extensions\psdtool_ae\
  → symlink target: D:\workspace_git\psdtool_ae\psdtool_ae\
```

**ScriptUI panel installation path (Windows):**
```
C:\Program Files\Adobe\Adobe After Effects 2026\Support Files\Scripts\ScriptUI Panels\ImportSubtitles.jsx
  → symlink target: D:\workspace_git\psdtool_ae\ImportSubtitles\ImportSubtitles.jsx
```

To update symlinks after reorganization, run `update-symlinks-admin.ps1` as administrator.

**Enabling unsigned extensions (Windows registry):**
```
HKEY_CURRENT_USER\Software\Adobe\CSXS.11 → PlayerDebugMode = 1
```

## Architecture

The CEP extension (`psdtool_ae/`) follows the standard CEP two-process architecture:

```
After Effects Host Process
  └── hostscript.jsx  (ExtendScript — runs inside AE, has access to AE DOM)
        ↕ JSON over CSInterface.evalScript bridge
CEP Panel (Chromium process)
  └── index.html + js/main.js  (Vanilla JS — runs in embedded browser)
```

- **[psdtool_ae/js/main.js](psdtool_ae/js/main.js)** — All frontend logic: tree rendering, event handling, preset persistence (localStorage), keyframe button logic, theme sync with AE
- **[psdtool_ae/jsx/hostscript.jsx](psdtool_ae/jsx/hostscript.jsx)** — All AE scripting: layer hierarchy traversal, visibility toggling, keyframe get/move/delete
- **[ImportSubtitles/ImportSubtitles.jsx](ImportSubtitles/ImportSubtitles.jsx)** — Standalone ScriptUI panel (not part of the CEP panel) for subtitle import with BudouX Japanese line-breaking
- **[psdtool_ae/CSXS/manifest.xml](psdtool_ae/CSXS/manifest.xml)** — Extension ID `com.example.psdtool.panel`, targets AEFT (After Effects), CSXS runtime 9.0

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

This convention is parsed in `getHierarchy()` in [psdtool_ae/jsx/hostscript.jsx](psdtool_ae/jsx/hostscript.jsx).

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

**[ImportSubtitles/ImportSubtitles.jsx](ImportSubtitles/ImportSubtitles.jsx)** is a **separate ScriptUI panel**, not loaded through CEP. It is installed to:
```
C:\Program Files\Adobe\Adobe After Effects 2026\Support Files\Scripts\ScriptUI Panels\
```

It embeds the BudouX Japanese phrase-breaking model inline as a hardcoded data structure (lines ~18-19). The model is from Google's BudouX project (Apache 2.0). The `budouxParse()` function uses this model to determine phrase boundaries for intelligent line-wrapping of Japanese subtitle text.
