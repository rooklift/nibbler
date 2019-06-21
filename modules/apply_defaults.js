"use strict";

const assign_without_overwrite = require("./utils").assign_without_overwrite;

module.exports = (o) => {

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
		"node_display_threshold": 0.02,
		"arrowhead_type": 0,
		"show_n": true,
		"show_p": true,
		"show_u": true,
		"max_info_lines": 10,
		"update_delay": 170,
		"search_nodes": "infinite",
		"logfile": null,
		"log_info_lines": false
	});

	o.board_size = Math.floor(o.board_size / 8) * 8;
	o.square_size = o.board_size / 8;

	// These things should not be set naively. Rather, the correct function in the renderer must be called...

	o.flip = false;
	o.versus = "";
}
