# Nibbler

"By far the best ICCF analysis tool for Leela." &mdash; *jhorthos*

Nibbler is intended to be somewhat like [Lizzie](https://github.com/featurecat/lizzie), but for [Leela Chess Zero](https://github.com/LeelaChessZero/lc0). In other words, it is a GUI that runs a single engine (in our case, Lc0) constantly, displaying opinions about the current position.

For prebuilt binary releases, see the [Releases](https://github.com/fohristiwhirl/nibbler/releases) section. For help, the [Discord](https://discordapp.com/invite/pKujYxD) may be your best bet, or open an issue here.

![Screenshot](https://user-images.githubusercontent.com/16438795/60531026-fef48580-9cf1-11e9-964e-723d502cfc72.png)

# Features

* Display Leela's top choices graphically.
* Choice of winrate, node %, or policy display.
* Optionally shows Leela statistics N, P, Q, U, and/or Q+U for each move.
* UCI `searchmoves` functionality.
* PGN loading via menu, clipboard, or drag-and-drop.
* Supports PGN variations of arbitrary depth.
* FEN loading.
* Versus Mode - where Leela only analyses one side.
* Various aesthetic adjustments are possible in the `config.json` file.

# Installation

Some Windows and Linux standalone releases are uploaded to the [Releases](https://github.com/fohristiwhirl/nibbler/releases) section from time to time. Just edit `config.json` to point to your copy of Lc0 and your weightsfile (and possibly change your backend, e.g. to `cudnn-fp16`) then run the Nibbler binary.

Running Nibbler from source requires Electron, but has no other dependencies. If you have Electron installed (e.g. `npm install -g electron`) you can likely enter the nibbler directory, then do `electron .`

The required Lc0 version is *v0.21.0 or later*. <!-- because we need `LogLiveStats` which was introduced in that version. --> Note that other UCI engines might run, but the results will be poor.

# Using an lc0.config file

Some people configure Leela with an `lc0.config` file in their Lc0 directory. If you do this, you should probably delete the `options` object from your Nibbler config file, as it is redundant.

# Using high resolution monitors

For high resolution monitors, various sizes can be upped in the config file to use more space and be more readable.

# Hints and tips

An option to enable the UCI `searchmoves` feature is available in the Analysis menu. Once enabled, one or more moves can be specified as moves to focus on; Leela will ignore other moves. This is useful when you think Leela isn't giving a certain move enough attention.

Leela forgets much of the evaluation if the position changes. To mitigate this, an option in the Analysis menu allows you to hover over a PV (on the right) and see it play out on the board, without changing the position we're actually analysing. You might prefer to halt Leela while doing this, so that the PVs don't change while you're looking at them.

If you like a different piece set, you can create a folder of `.png` or `.svg` files with the right names and point the `override_piece_directory` config option to it.

We try to be considerate and not use too much CPU for mundane tasks like drawing the PVs, arrows, highlights, *et cetera*; however if you want a snappier-feeling GUI, reduce the option `update_delay` (default 170) to something low like 25 (this is the number of milliseconds between redraws).

Leela running out of RAM can be a problem if searches go on too long. You might like to add a `RamLimitMb` to the UCI options part of your config file. See [here](https://github.com/LeelaChessZero/lc0/wiki/Lc0-options) for info about that and other UCI options.

# Thanks

Thanks to everyone in Discord and GitHub who's offered advice and suggestions; and thanks to all Lc0 devs and GPU-hours contributors!
