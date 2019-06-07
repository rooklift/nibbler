# Nibbler

*Nibbler* is a work in progress, but is intended to be somewhat like [Lizzie](https://github.com/featurecat/lizzie), but for [Leela Chess Zero](https://github.com/LeelaChessZero/lc0). In other words, it is a GUI that runs a single engine (in our case, Lc0) constantly, displaying opinions about the current position.

It should work - you can now load FEN positions via the FEN box, and most valid PGN files via the Open command.

![Screenshot](https://user-images.githubusercontent.com/16438795/58984287-9a1c3d00-87d0-11e9-9616-9b1e410447e7.png)

# Usage

Running *Nibbler* from source requires Electron, but has no other dependencies. If you have Electron installed (e.g. `npm install -g electron`) you can likely enter the nibbler directory, edit the `config.json` file, then do `electron .`

I may well upload some premade Windows builds to the [Releases](https://github.com/fohristiwhirl/nibbler/releases) section from time to time, if I remember. These won't require anything.

For full functionality, the required Lc0 version is (I believe) v0.21.0 or later, as we use Leela's `LogLiveStats` option, which was introduced in that version. While it is also *possible* to use a different engine (e.g. Stockfish) we do send the `MultiPV 500` command, which seems to drastically reduce traditional engine strength.

# About config options

The `config.json` file can be edited. Most of the options are self-explanatory, except the following:

* `bad_move_threshold` is the winrate loss (compared to best move) required to draw a move in the "bad" colour.
* `terrible_move_threshold` is the same, except moves will be drawn in the "terrible" colour.
* `node_display_threshold` controls how many visits a move must have (compared to best) to be shown at all.
* `update_delay` controls how often Nibbler draws to the screen; lower is faster but more CPU intensive.

# Thanks

Thanks for helpful discussions and advice from borg, brinan, Chad, coolchess123, crem, Faroe22, jhorthos, jjosh, KillerDucky, mooskagh, Occyroexanthub, Tilps, and WCP.

# TODO

* Click on move targets to make the move.
* Some tree structure of user moves.
* PV display as a board.
* Winrate graph.
* Et cetera.
