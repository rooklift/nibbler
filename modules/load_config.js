"use strict";

const assign_without_overwrite = require("./utils").assign_without_overwrite;
const debork_json = require("./debork_json");
const fs = require("fs");
const path = require("path");

function apply_defaults(o) {

	assign_without_overwrite(o, {
		"options": {},
		"args": [],

		"width": 1280,
		"height": 835,
		"board_size": 640,
		"movelist_height": 110,
		"board_font": "18px Arial",
		"light_square": "#dadada",
		"dark_square": "#b4b4b4",
		"active_square": "#66aaaa",
		"best_colour": "#66aaaa",
		"good_colour": "#66aa66",
		"bad_colour": "#cccc66",
		"terrible_colour": "#cc6666",
		"bad_move_threshold": 0.02,
		"terrible_move_threshold": 0.04,
		"uncertainty_cutoff": 0.1,
		"arrowhead_type": 0,
		"show_n": true,
		"show_p": true,
		"show_u": true,
		"max_info_lines": 10,
		"update_delay": 170,
		"search_nodes": "infinite",
		"save_enabled": false,
		"logfile": null,
		"log_info_lines": false
	});

	o.board_size = Math.floor(o.board_size / 8) * 8;
	o.square_size = o.board_size / 8;

	// These things should not be set naively. Rather, the correct function in the renderer must be called...

	o.flip = false;
	o.versus = "";

	// Uncertainty can, counterintuitively, be above 1 or below 0. Adjust for the user's likely intention...

	if (o.uncertainty_cutoff >= 1) o.uncertainty_cutoff = 999;
	if (o.uncertainty_cutoff <= 0) o.uncertainty_cutoff = -999;

	return o;
}

function get_main_folder() {

	// Return the dir one level above this .js file if we're being run from electron.exe
	if (path.basename(process.argv[0]).toLowerCase() === "electron" ||
		path.basename(process.argv[0]).toLowerCase() === "electron framework" ||
		path.basename(process.argv[0]).toLowerCase() === "electron helper" ||
		path.basename(process.argv[0]).toLowerCase() === "electron.exe") {

		return path.join(__dirname, "..");
	}

	// Return the location of Nibbler.exe
	return path.dirname(process.argv[0]);
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
