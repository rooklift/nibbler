"use strict";

const electron = require("electron");
const fs = require("fs");
const path = require("path");
const querystring = require("querystring");

const debork_json = require("./debork_json");

exports.filename = "config.json";

// To avoid using "remote", we rely on the main process passing userData location in the query...

exports.filepath = electron.app ?
		path.join(electron.app.getPath("userData"), exports.filename) :											// in Main process
		path.join(querystring.parse(global.location.search.slice(1))["user_data_path"], exports.filename);		// in Renderer process

function Config() {}			// This exists solely to make instanceof work.
Config.prototype = {};

exports.defaults = {
	"warning": "EDITING THIS FILE WHILE NIBBLER IS RUNNING WILL GENERALLY CAUSE YOUR EDITS TO BE LOST.",

	"language": "English",

	"path": null,				// Not undefined, all normal keys should have an actual value.

	"args_unused": null,
	"options_unused": null,

	"disable_hw_accel": false,

	"width": 1280,
	"height": 835,
	"board_size": 640,
	"info_font_size": 16,
	"pgn_font_size": 16,
	"fen_font_size": 16,
	"arrow_width": 8,
	"arrowhead_radius": 12,
	"board_font": "18px Arial",

	"graph_height": 96,
	"graph_line_width": 2,
	"graph_minimum_length": 41,					// Desired depth + 1

	"light_square": "#dadada",
	"dark_square": "#b4b4b4",
	"active_square": "#66aaaa",
	"move_squares_with_alpha": "#ffff0026",

	"best_colour": "#66aaaa",
	"good_colour": "#66aa66",
	"bad_colour": "#cccc66",
	"terrible_colour": "#cc6666",
	"actual_move_colour": "#cc9966",

	"searchmoves_buttons": true,
	"focus_on_text": "focused:",
	"focus_off_text": "focus?",

	"accept_bounds": false,
	"max_info_lines": null,						// Hidden option

	"bad_move_threshold": 0.02,
	"terrible_move_threshold": 0.04,
	"ab_filter_threshold": 0.1,

	"arrow_filter_type": "N",
	"arrow_filter_value": 0.01,

	"arrows_enabled": true,
	"click_spotlight": true,
	"next_move_arrow": false,
	"next_move_outline": false,
	"next_move_unique_colour": false,
	"arrowhead_type": 0,

	"ev_pov": null,
	"cp_pov": null,
	"wdl_pov": null,

	"show_cp": false,
	"show_n": true,
	"show_n_abs": true,
	"show_depth": true,
	"show_p": true,
	"show_v": false,
	"show_q": false,
	"show_u": false,
	"show_s": false,
	"show_m": false,
	"show_wdl": true,
	"infobox_stats_newline": false,
	"infobox_pv_move_numbers": false,
	"hover_draw": false,
	"hover_method": 2,

	"looker_api": null,
	"look_past_25": false,

	"pv_click_event": 1,		// 0: nothing, 1: goto, 2: tree

	"pgn_ev": true,
	"pgn_cp": false,
	"pgn_n": true,
	"pgn_n_abs": false,
	"pgn_of_n": true,
	"pgn_depth": false,
	"pgn_p": false,
	"pgn_v": false,
	"pgn_q": false,
	"pgn_u": false,
	"pgn_s": false,
	"pgn_m": false,
	"pgn_wdl": false,

	"pgn_dialog_folder": "",
	"engine_dialog_folder": "",
	"weights_dialog_folder": "",
	"evalfile_dialog_folder": "",
	"syzygy_dialog_folder": "",
	"pieces_dialog_folder": "",
	"background_dialog_folder": "",
	"book_dialog_folder": "",

	"update_delay": 170,
	"animate_delay_multiplier": 4,

	"allow_arbitrary_scripts": false,
	"ignore_filesize_limits": false,
	"allow_stopped_analysis": false,
	"never_suppress_searchmoves": true,
	"never_grayout_infolines": false,
	"suppress_ucinewgame": false,

	"show_engine_state": false,

	"book_depth": 10,

	"save_enabled": false,
	"override_piece_directory": null,
	"override_board": null,

	"leelaish_names": ["Lc0", "Leela", "Ceres"],		// If this gets updated, will need to fix old config files.

	"logfile": null,
	"clear_log": true,
	"logfile_timestamp": false,
	"log_info_lines": false,
	"log_useless_info": false,
	"log_illegal_moves": true,
	"log_positions": true,
};

function fix(cfg) {

	// We want to create a few temporary things (not saved to file)...

	cfg.flip = false;
	cfg.behaviour = "halt";
	cfg.square_size = Math.floor(cfg.board_size / 8);

	// Make sure objectish things at least exist...

	if (Array.isArray(cfg.leelaish_names) === false) {
		cfg.leelaish_names = Array.from(exports.defaults.leelaish_names);
	}

	// Fix the board size...

	cfg.board_size = cfg.square_size * 8;

	// The uncertainty_cutoff key was removed. Filtering by U was also removed...

	if (cfg.uncertainty_cutoff !== undefined || cfg.arrow_filter_type === "U") {
		cfg.arrow_filter_type = "N";
		cfg.arrow_filter_value = exports.defaults.arrow_filter_value;
	}

	// This can't be 0 because we divide by it...

	cfg.animate_delay_multiplier = Math.floor(cfg.animate_delay_multiplier);

	if (cfg.animate_delay_multiplier <= 0) {
		cfg.animate_delay_multiplier = 1;
	}

	// We used to expect font sizes to be strings with "px"...

	for (let key of ["info_font_size", "pgn_font_size", "fen_font_size"]) {
		if (typeof cfg[key] === "string") {
			cfg[key] = parseInt(cfg[key], 10);		// Works even if string ends with "px"
			if (Number.isNaN(cfg[key])) {
				cfg[key] = exports.defaults[key];
			}
		}
	}

	// Convert any strings of "false", "true" and "null"...

	for (let key of Object.keys(cfg)) {
		if (typeof cfg[key] === "string") {
			if (cfg[key].toLowerCase() === "true") {
				cfg[key] = true;
			} else if (cfg[key].toLowerCase() === "false") {
				cfg[key] = false;
			} else if (cfg[key].toLowerCase() === "null") {
				cfg[key] = null;
			}
		}
	}

	// These things need to be strings. They are used as defaultPath parameters
	// but versions of Electron >= 6 (I think) crash when they aren't strings.
	// Sadly we defaulted them to null in 1.2.1 so bad config files may exist.

	if (typeof cfg.pgn_dialog_folder !== "string") {
		cfg.pgn_dialog_folder = "";
	}
	if (typeof cfg.engine_dialog_folder !== "string") {
		cfg.engine_dialog_folder = "";
	}
	if (typeof cfg.weights_dialog_folder !== "string") {
		cfg.weights_dialog_folder = "";
	}

	// These three vars were replaced...

	if (cfg.ev_white_pov) {
		cfg.ev_pov = "w";
	}
	if (cfg.cp_white_pov) {
		cfg.cp_pov = "w";
	}
	if (cfg.wdl_white_pov) {
		cfg.wdl_pov = "w";
	}

	// Too many people are setting this...

	cfg.show_engine_state = exports.defaults.show_engine_state;
}

exports.load = () => {

	let cfg = new Config();

	let err_to_return = null;

	try {
		if (fs.existsSync(exports.filepath)) {
			let raw = fs.readFileSync(exports.filepath, "utf8");
			try {
				Object.assign(cfg, JSON.parse(raw));
			} catch (err) {
				console.log(exports.filename, err.toString(), "...trying to debork...");
				Object.assign(cfg, JSON.parse(debork_json(raw)));
			}
		}
	} catch (err) {
		console.log(err.toString());							// alert() might not be available.
		err_to_return = err.toString();
	}

	// Copy default values for any missing keys into the config...
	// We use a copy so that any objects that are assigned are not the default objects.

	let defaults_copy = JSON.parse(JSON.stringify(exports.defaults));

	for (let key of Object.keys(defaults_copy)) {
		if (cfg.hasOwnProperty(key) === false) {
			cfg[key] = defaults_copy[key];
		}
	}

	fix(cfg);
	return [err_to_return, cfg];
};

exports.save = (cfg) => {

	if (cfg instanceof Config === false) {
		throw "Wrong type of object sent to config_io.save()";
	}

	// Make a copy of the defaults. Doing it this way seems to
	// ensure the final JSON string has the same ordering...

	let out = JSON.parse(JSON.stringify(exports.defaults));

	// Adjust that copy, but only for keys present in both.

	for (let key of Object.keys(cfg)) {
		if (out.hasOwnProperty(key)) {
			out[key] = cfg[key];
		}
	}

	try {
		fs.writeFileSync(exports.filepath, JSON.stringify(out, null, "\t"));
	} catch (err) {
		console.log(err.toString());		// alert() might not be available.
	}
};

exports.create_if_needed = (cfg) => {

	// Note that this must be called fairly late, when userData directory exists.

	if (cfg instanceof Config === false) {
		throw "Wrong type of object sent to config_io.create_if_needed()";
	}

	if (fs.existsSync(exports.filepath)) {
		return;
	}

	exports.save(cfg);
};
