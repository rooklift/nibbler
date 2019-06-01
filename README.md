# Nibbler

*Nibbler* is a work in progress, but is intended to be like [Lizzie](https://github.com/featurecat/lizzie), but for [Leela Chess Zero](https://github.com/LeelaChessZero/lc0).

![Screenshot](https://user-images.githubusercontent.com/16438795/58711394-613a2d80-83b6-11e9-9fcd-7d2f2a45159c.png)

Currently, basic functionality does work. You can now load FEN positions via the FEN box. Very basic PGN files can be loaded, but not conveniently stepped through yet.

# Usage

*Nibbler* requires Electron, but has no other dependencies. If you have Electron installed (e.g. `npm install -g electron`) you can likely enter the nibbler directory, edit the `config.json` file, then do `electron .`

# TODO

* Store the main line when loading PGN so we can go forwards as well as backwards.
* PV display as a board.
* Winrate graph.
