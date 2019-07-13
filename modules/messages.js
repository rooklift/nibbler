"use strict";


exports.about_move_display = `
Leela sends a statistic U showing how uncertain it is about its evaluation \
of each move. Nibbler decides which moves to show on the board using this \
statistic. Often the U statistic remains high for most moves, when Leela \
thinks the right move is "obvious".`;

exports.about_versus_mode = `
These options cause Leela to evaluate one side of the position only. \
You must still manually decide which of Leela's suggestions to play. \
You can return things to normal with the Go or Halt commands in the \
Analysis menu.`;

exports.save_not_enabled = `
Save is disabled until you read the following warning.

Nibbler does not append to PGN files, nor does it save collections. It \
only writes the current game to file. When you try to save, you will be \
prompted with a standard "Save As" dialog. If you save to a file that \
already exists, that file will be DESTROYED and REPLACED with a file \
containing only the current game.

This behaviour may change in future versions.

To enable save, set "save_enabled" to true in the config file.`;

exports.about_serious_analysis = `
Serious Analysis Mode has two effects.

1: clicking on a move in the infobox on the right will add the \
relevant moves to the tree, but will not actually take you there; i.e. \
we will continue analysing the current position.

2: clicking on a move in the infobox will cause some statistics \
about the first move in the line to be displayed in the tree.

These features were added due to specific requests, but most users can \
safely ignore them.`;
