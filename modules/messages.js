"use strict";

const alert = require("./alert");


exports.about_move_display = `
Leela sends a statistic U showing how uncertain it is about its evaluation
of each move. Nibbler decides which moves to show on the board using this
statistic. Often the U statistic remains high for most moves, when Leela
thinks the right move is "obvious".`;

exports.about_versus_mode = `
Versus Mode causes Leela to evaluate one side of the position only. \
You must still manually decide which of Leela's suggestions to play. \
You can exit Versus Mode with the Go or Halt commands in the Analysis \
menu.`;

exports.save_not_enabled = `
Save is disabled until you read the following warning.

Nibbler does not append to PGN files, nor does it save collections. It \
only writes the current game to file. When you try to save, you will be \
prompted with a standard "Save As" dialog. If you save to a file that \
already exists, that file will be DESTROYED and REPLACED with a file \
containing only the current game.

This behaviour may change in future versions.

To enable save, set "save_enabled" to true in the config file.`;
