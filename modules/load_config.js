"use strict";

const fs = require("fs");
const get_main_folder = require("./get_main_folder");
const path = require("path");

function apply_defaults(o) {

	assign_without_overwrite(o, {
		"options": {},
		"args": [],

		"width": 1280,
		"height": 835,
		"board_size": 640,
		"board_font": "18px Arial",
		"info_font_size": "16px",
		"pgn_font_size": "16px",
		"fen_font_size": "16px",
		"status_font_size": "16px",
		"light_square": "#dadada",
		"dark_square": "#b4b4b4",
		"active_square": "#66aaaa",
		"move_colour": "#ffff00",
		"move_colour_alpha": 0.15,
		"best_colour": "#66aaaa",
		"good_colour": "#66aa66",
		"bad_colour": "#cccc66",
		"terrible_colour": "#cc6666",
		"bad_move_threshold": 0.02,
		"terrible_move_threshold": 0.04,
		"uncertainty_cutoff": 0.1,
		"arrowhead_type": 0,
		"show_cp": false,
		"cp_white_pov": false,
		"show_n": true,
		"show_p": true,
		"show_u": true,
		"show_q_plus_u": false,
		"serious_analysis_mode": false,
		"update_delay": 170,
		"search_nodes": "infinite",
		"save_enabled": false,
		"override_piece_directory": null,
		"logfile": null,
		"log_info_lines": false
	});

	o.square_size = Math.floor(o.board_size / 8);
	o.board_size = o.square_size * 8;
	
	// These things should not be set naively. Rather, the correct function in the renderer must be called...

	o.flip = false;
	o.versus = "";

	// Uncertainty can, counterintuitively, be above 1 or below 0. Adjust for the user's likely intention.
	// Note these numbers are tested in main.js for whether the checkbox should be checked...

	if (o.uncertainty_cutoff >= 1) o.uncertainty_cutoff = 999;
	if (o.uncertainty_cutoff <= 0) o.uncertainty_cutoff = -999;

	// search_nodes should be in number format, unless "infinite"...

	if (typeof o.search_nodes === "string" && o.search_nodes !== "infinite") {
		let n = parseInt(o.search_nodes, 10);
		if (Number.isNaN(n) === false) {
			o.search_nodes = n;
		} else {
			o.search_nodes = "infinite";
		}
	}

	return o;
}

function assign_without_overwrite(target, source) {
	let keys = Object.keys(source)
	for (let key of keys) {
		if (target.hasOwnProperty(key) === false) {
			target[key] = source[key];
		}
	}
}

function replace_all(s, search, replace) {
    return s.split(search).join(replace);
}

function debork_json(s) {

	// Enough people are going to use single backslashes in their paths that we should just fix it.

	let lines = s.split("\n");
	lines = lines.map(s => s.trim());		// removing \r for no particular reason.

	for (let n = 0; n < lines.length; n++) {
		let line = lines[n];
		if (line.includes(`"path"`) || line.includes(`"WeightsFile"`) || line.includes(`"override_piece_directory"`)) {
			line = replace_all(line, "\\\\", "__nibbler__blackslash__replacement__in__progress__");
			line = replace_all(line, "\\", "\\\\");
			line = replace_all(line, "__nibbler__blackslash__replacement__in__progress__", "\\\\");
		}
		lines[n] = line;
	}

	return lines.join("\n");
}

module.exports = () => {

	// On failure, writes a failure string as cfg.failure. A bit lame, but we can't rely on alert working here.
	// On loading the alternate (example) config file, sets cfg.warn_filename to true.

	let cfg = {};

	let config_filename;
	let config_example_filename;

	try {
		config_filename = path.join(get_main_folder(), "config.json");
		config_example_filename = path.join(get_main_folder(), "config.example.json");

		if (fs.existsSync(config_filename)) {
			cfg = JSON.parse(debork_json(fs.readFileSync(config_filename, "utf8")));
		} else if (fs.existsSync(config_example_filename)) {
			cfg = JSON.parse(debork_json(fs.readFileSync(config_example_filename, "utf8")));
			cfg.warn_filename = true;
		} else {
			cfg.failure = `Couldn't find config file. Looked at:\n${config_filename}`;
		}
	} catch (err) {
		cfg.failure = `Failed to parse config file ${config_filename} - make sure it is valid JSON, and in particular, if on Windows, use \\\\ instead of \\ as a path separator.`;
	}

	apply_defaults(cfg);

	return cfg;
}
