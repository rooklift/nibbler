# Nibbler

Nibbler is a real-time chess analysis GUI for Leela Chess Zero (Lc0) and other UCI-compatible chess engines such as Stockfish.

It runs an engine in the background, continuously evaluates the current position, shows candidate moves visually, and lets you force analysis of selected moves. The project is historically based on the original Nibbler by Rooklift and is loosely inspired by Lizzie and Sabaki.

Current maintained fork: https://github.com/perejaslav/nibbler

Latest Windows release: https://github.com/perejaslav/nibbler/releases/tag/v3.0.0

![Screenshot](docs/images/screenshot.png)

## Highlights

- Real-time engine analysis for Lc0 and traditional UCI engines.
- Graphical display of top candidate moves.
- Winrate graph.
- Optional Leela statistics such as N, P, Q, S, U, V, and WDL.
- UCI `searchmoves` support.
- Automatic full-game analysis.
- Play against the engine from any position.
- Engine self-play from any position.
- PGN loading through menu, clipboard (Ctrl+V), or drag-and-drop.
- PGN variation support with arbitrary depth.
- FEN loading from clipboard or menu.
- Chess960 support.
- Analysis toolbar with quick access to engine controls, New game, FEN/PGN paste and copy, board flip, MultiPV, and focus clearing.
- Visual UCI engine settings dialog for standard engine options.
- Undo/Redo stack for tree operations (Edit menu, Ctrl+Z / Ctrl+Y).
- Modern Electron 44 (Chromium 152) platform.
- Automatic restoration of the last chess session, including all open games, variations, annotations, selected moves and active tab.

The current chess session is saved automatically every three seconds and when Nibbler closes normally. On the next launch, your game tabs and selected positions are restored. Snapshots are stored in `last-session.json` in Nibbler's user-data directory (with a `.bak` fallback); no manual PGN export is needed. Engine searches are not resumed automatically.

## What's new in 3.0.0

Version 3.0.0 is a platform release: Nibbler now runs on a modern Electron instead of the five-year-old Electron 9.

### Modern Electron platform

- **Electron 9.4.4 → 44.7.0** (Chromium 83 → 152, with a current Node.js runtime). Electron 9 stopped receiving security updates in 2021; the new build brings five years of browser-engine, security and performance updates.
- The app's architecture, settings, engine configuration and session files are unchanged. Your existing `config.json`, `engines.json` and `last-session.json` are picked up as-is.
- Clipboard access was reworked for the new Electron: the renderer no longer has direct clipboard access, so reading and writing go through the main process.
- Renderer crashes are detected through Electron's current `render-process-gone` event, so the crash warning still appears.
- The Windows build is now packaged with Electron 44.7.0 (`builder.py` updated).

### Pasting games with Ctrl+V

Ctrl+V now puts the game from the clipboard into the notation:

| Situation | What Ctrl+V does |
|---|---|
| A text field has focus (FEN box, comment editor) | Ordinary text paste |
| The current tab has no moves | Loads the PGN or FEN into this tab |
| The current tab already has moves | Opens the game in a new tab, leaving your analysis untouched |

- Works with any keyboard layout (for example Russian), because the physical V key is detected. Ctrl+Shift+V does the same.
- The toolbar's **Paste FEN/PGN** button, **Edit → Paste** and **File → Load FEN / PGN from clipboard** all behave the same way.
- Previously, pasting merged the game into the current tree as a side variation, failed with "start position not found" when the start position differed, did not react at all with a non-Latin keyboard layout, and hijacked Ctrl+V inside text fields.
- A clipboard with several games still opens the game chooser.

### Verified

- All 68 automated tests pass.
- Manually checked on Windows with Electron 44: engine analysis, engine comparison with two engines in parallel, Add PV to tree, PGN open / save / copy / paste, the move-list context menu, tabs, session save and restore on exit, clean shutdown of engine processes, and the packaged `nibbler.exe`.

### Known limitations

- On some Linux systems Electron 10+ shows a minor visual glitch when dragging pieces ([rooklift/nibbler#140](https://github.com/rooklift/nibbler/issues/140)). Windows is not affected. Linux and macOS builds of 3.0.0 were not tested.
- The Windows package is larger than before, because Chromium has grown.

The Windows build for this release is packaged as `nibbler-3.0.0-windows.zip`.

## What's new in 2.9.5

Version 2.9.5 restores the last chess session after closing and reopening Nibbler.

- Automatically saves all open game tabs every three seconds and once more on normal shutdown.
- Restores complete move trees, including variations, annotations, position evaluations, comments, graphical arrows/highlights, PGN tags, selected moves, the active tab, and board orientation.
- Stores the snapshot atomically in the Nibbler user-data directory, with backup recovery if the main session file is damaged. The original engine configuration is unaffected.
- Engine analysis does not restart automatically after recovery.

The Windows build for this release is packaged as `nibbler-2.9.5-windows.zip`.

## What's new in 2.9.4

Version 2.9.4 improves move-tree context menu reliability and adds standard chess position evaluations.

- Fixed **Delete ALL other lines** sometimes doing nothing when variations started below the first move. The chosen continuation is preserved and competing branches are removed.
- Fixed right-click context menus opening for the wrong move when clicking a gap or variation bracket; tree-editing actions are no longer silently discarded when input is queued, and the context menu can be reopened after dismissal.
- Added **Annotation → Position evaluation** with nine chess symbols (`=`, `∞`, `⩲`, `⩱`, `±`, `∓`, `+−`, `−+`, `⨀`). Position evaluations can coexist with move-quality marks (`!`, `?`, etc.).
- Standard PGN NAGs (`$10`, `$13`–`$19`, `$44`) are exported and imported with variations. Numeric move-quality NAGs (`$1`–`$6`) are also recognized on import.
- Position evaluations support Undo/Redo and can be cleared independently of move-quality annotations; Russian translations are included.

The Windows build for this release is packaged as `nibbler-2.9.4-windows.zip`.

## What's new in 2.9.3

Version 2.9.3 applies the saved settings of the second engine in an engine comparison.

- The second engine now receives its own saved options (Threads, Hash, MultiPV, WeightsFile and others) before it starts, the same way the main engine does.
- Lc0-like second engines get the Lc0 option set.

Note: both engines run at the same time, so give each about half of your CPU threads.

The Windows build for this release is packaged as `nibbler-2.9.3-windows.zip`.

## What's new in 2.9.2

Version 2.9.2 makes engine comparison (the Compare button) work as intended.

- The second engine now analyses the same position as the main engine: Go, Halt and every move are passed to both engines.
- The comparison panel updates live while the engines search, and each engine card shows that engine's best line.
- Agreement is reported as "partial" until both engines have a result, instead of "high" from a single engine.

The Windows build for this release is packaged as `nibbler-2.9.2-windows.zip`.

## What's new in 2.9.1

Version 2.9.1 changes the analysis toolbar and fixes a startup failure.

- The Root, Back, Forward and End buttons are replaced with New, Paste FEN/PGN and Copy PGN. Navigation is still available from the menus and keyboard shortcuts.
- Fixed a startup error that stopped the engine modules from loading.

The Windows build for this release is packaged as `nibbler-2.9.1-windows.zip`.

## What's new in 2.9.0

Version 2.9.0 makes Auto-evaluate line and Auto-evaluate line, backwards always advance through the game.

- Each position is now searched for a fixed time budget (10 seconds by default) instead of the per-engine special node limit, so the line keeps stepping even when the engine's node limit is enormous (e.g. 1 billion nodes, which previously stalled the auto modes indefinitely).
- The budget is configurable via the Analysis menu: "Auto-analysis time per position (ms)…".
- Ordinary analysis (Go/Lock) and play modes are unchanged and still use the configured node/time limits.

The Windows build for this release is packaged as `nibbler-2.9.0-windows.zip`.

## What's new in 2.8.0

Version 2.8.0 adds the first phase of multi-game tab support.

- New tab bar for opening and switching games.
- Each tab keeps its own tree, undo history, comments, PGN context, and book.
- Tab switching waits for the shared engine to stop before restoring the selected tab.
- `Ctrl+T`, `Ctrl+W`, `Ctrl+Tab`, and `Ctrl+Shift+Tab` are wired to tab actions.

The Windows build for this release is packaged as `nibbler-2.8.0-windows.zip`.

## What's new in 2.7.4

Version 2.7.4 adds PGN annotations, comments, and graphical markup support.

- PGN comments are preserved when loading and saving.
- Move annotations like `!`, `?`, `!?`, `?!`, `!!`, and `??` are shown in the movelist.
- Comments are shown inline in the movelist as short `{...}` previews, so it is clear which move has a comment.
- PGN graphical annotations `[%cal ...]` and `[%csl ...]` are round-tripped.
- Movelist context menu actions let you edit annotations and comments.
- The Windows build for this release is packaged as `nibbler-2.7.4-windows.zip`.

## What's new in 2.7.3

Version 2.7.3 adds an Undo/Redo stack for tree operations.

- New **Edit** menu with **Undo (Ctrl+Z)** and **Redo (Ctrl+Y)**.
- Tree-modifying operations can now be undone:
  - Making moves
  - Deleting nodes, children, siblings, or other lines
  - Promoting lines to main line or by one level
- Stack depth of 50 operations; new actions clear the redo history.
- A deep tree snapshot is taken before each operation so the entire tree
  can be restored exactly as it was, including variations and analysis
  structure.

## What's new in 2.7.2

Version 2.7.2 adds a compact current-engine name display to the main analysis window.

- The active UCI engine name is now shown above the analysis toolbar.
- The name is taken directly from the engine's `id name` UCI response.
- The display is cleared when switching or restarting engines until the new engine reports its name.
- Long engine names are clipped cleanly without disrupting the toolbar layout.

Windows build for this release is available here:

https://github.com/perejaslav/nibbler/releases/tag/v2.7.2

## Installation

### Windows

1. Open the latest release page:
   https://github.com/perejaslav/nibbler/releases
2. Download `nibbler-3.0.0-windows.zip` or the newest available Windows archive.
3. Extract the archive to a folder of your choice.
4. Run `nibbler.exe`.
5. Configure your engine path from inside Nibbler if needed.

The 3.0.0 Windows build uses Electron 44.7.0. Builds up to 2.9.5 used Electron 9.4.4.

Upgrading from 2.x: extract the new archive and run it. Settings, engines and the last session stay in the same user-data folder (`%APPDATA%\Nibbler`). To be safe, copy that folder before the first launch; to roll back, run the old build again.

### Run from source

Nibbler can also be run directly from source. This is useful for development or quick local checks.

Requirements:

- Node.js / npm
- Electron

From the repository root:

```bash
cd files/src
npx electron .
```

A global Electron install also works:

```bash
npm install -g electron
electron .
```

Nibbler is a classic Electron application. It does not require a modern JavaScript build step for normal development.

### Linux and macOS

The upstream project historically provided install scripts for Linux and macOS. They may still be useful, but they may not install this fork's latest release.

Legacy upstream Linux script:

```bash
curl -L https://raw.githubusercontent.com/rooklift/nibbler/master/files/scripts/install.sh | bash
```

Legacy upstream macOS script:

```bash
curl -L https://raw.githubusercontent.com/rooklift/nibbler/master/files/scripts/install_mac.sh | bash
```

For this fork, prefer the Releases page unless you specifically want to build or run from source.

## Engine setup

Nibbler works best when a UCI-compatible engine is configured correctly.

For Lc0, see the official Lc0 quickstart and configuration documentation:

- https://lczero.org/play/quickstart/
- https://lczero.org/play/configuration/flags/

For Stockfish and other traditional UCI engines, typical important options include:

- `Threads`
- `Hash`
- `MultiPV`

For maximum strength in some engines, `MultiPV` should often be kept at `1`, while `Threads` and `Hash` should be set appropriately for your hardware.

## Engine options

Engine options can be configured in several ways.

### Visual UCI settings dialog

Use:

```text
Engine > Engine settings...
```

The dialog shows known options for the current engine and provides visual controls for standard UCI option types:

- `check` — checkbox
- `spin` — numeric input
- `combo` — dropdown list
- `string` — text field

Confirmed changes are saved and applied through the existing engine configuration flow where possible.

### Manual configuration

Advanced users can still use manual configuration:

- Lc0 can load options from `lc0.config` at startup.
- Nibbler can send UCI options stored in its own `engines.json` file, available from the Dev menu.

Manual configuration remains the safest option for engine-specific, unusual, or unsupported settings.

## Analysis tips

The UCI `searchmoves` feature is available from the Analysis menu. Once enabled, one or more moves can be selected as focus moves. The engine will ignore other moves. This is useful when a move appears under-analysed.

When browsing principal variations on the right side of the interface, Nibbler can show the PV on the board without changing the actual analysed position. Halting the engine while inspecting PVs can make this easier, because the displayed lines will not keep changing.

Long searches can consume significant memory. If your engine runs out of RAM, consider setting a reasonable node limit from the Engine menu.

## Development notes

Nibbler's runnable source lives under:

```text
files/src
```

Important files include:

```text
files/src/main.js
files/src/nibbler.html
files/src/nibbler.css
files/src/renderer/
```

The project intentionally keeps the renderer simple and does not require React, Vue, TypeScript migration, or a bundler for ordinary changes.

To run syntax checks on changed JavaScript files:

```bash
node --check files/src/main.js
node --check files/src/renderer/90_engine.js
node --check files/src/renderer/95_hub.js
node --check files/src/renderer/94_uci_options_dialog.js
```

To run the app locally:

```bash
cd files/src
npx electron .
```

## Releases

Current release:

- v3.0.0 — https://github.com/perejaslav/nibbler/releases/tag/v3.0.0
- Windows package: `releases/nibbler-3.0.0-windows.zip`

All releases:

- https://github.com/perejaslav/nibbler/releases

## Upstream and credits

This repository is a maintained fork of the original Nibbler project by Rooklift:

- https://github.com/rooklift/nibbler

Thanks to everyone in the original Discord and GitHub community who contributed advice, testing, and suggestions. Thanks also to all Lc0 developers and GPU-hours contributors.

The chess pieces are from Lichess:

- https://lichess.org/

Icon design by ciriousjoker, based on this icon:

- https://github.com/ciriousjoker
- https://www.svgrepo.com/svg/155301/chess

## License

Nibbler is licensed under GPL-3.0. See `LICENSE.md` for details.
