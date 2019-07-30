"use strict";

const alert = require("./alert");
const fs = require("fs");
const get_main_folder = require("./get_main_folder");
const path = require("path");

exports.defaults = {
	"path": null,		// Not undefined, all normal keys should have an actual value.
	"options": {},
	"args": [],

	"width": 1280,
	"height": 835,
	"board_size": 640,
	"info_font_size": 16,
	"pgn_font_size": 16,
	"fen_font_size": 16,
	"status_font_size": 16,
	"arrow_width": 8,
	"arrowhead_radius": 12,
	"board_font": "18px Arial",

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
	"show_n": false,
	"show_n_abs": true,
	"show_p": true,
	"show_v": false,
	"show_q": false,
	"show_d": false,
	"show_u": false,
	"show_q_plus_u": false,
	"searchmoves_buttons": true,
	"infobox_stats_newline": false,
	"hover_draw": false,
	"hover_method": 0,
	"serious_analysis_mode": false,
	"sam_ev": true,
	"sam_n": true,
	"sam_n_abs": false,
	"sam_of_n": true,
	"sam_p": false,
	"sam_v": false,
	"sam_q": false,
	"sam_d": false,
	"sam_u": false,
	"sam_q_plus_u": false,
	"update_delay": 170,
	"animate_delay_multiplier": 4,
	"search_nodes": "infinite",
	"save_enabled": false,
	"override_piece_directory": null,
	"logfile": null,
	"log_info_lines": false
};

function fix(cfg) {

	// We want to create a few things...

	cfg.flip = false;
	cfg.versus = "";
	cfg.square_size = Math.floor(cfg.board_size / 8);

	// Make sure options and args at least exist...

	if (typeof cfg.options !== "object") {
		cfg.options = {};
	}
	if (Array.isArray(cfg.args) === false) {
		cfg.args = [];
	}

	// Fix the board size...

	cfg.board_size = cfg.square_size * 8;

	// Uncertainty can, counterintuitively, be above 1 or below 0. Adjust for the user's likely intention.
	// Note these numbers are tested in main.js for whether the checkbox should be checked...

	if (cfg.uncertainty_cutoff >= 1) cfg.uncertainty_cutoff = 999;
	if (cfg.uncertainty_cutoff <= 0) cfg.uncertainty_cutoff = -999;

	// search_nodes should be in number format, unless "infinite"...

	if (typeof cfg.search_nodes === "string" && cfg.search_nodes !== "infinite") {
		let n = parseInt(cfg.search_nodes, 10);
		if (Number.isNaN(n) === false) {
			cfg.search_nodes = n;
		} else {
			cfg.search_nodes = "infinite";
		}
	}

	// This can't be 0 because we divide by it...

	cfg.animate_delay_multiplier = Math.floor(cfg.animate_delay_multiplier);

	if (cfg.animate_delay_multiplier <= 0) {
		cfg.animate_delay_multiplier = 1;
	}

	// We used to expect font sizes to be strings with "px"...

	for (let key of ["info_font_size", "pgn_font_size", "fen_font_size", "status_font_size"]) {
		if (typeof cfg[key] === "string" && cfg[key].endsWith("px")) {
			cfg[key] = parseInt(cfg[key].slice(0, -2), 10);
			if (Number.isNaN(cfg[key])) {
				cfg[key] = exports.defaults[key];
			}
		}
	}
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

exports.load = () => {

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
			if (process && process.type !== "renderer") {			// Don't bother telling the renderer.
				cfg.failure = `Couldn't find config file. Looked at:\n${config_filename}`;
			}
		}
	} catch (err) {
		cfg.failure = `Failed to parse config file ${config_filename} - make sure it is valid JSON, and in particular, if on Windows, use \\\\ instead of \\ as a path separator.`;
	}

	assign_without_overwrite(cfg, exports.defaults);
	fix(cfg);
	return cfg;
};

exports.save = (filename, cfg) => {

	// Make a copy of the defaults. Doing it this way seems to
	// ensure the final JSON string has the same ordering...

	let out = JSON.parse(JSON.stringify(exports.defaults));

	// Adjust that copy, but only for keys it already has...

	for (let key of Object.keys(cfg)) {
		if (out[key] !== undefined) {
			out[key] = cfg[key];
		}
	}

	try {
		fs.writeFileSync(filename, JSON.stringify(out, null, "\t"));
	} catch (err) {
		alert(err);
	}
};
