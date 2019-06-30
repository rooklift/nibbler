# Nibbler

*Nibbler* is intended to be somewhat like [Lizzie](https://github.com/featurecat/lizzie), but for [Leela Chess Zero](https://github.com/LeelaChessZero/lc0). In other words, it is a GUI that runs a single engine (in our case, Lc0) constantly, displaying opinions about the current position.

For prebuilt binary releases, see the [Releases](https://github.com/fohristiwhirl/nibbler/releases) section.

![Screenshot](https://user-images.githubusercontent.com/16438795/60183484-52606280-981e-11e9-9c10-4bb305023c35.png)

# Features

* Display Leela's top choices graphically.
* Choice of winrate, node %, or policy display.
* PGN loading via menu, clipboard, or drag-and-drop.
* Supports PGN variations of arbitrary depth.
* FEN loading.
* Clickable moves in the variation lists.
* UCI `searchmoves` functionality.
* Versus Mode - where Leela only analyses one side.
* Various aesthetic adjustments are possible in the `config.json` file.

Nibbler is a work-in-progress. See or comment on the [todo list](https://github.com/fohristiwhirl/nibbler/issues/10) of hoped-for features.

# Installation

Some Windows and Linux standalone releases are uploaded to the [Releases](https://github.com/fohristiwhirl/nibbler/releases) section from time to time. Just edit `config.json` to point to your copy of Lc0 and your weightsfile (and possibly change your backend, e.g. to `cudnn-fp16`) then run the Nibbler binary.

Running Nibbler from source requires Electron, but has no other dependencies. If you have Electron installed (e.g. `npm install -g electron`) you can likely enter the nibbler directory, then do `electron .`

*The required Lc0 version is v0.21.0 or later*. <!-- because we need `LogLiveStats` which was introduced in that version. -->

# Using an lc0.config file

Some people configure Leela with an `lc0.config` file in their Lc0 directory. If you do this, you should probably delete the `options` object from your Nibbler config file, as it is redundant.

# Hints and tips

An option to enable the UCI `searchmoves` feature is available in the Analysis menu. Once enabled, one or more moves can be specified as moves to focus on; Leela will ignore other moves. This is useful when you think Leela isn't giving a certain move enough attention.

Leela forgets much of the evaluation if the position changes. To mitigate this, an option in the Analysis menu allows you to hover over a a move (at any depth) in any PV, upon which the resulting board will be displayed (without actually going there).

If you like a different piece set, you can create a folder of `.png` or `.svg` files with the right names and point the `override_piece_directory` config option to it.

We try to be considerate and not use too much CPU for mundane tasks like drawing the PVs, arrow, highlights, *et cetera*; however if you want a snappier-feeling GUI, reduce the option `update_delay` (default 170) to something low like 25 (this is the number of milliseconds between redraws).

# Thanks

Thanks to everyone in Discord and GitHub who's offered advice and suggestions; and thanks to all Lc0 devs and GPU-hours contributors!
