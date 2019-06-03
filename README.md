# Nibbler

*Nibbler* is a work in progress, but is intended to be somewhat like [Lizzie](https://github.com/featurecat/lizzie), but for [Leela Chess Zero](https://github.com/LeelaChessZero/lc0). It should work - you can now load FEN positions via the FEN box, and most valid PGN files via the Open command.

![Screenshot](https://user-images.githubusercontent.com/16438795/58802783-e9624200-8605-11e9-824c-ca736dde67cc.png)

# Usage

Running *Nibbler* from source requires Electron, but has no other dependencies. If you have Electron installed (e.g. `npm install -g electron`) you can likely enter the nibbler directory, edit the `config.json` file, then do `electron .`

I may well upload some premade Windows builds to the [Releases](https://github.com/fohristiwhirl/nibbler/releases) section from time to time, if I remember. These won't require anything.

For full functionality, the required Lc0 version is (I believe) v0.21.0 or later, as we use Leela's `LogLiveStats` option, which was introduced in that version. While it is also *possible* to use a different engine (e.g. Stockfish) we do send the `MultiPV 500` command, which seems to drastically reduce traditional engine strength.

# TODO

* Some tree structure of user moves.
* PV display as a board.
* Winrate graph.
* Et cetera.
