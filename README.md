# Nibbler

Nibbler is a real-time chess analysis GUI for Leela Chess Zero (Lc0) and other UCI-compatible chess engines such as Stockfish.

It runs an engine in the background, continuously evaluates the current position, shows candidate moves visually, and lets you force analysis of selected moves. The project is historically based on the original Nibbler by Rooklift and is loosely inspired by Lizzie and Sabaki.

Current maintained fork: https://github.com/perejaslav/nibbler

Latest Windows release: https://github.com/perejaslav/nibbler/releases/tag/v2.9.4

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
- PGN loading through menu, clipboard, or drag-and-drop.
- PGN variation support with arbitrary depth.
- FEN loading from clipboard or menu.
- Chess960 support.
- Analysis toolbar with quick access to engine controls, New game, FEN/PGN paste and copy, board flip, MultiPV, and focus clearing.
- Visual UCI engine settings dialog for standard engine options.
- Undo/Redo stack for tree operations (Edit menu, Ctrl+Z / Ctrl+Y).

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
2. Download `nibbler-2.9.3-windows.zip` or the newest available Windows archive.
3. Extract the archive to a folder of your choice.
4. Run `nibbler.exe`.
5. Configure your engine path from inside Nibbler if needed.

The 2.9.3 Windows build uses Electron 9.4.4.

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

- v2.9.4 — https://github.com/perejaslav/nibbler/releases/tag/v2.9.4
- Windows package: `releases/nibbler-2.9.4-windows.zip`

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
