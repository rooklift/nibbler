# Nibbler

Nibbler is a real-time analysis GUI for [Leela Chess Zero](http://lczero.org/play/quickstart/) (Lc0), which runs Leela in the background and constantly displays opinions about the current position. You can also compel the engine to evaluate one or more specific moves. Nibbler is loosely inspired by [Lizzie](https://github.com/featurecat/lizzie) and [Sabaki](https://github.com/SabakiHQ/Sabaki).

These days, Nibbler more-or-less works with traditional engines like [Stockfish](https://stockfishchess.org/), too. (Ensure `MultiPV` is `1`, `Threads` (CPU) is set, and `Hash` is set (more is better), for maximum strength.)

For prebuilt binary releases, see the [Releases](https://github.com/rooklift/nibbler/releases) section. For help, the [Discord](https://discordapp.com/invite/pKujYxD) may be your best bet, or open an issue here.

![Screenshot](https://user-images.githubusercontent.com/16438795/270297798-a432ea17-3601-4143-bddb-97420a0d6e6c.png)

## Features

* Display Leela's top choices graphically.
* Winrate graph.
* Optionally shows Leela statistics like N, P, Q, S, U, V, and WDL for each move.
* UCI `searchmoves` functionality.
* Automatic full-game analysis.
* Play against Leela from any position.
* Leela self-play from any position.
* PGN loading via menu, clipboard, or drag-and-drop.
* Supports PGN variations of arbitrary depth.
* FEN loading.
* Chess 960.

## Installation - Windows / Linux

Some Windows and Linux standalone releases are uploaded to the [Releases](https://github.com/rooklift/nibbler/releases) section from time to time.

*Alternatively*, it is possible to run Nibbler from source. This requires Electron, but has no other dependencies. If you have Electron installed (e.g. `npm install -g electron`) you can likely enter the `/src` directory, then do `electron .` to run it. Nibbler should be compatible with at least version 5 and above.

You could also build a standalone app. See comments inside the Python script `builder.py` for info.

## Linux install script

Linux users can make use of the following *one-liner* to install the latest version of Nibbler:

```bash
curl -L https://raw.githubusercontent.com/rooklift/nibbler/master/files/scripts/install.sh | bash
```

## Installation - Mac

Mac builds have been made by [twoplan](https://github.com/twoplan/Nibbler-for-macOS) and [Jac-Zac](https://github.com/Jac-Zac/Nibbler_MacOS) and [Zamana](https://github.com/Zamana/nibbler) - the last of which is probably the most up-to-date.

## Advanced engine options

Most people won't need them, but all of Leela's engine options can be set in two ways:

* Leela automatically loads options from a file called `lc0.config` at startup - see [here](https://lczero.org/play/configuration/flags/#config-file).
* Nibbler will send UCI options specified in Nibbler's own `engines.json` file (which you can find via the Dev menu).

## Hints and tips

An option to enable the UCI `searchmoves` feature is available in the Analysis menu. Once enabled, one or more moves can be specified as moves to focus on; Leela will ignore other moves. This is useful when you think Leela isn't giving a certain move enough attention.

Leela forgets much of the evaluation if the position changes. To mitigate this, an option in the Analysis menu allows you to hover over a PV (on the right) and see it play out on the board, without changing the position we're actually analysing. You might prefer to halt Leela while doing this, so that the PVs don't change while you're looking at them.

Leela running out of RAM can be a problem if searches go on too long. You might like to set a reasonable node limit (in the Engine menu), perhaps 10 million or so.

## Thanks

Thanks to everyone in Discord and GitHub who's offered advice and suggestions; and thanks to all Lc0 devs and GPU-hours contributors!

The pieces are from [Lichess](https://lichess.org/).

Icon design by [ciriousjoker](https://github.com/ciriousjoker) based on [this](https://www.svgrepo.com/svg/155301/chess).
