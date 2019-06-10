# Nibbler

*Nibbler* is intended to be somewhat like [Lizzie](https://github.com/featurecat/lizzie), but for [Leela Chess Zero](https://github.com/LeelaChessZero/lc0). In other words, it is a GUI that runs a single engine (in our case, Lc0) constantly, displaying opinions about the current position.

![Screenshot](https://user-images.githubusercontent.com/16438795/59159439-7c492380-8ac1-11e9-9dde-71c1353c5909.png)

# Features

* Display Leela's top choices graphically.
* One-click movement! Play one of Leela's choices by clicking on its target square.
* (You can still make moves the old fashioned way, by clicking the moving piece first, of course.)
* PGN and FEN loading.
* Clickable moves in the variation lists.
* Various aesthetic adjustments are possible in the `config.json` file.

Nibbler is a work-in-progress. See or comment on the [todo list](https://github.com/fohristiwhirl/nibbler/issues/10) of hoped-for features.

# Installation

If you have Windows, fully functional releases are uploaded to the [Releases](https://github.com/fohristiwhirl/nibbler/releases) section from time to time. Just edit `config.json` to point to your copy of Lc0 and your weightsfile, then double-click `Nibbler.exe`.

Otherwise, running Nibbler from source requires Electron, but has no other dependencies. If you have Electron installed (e.g. `npm install -g electron`) you can likely enter the nibbler directory, then do `electron .`

For full functionality, the required Lc0 version is (I believe) v0.21.0 or later, as we use Leela's `LogLiveStats` option, which was introduced in that version. While it is also *possible* to use a different engine (e.g. Stockfish) we do send the `MultiPV 500` command, which seems to drastically reduce traditional engine strength.

# About config options

The `config.json` file can be edited. Most of the options are self-explanatory, except the following:

* `bad_move_threshold` is the winrate loss (compared to best move) required to draw a move in the "bad" colour.
* `terrible_move_threshold` is the same, except moves will be drawn in the "terrible" colour.
* `node_display_threshold` controls how many visits a move must have (compared to best) to be shown at all.
* `update_delay` controls how often Nibbler draws to the screen; lower is faster but more CPU intensive.

# Thanks

Thanks for helpful discussions and advice from borg, brinan, Chad, coolchess123, crem, Faroe22, jhorthos, jjosh, KillerDucky, matoototo, mooskagh, Occyroexanthub, Tilps, and WCP.

The piece images were taken from the TCEC website. After discussion with Aloril, we're not entirely sure where they originate - if they're yours and you object, get in touch.
