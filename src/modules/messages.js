"use strict";

const config_io = require("./config_io");
const custom_uci = require("./custom_uci");


exports.about_move_display =
`Leela sends a statistic U showing how uncertain it is about its evaluation \
of each move. Nibbler can decide which moves to show on the board using this \
statistic. Often the U statistic remains high for most moves, when Leela \
thinks the right move is "obvious".`;


exports.about_versus_mode =
`The "play this colour" option causes Leela to evaluate one side of the \
position only. The top move is automatically played on the board upon \
reaching the node limit (see the Engine menu). This allows you to play \
against Leela.

The "self-play" option causes Leela to play itself.

Higher temperature makes the moves less predictable, but at some cost to \
move correctness. Meanwhile, TempDecayMoves specifies how many moves the \
temperature effect lasts for. These settings have no effect on analysis, \
only actual move generation.`;


exports.save_not_enabled =
`Save is disabled until you read the following warning.

Nibbler does not append to PGN files, nor does it save collections. It \
only writes the current game to file. When you try to save, you will be \
prompted with a standard "Save As" dialog. If you save to a file that \
already exists, that file will be DESTROYED and REPLACED with a file \
containing only the current game.

You can enable save in the dev menu.`;


exports.engine_not_present =
`Engine not found. Please find the engine via the Engine menu. You might also \
need to locate the weights (neural network) file.`;


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
`You can get more fine-grained control of font, board, graph, and window sizes via \
Nibbler's config file (which can be found via the Dev menu).`;


exports.about_hashes =
`You can set the Hash value directly via Nibbler's config file (which can be found via \
the Dev menu).`;


exports.thread_warning =
`Note that, for systems using a GPU, 2 threads is usually sufficient, and increasing \
this number can actually make Leela weaker! More threads should probably only be used \
on CPU-only systems, if at all.

If no tick is present in this menu, the default is being used, which is probably what \
you want.`;


exports.min_version = 23;
exports.obsolete_leela =
`Nibbler says: this version of Lc0 may be too old for this version of Nibbler. Please \
install Lc0 v0.${exports.min_version} or higher.`;


exports.settings_for_blas =
`Nibbler says: setting [MaxPrefetch = 0, MinibatchSize = 8] for BLAS. If you don't want \
this, explicitly set either value in ${config_io.filename} (options section).`;


exports.adding_scripts =
`Nibbler has a scripts folder, inside which you can place scripts of raw input to send to \
the engine. A small example file is provided. This is for advanced users and devs who \
understand the UCI protocol.

Note that this is for configuration only.`;


exports.invalid_script =
`Bad script; scripts are for configuration only.`;


exports.wrong_engine_exe =
`That is almost certainly the wrong file. What we need is likely to be called lc0.exe or lc0.`;


exports.send_fail =
`Sending to the engine failed. This usually means it has crashed.`;


exports.two_go =
`Warning: "go" command sent twice in a row. This is supposed to be impossible. If you see this, \
Nibbler has a bug and the author would like to be informed.`;


exports.bad_bestmove =
`Warning: bad "bestmove" received. This is supposed to be impossible; if you see this, Nibbler's \
author would like to be informed.`;


exports.inferred_info =
`Info inferred from a previous position`;


exports.invalid_pieces_directory =
`Did not find all pieces required!`;


exports.about_custom_pieces =
`To use a custom piece set, select a folder containing SVG or PNG files with names such as "Q.png" \
(or "Q.svg") for white and "_Q.png" (or "_Q.svg") for black.`;


exports.desync =
`Desync... (restart engine via Engine menu)`;


exports.960_warning =
`We appear to have entered a game of Chess960, however this engine probably does not support Chess960. \
Who knows what will happen.`;

