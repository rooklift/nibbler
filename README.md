# Nibbler

*Nibbler* is intended to be somewhat like [Lizzie](https://github.com/featurecat/lizzie), but for [Leela Chess Zero](https://github.com/LeelaChessZero/lc0). In other words, it is a GUI that runs a single engine (in our case, Lc0) constantly, displaying opinions about the current position.

![Screenshot](https://user-images.githubusercontent.com/16438795/60088521-b4de3380-9736-11e9-9007-25013f48e2af.png)

# Features

* Display Leela's top choices graphically.
* Choice of winrate, node %, or policy display.
* PGN loading via menu, clipboard, or drag-and-drop.
* Supports PGN variations of arbitrary depth.
* FEN loading.
* Clickable moves in the variation lists.
* Versus Mode - where Leela only analyses one side.
* Various aesthetic adjustments are possible in the `config.json` file.

Nibbler is a work-in-progress. See or comment on the [todo list](https://github.com/fohristiwhirl/nibbler/issues/10) of hoped-for features.

# Installation

Some Windows and Linux standalone releases are uploaded to the [Releases](https://github.com/fohristiwhirl/nibbler/releases) section from time to time. Just edit `config.json` to point to your copy of Lc0 and your weightsfile (and possibly change your backend, e.g. to `cudnn-fp16`) then run the Nibbler binary.

Running Nibbler from source requires Electron, but has no other dependencies. If you have Electron installed (e.g. `npm install -g electron`) you can likely enter the nibbler directory, then do `electron .`

*The required Lc0 version is v0.21.0 or later*. <!-- because we need `LogLiveStats` which was introduced in that version. -->

# Using an lc0.config file

Some people configure Leela with an `lc0.config` file in their Lc0 directory. If you do this, you should probably delete the `options` object from your Nibbler config file, as it is redundant.

# About other engines

Various people have inquired about the possiblity of using a conventional engine with Nibbler. While such an engine will at least run, there are various problems. Firstly, we rely on custom output which only Lc0 gives. Secondly, it's in the nature of conventional engines that they usually *cannot* give an accurate value for anything except their main line, due to alpha-beta pruning.

One can effectively disable alpha-beta pruning by sending `MultiPV 500` (which we do) but this drastically weakens conventional engines.

# About serious analysis

At the moment, and possibly forever, Nibbler is more of a toy than a serious analysis tool. I really can't promise this will ever change; writing a toy Chess GUI is hard enough...

# Thanks

Thanks for helpful discussions and advice from borg, brinan, Chad, ChiefPushesWood, coolchess123, crem, Faroe22, jhorthos, jjosh, KillerDucky, kiudee, lealgo, liamlim, matoototo, mooskagh, Occyroexanthub, oscardssmith, Ted Summers, Tilps, twoplan, WCP, and anyone I've missed.

The piece images were taken from the TCEC website. After discussion with Aloril, we're not entirely sure where they originate - if they're yours and you object, get in touch.
