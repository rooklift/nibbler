"use strict";


exports.about_move_display =
`Leela sends a statistic U showing how uncertain it is about its evaluation \
of each move. Nibbler decides which moves to show on the board using this \
statistic. Often the U statistic remains high for most moves, when Leela \
thinks the right move is "obvious".`;


exports.about_versus_mode =
`These options cause Leela to evaluate one side of the position only. \
You must still manually decide which of Leela's suggestions to play. \
You can return things to normal with the Go or Halt commands in the \
Analysis menu.`;


exports.save_not_enabled =
`Save is disabled until you read the following warning.

Nibbler does not append to PGN files, nor does it save collections. It \
only writes the current game to file. When you try to save, you will be \
prompted with a standard "Save As" dialog. If you save to a file that \
already exists, that file will be DESTROYED and REPLACED with a file \
containing only the current game.

This behaviour may change in future versions.

To enable save, set "save_enabled" to true in the config file.`;


exports.about_serious_analysis =
`Serious Analysis Mode has two effects.

1: clicking on a move in the infobox on the right will add the \
relevant moves to the tree, but will not actually take you there; i.e. \
we will continue analysing the current position.

2: clicking on a move in the infobox will cause some statistics \
about the first move in the line to be displayed in the tree.

These features were added due to specific requests, but most users can \
safely ignore them.`;


exports.engine_not_present =
`Engine not found. Please edit config.json, or find the engine via the \
Engine menu. You might also need to locate the weights (neural network) \
file. Afterwards, you may like to save a valid config.json via the App menu.`;


exports.uncaught_exception =
`There may have been an uncaught exception. If you could open the dev tools \
and the console tab therein, and report the contents to the author (ideally \
with a screenshot) that would be grand.`;


exports.renderer_crash =
`The renderer process has crashed. Experience suggests this happens when \
Leela runs out of RAM. If this doesn't apply, please tell the author how \
you made it happen.`;


exports.renderer_hang =
`The renderer process may have hung. Please tell the author how you made this happen.`;

exports.about_sizes = 
`You can get more fine-grained font and board size control using Nibbler's \
config file. See the example config file for examples.`;
