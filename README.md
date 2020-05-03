# Nibbler

"By far the best ICCF analysis tool for Leela." &mdash; *jhorthos*

Nibbler is a real-time analysis GUI for [Leela Chess Zero](http://lczero.org/play/quickstart/) (Lc0), which runs Leela in the background and constantly displays opinions about the current position. You can also compel the engine to evaluate one or more specific moves. Nibbler is loosely inspired by [Lizzie](https://github.com/featurecat/lizzie) and [Sabaki](https://github.com/SabakiHQ/Sabaki).

For prebuilt binary releases, see the [Releases](https://github.com/fohristiwhirl/nibbler/releases) section. For help, the [Discord](https://discordapp.com/invite/pKujYxD) may be your best bet, or open an issue here.

![Screenshot](https://user-images.githubusercontent.com/16438795/80602436-088c6e00-8a27-11ea-8163-d26b176f17af.png)

# Features

* Display Leela's top choices graphically.
* Winrate graph.
* Choice of winrate, node %, or policy display.
* Optionally shows Leela statistics like N, P, Q, S, U, V, and WDL for each move.
* UCI `searchmoves` functionality.
* PGN loading via menu, clipboard, or drag-and-drop.
* Supports PGN variations of arbitrary depth.
* FEN loading.
* Versus Mode - where Leela only analyses one side.
* Chess 960.
* Automatic full-game analysis.

# Installation - the simple way

Some Windows and Linux standalone releases are uploaded to the [Releases](https://github.com/fohristiwhirl/nibbler/releases) section from time to time. Mac builds are harder to make but [@twoplan](https://github.com/twoplan) is experimenting with it in [this repo](https://github.com/twoplan/Nibbler-for-macOS).

# Installation - the hard way

Running Nibbler from source requires Electron, but has no other dependencies. If you have Electron installed (e.g. `npm install -g electron`) you can likely enter the Nibbler directory, then do `electron .` to run it. This is mostly tested with Electron 5, but older and newer versions may work too.

# Aesthetic adjustments

As well as the menu options, various aesthetic adjustments are possible in the `config.json` file, which can be found via the App menu. For example, board colour can be changed.

If you like a different piece set, you can create a folder of `.png` or `.svg` files with [the right names](https://github.com/fohristiwhirl/nibbler/tree/master/pieces) and point the `override_piece_directory` config option to it.

# Advanced engine options

All Leela's UCI engine options can be set in two ways: in the options part of Nibbler's own `config.json` file (which you can find via the App menu) or in a file called `lc0.config` in the same folder as Leela - for info about how to use that, see [here](https://github.com/LeelaChessZero/lc0/blob/master/FLAGS.md).

See also [this list of UCI options](https://github.com/LeelaChessZero/lc0/wiki/Lc0-options) supported by Leela.

# Hints and tips

An option to enable the UCI `searchmoves` feature is available in the Analysis menu. Once enabled, one or more moves can be specified as moves to focus on; Leela will ignore other moves. This is useful when you think Leela isn't giving a certain move enough attention.

Leela forgets much of the evaluation if the position changes. To mitigate this, an option in the Analysis menu allows you to hover over a PV (on the right) and see it play out on the board, without changing the position we're actually analysing. You might prefer to halt Leela while doing this, so that the PVs don't change while you're looking at them.

Leela running out of RAM can be a problem if searches go on too long. You might like to use the UCI option `RamLimitMb` (see *advanced engine options*, above).

Note that other UCI engines should run OK if they support Chess960 castling format, but the results will be poor because we use `MultiPV`, which cripples traditional A/B engines.

# Thanks

Thanks to everyone in Discord and GitHub who's offered advice and suggestions; and thanks to all Lc0 devs and GPU-hours contributors!

The pieces are from [Lichess](https://lichess.org/).
