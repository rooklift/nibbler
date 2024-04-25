"use strict";

const config_io = require("./config_io");
const engineconfig_io = require("./engineconfig_io");


exports.about_versus_mode = `The "play this colour" option causes Leela to \
evaluate one side of the position only. The top move is automatically played on \
the board upon reaching the node limit (see the Engine menu). This allows you to \
play against Leela.

The "self-play" option causes Leela to play itself.

Higher temperature makes the moves less predictable, but at some cost to move \
correctness. Meanwhile, TempDecayMoves specifies how many moves the temperature \
effect lasts for. These settings have no effect on analysis, only actual move \
generation.`;


exports.save_not_enabled = `Save is disabled until you read the following \
warning.

Nibbler does not append to PGN files, nor does it save collections. It only \
writes the current game to file. When you try to save, you will be prompted with \
a standard "Save As" dialog. If you save to a file that already exists, that \
file will be DESTROYED and REPLACED with a file containing only the current \
game.

You can enable save in the dev menu.`;


exports.engine_not_present = `Engine not found. Please find the engine via the \
Engine menu. You might also need to locate the weights (neural network) file.`;


exports.engine_failed_to_start = `Engine failed to start.`;


exports.uncaught_exception = `There may have been an uncaught exception. If you \
could open the dev tools and the console tab therein, and report the contents to \
the author (ideally with a screenshot) that would be grand.`;


exports.renderer_crash = `The renderer process has crashed. Experience suggests \
this happens when Leela runs out of RAM. If this doesn't apply, please tell the \
author how you made it happen.`;


exports.renderer_hang = `The renderer process may have hung. Please tell the \
author how you made this happen.`;


exports.about_sizes = `You can get more fine-grained control of font, board, \
graph, and window sizes via Nibbler's config file (which can be found via the \
Dev menu).`;


exports.about_hashes = `You can set the Hash value directly via Nibbler's \
${engineconfig_io.filename} file (which can be found via the Dev menu).`;


exports.thread_warning = `Note that, for systems using a GPU, 2 threads is usually \
sufficient for Leela, and increasing this number can actually make Leela weaker! \
More threads should probably only be used on CPU-only systems, if at all.

If no tick is present in this menu, the default is being used, which is probably \
what you want.`;


exports.adding_scripts = `Nibbler has a scripts folder, inside which you can \
place scripts of raw input to send to the engine. A small example file is \
provided. This is for advanced users and devs who understand the UCI protocol.

Note that this is for configuration only.`;


exports.invalid_script = `Bad script; scripts are for configuration only.`;


exports.wrong_engine_exe = `That is almost certainly the wrong file. What we \
need is likely to be called lc0.exe or lc0.`;


exports.send_fail = `Sending to the engine failed. This usually means it has \
crashed.`;


exports.invalid_pieces_directory = `Did not find all pieces required!`;


exports.about_custom_pieces = `To use a custom piece set, select a folder \
containing SVG or PNG files with names such as "Q.png" (or "Q.svg") for white \
and "_Q.png" (or "_Q.svg") for black.`;


exports.desync = `Desync... (restart engine via Engine menu)`;


exports.c960_warning = `We appear to have entered a game of Chess960, however \
this engine does not support Chess960. Who knows what will happen. Probably not \
good things. Maybe bad things.`;


exports.bad_bin_book = `This book contained unsorted keys and is therefore not a \
valid Polyglot book.`;


exports.file_too_big = `Sorry, this file is probably too large to be safely \
loaded in Nibbler. If you want, you can suppress this warning in the Dev menu, \
and try to load the file anyway.`;


exports.pgn_book_too_big = `This file is impractically large for a PGN book - \
consider converting it to Polyglot (.bin) format. If you want, you can suppress \
this warning in the Dev menu, and try to load the file anyway.`;


exports.engine_options_reset = `As of v2.1.1, Nibbler will store engine options \
separately for each engine. To facilite this, your engine options have been \
reset. If you were using special (hand-edited) options, they are still present \
in your ${config_io.filename} file, and can be manually moved to \
${engineconfig_io.filename}.`;


exports.too_soon_to_set_options = `Please wait till the engine has loaded before \
setting options.`;

