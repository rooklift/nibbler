# Nibbler

*Nibbler* is a work in progress, but is intended to be like [Lizzie](https://github.com/featurecat/lizzie), but for [Leela Chess Zero](https://github.com/LeelaChessZero/lc0). Basic functionality does work. You can now load FEN positions via the FEN box, and very basic PGN files via the Open command.

![Screenshot](https://user-images.githubusercontent.com/16438795/58752417-637bb500-84a6-11e9-8cae-5acb51b1a98c.png)

# Usage

*Nibbler* requires Electron, but has no other dependencies. If you have Electron installed (e.g. `npm install -g electron`) you can likely enter the nibbler directory, edit the `config.json` file, then do `electron .`

# TODO

* Support for multi-game PGN.
* Some tree structure of user moves.
* PV display as a board.
* Winrate graph.
