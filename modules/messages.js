"use strict";

const config_io = require("./config_io");
const custom_uci = require("./custom_uci");


exports.about_move_display =
`Leela sends a statistic U showing how uncertain it is about its evaluation \
of each move. Nibbler decides which moves to show on the board using this \
statistic. Often the U statistic remains high for most moves, when Leela \
thinks the right move is "obvious".`;


exports.about_versus_mode =
`The "Go when [white|black]" options cause Leela to evaluate one side of \
the position only. The top move is automatically played on the board upon \
reaching the node limit (see the Engine menu).

The self-play option causes Leela to play itself.

Higher temperature makes the moves less predictable, but at some cost to \
move correctness.`;


exports.versus_without_node_limit =
`No node limit selected; therefore moves will not be automatically played.`;


exports.save_not_enabled =
`Save is disabled until you read the following warning.

Nibbler does not append to PGN files, nor does it save collections. It \
only writes the current game to file. When you try to save, you will be \
prompted with a standard "Save As" dialog. If you save to a file that \
already exists, that file will be DESTROYED and REPLACED with a file \
containing only the current game.

You can permanently enable save in the dev menu.`;


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
`You can get more fine-grained control of font, board, and window sizes via \
Nibbler's config file (which can be found via the App menu).`;


exports.new_config_location =
`WARNING: Nibbler now looks for ${config_io.filename} in a new location and also \
saves to it automatically. You can delete the file in your app's folder. If you want to \
manually edit ${config_io.filename}, you can find it via the App menu.`;


exports.thread_warning =
`Note that, for systems using a GPU, 2 threads is usually sufficient, and increasing \
this number can actually make Leela weaker! More threads should probably only be used \
on CPU-only systems, if at all.

If no tick is present in this menu, the default is being used, which is probably what \
you want.`;


exports.min_version = 23;
exports.obsolete_leela = 
`Nibbler says: this version of Lc0 may be too old for this version of Nibbler. Please \
install v0.${exports.min_version} or higher.`;


exports.settings_for_blas = 
`Nibbler says: setting [MaxPrefetch = 0, MinibatchSize = 8] for BLAS. If you don't want \
this, explicitly set either value in ${config_io.filename} (options section).`;


exports.adding_uci_options = 
`You can add arbitrary UCI settings to this menu by editing the file ${custom_uci.filename}. \
The format is fairly self-explanatory. Restart Nibbler for this to take effect.

Note that these custom settings are only sent WHEN CLICKED (not automatically). To automatically \
send custom UCI options at startup, edit ${config_io.filename} (options section) instead.`;


exports.wrong_engine_exe = 
`That is almost certainly the wrong file. What we need is likely to be called lc0.exe or lc0.`
