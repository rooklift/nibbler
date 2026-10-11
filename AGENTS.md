# Nibbler — Agent Instructions

## Project Overview
Electron GUI for Leela Chess Zero (Lc0) / UCI chess engines. Version 2.9.5.

## Run
```
cd files/src && electron .
```
No build step needed for development. The app IS the source.

## Build (Windows/Linux)
1. Download Electron release (v44.7.0) into `files/scripts/electron_zipped/electron-v44.7.0-{platform}-x64.zip`
2. Run `python files/scripts/builder.py`

## Code Structure

### Main process (`files/src/main.js`)
- Electron main process, handles window, menus, IPC
- Loads config early via `modules/config_io`
- No hot reload — restart after changes

### Renderer (pure vanilla JS, no framework)
- `files/src/renderer/` — numbered files indicate load order: `10_globals.js` → `99_start.js`
- `files/src/ibbler.html` — entry point, loads renderer scripts
- `files/src/nibbler.html` — main layout, includes `#analysistoolbar` container with 13 buttons
- `files/src/nibbler.css` — toolbar layout uses flexbox with wrap inside grid area `t`
- `files/src/modules/` — utilities (translations, config I/O, etc.)
- Toolbar click dispatch in `95_hub.js:toolbar_click()` via `EventPathString("toolbar_")` prefix matching
- Toolbar state sync in `95_hub.js:update_toolbar_state()` called from `draw()` and `set_behaviour_direct()`

### Config
- JSON in `userData` path (set by Electron)
- Loaded via `modules/config_io.js`

## Quirks
- `contextIsolation: false`, `nodeIntegration: true` — renderer has full Node access
- Electron v44: the renderer has no `clipboard` module, it goes through main-process IPC (`clipboard_read_text` / `clipboard_write_text`); main-process `clipboard.readText()` returns a Promise — use `read_clipboard_text()` in the renderer
- No automated tests — verify manually

## Known Issues
- Electron 10+ has a minor drag glitch on some Linux setups: https://github.com/rooklift/nibbler/issues/140

<!-- SPECKIT START -->
For the current Spec Kit feature, read `specs/001-uci-engine-settings/plan.md`
for technologies, project structure, shell commands, and verification guidance.
<!-- SPECKIT END -->
