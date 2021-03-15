"use strict";

// DrawArrows is attached as a method to the info_handler... "this" refers to that.

let draw_arrows_last_mode = null;		// For debugging.

const DrawArrows = function(node, specific_source = null, show_move = null) {

	// Function also sets up the one_click_moves array.

	for (let x = 0; x < 8; x++) {
		for (let y = 0; y < 8; y++) {
			this.one_click_moves[x][y] = null;
		}
	}

	if (!config.arrows_enabled || !node || node.destroyed) {
		return;
	}

	let full_list = SortedMoves(node);

	if (full_list.length === 0) {		// Keep this test early so we can assume full_list[0] exists later.
		return;
	}

	let best_info = full_list[0];		// Note that, since we may filter the list, it might not contain best_info later.

	let info_list = [];
	let arrows = [];
	let heads = [];

	let mode = "normal";
	if (full_list[0].leelaish === false) mode = "ab";
	if (full_list[0].__ghost) mode = "ghost";
	if (full_list[0].__touched === false) mode = "untouched";
	if (specific_source) mode = "specific";

	draw_arrows_last_mode = mode;		// For debugging only.

	switch (mode) {

	case "normal":

		info_list = full_list;
		break;

	case "ab":

		for (let info of full_list) {
			if ((info.__touched && info_list.length < config.ab_engine_multipv) || info.move === show_move) {
				info_list.push(info);
			}
		}
		break;

	case "ghost":

		for (let info of full_list) {
			if (info.__ghost || info.move === show_move) {
				info_list.push(info);
			}
		}
		break;

	case "untouched":

		for (let info of full_list) {
			if (info.move === show_move) {
				info_list.push(info);
			}
		}
		break;

	case "specific":

		for (let info of full_list) {
			if (info.move.slice(0, 2) === specific_source.s) {
				info_list.push(info);
			}
		}
		break;

	}

	// ------------------------------------------------------------------------------------------------------------

	if (info_list.length > 0) {

		for (let i = 0; i < info_list.length; i++) {

			let ok = true;

			if (mode !== "ab") {

				if (config.arrow_filter_type === "top") {
					if (i !== 0) {
						ok = false;
					}
				}

				if (config.arrow_filter_type === "N") {
					if (typeof info_list[i].n !== "number" || info_list[i].n === 0) {
						ok = false;
					} else {
						let n_fraction = info_list[i].n / node.table.nodes;
						if (n_fraction < config.arrow_filter_value) {
							ok = false;
						}
					}
				}

				// Moves proven to lose...

				if (typeof info_list[i].u === "number" && info_list[i].u === 0 && info_list[i].value() === 0) {
					if (config.arrow_filter_type !== "all") {
						ok = false;
					}
				}
			}

			// Go ahead, if the various tests don't filter the move out...

			if (ok || i === 0 || specific_source || info_list[i].move === show_move) {

				let [x1, y1] = XY(info_list[i].move.slice(0, 2));
				let [x2, y2] = XY(info_list[i].move.slice(2, 4));

				let loss = 0;

				if (typeof best_info.q === "number" && typeof info_list[i].q === "number") {
					loss = best_info.value() - info_list[i].value();
				}

				let colour;

				if (info_list[i].__touched === false) {		// There are 2 reasons this could be so...
					if (mode === "specific") {				// 1: Showing all moves for source
						colour = config.terrible_colour;	//
					} else {								// 2: Showing "known next move"
						colour = config.next_move_colour;
					}
				} else if (info_list[i] === best_info) {
					colour = config.best_colour;
				} else if (loss < config.bad_move_threshold) {
					colour = config.good_colour;
				} else if (loss < config.terrible_move_threshold) {
					colour = config.bad_colour;
				} else {
					colour = config.terrible_colour;
				}

				let x_head_adjustment = 0;				// Adjust head of arrow for castling moves...
				let normal_castling_flag = false;

				if (node.board && node.board.colour(Point(x1, y1)) === node.board.colour(Point(x2, y2))) {

					// So the move is a castling move (reminder: as of 1.1.6 castling format is king-onto-rook).

					if (node.board.normalchess) {
						normal_castling_flag = true;	// ...and we are playing normal Chess (not 960).
					}

					if (x2 > x1) {
						x_head_adjustment = normal_castling_flag ? -1 : -0.5;
					} else {
						x_head_adjustment = normal_castling_flag ? 2 : 0.5;
					}
				}

				arrows.push({
					colour: colour,
					x1: x1,
					y1: y1,
					x2: x2 + x_head_adjustment,
					y2: y2,
					info: info_list[i]
				});

				// If there is no one_click_move set for the target square, then set it
				// and also set an arrowhead to be drawn later.

				if (normal_castling_flag) {
					if (!this.one_click_moves[x2 + x_head_adjustment][y2]) {
						heads.push({
							colour: colour,
							x2: x2 + x_head_adjustment,
							y2: y2,
							info: info_list[i]
						});
						this.one_click_moves[x2 + x_head_adjustment][y2] = info_list[i].move;
					}
				} else {
					if (!this.one_click_moves[x2][y2]) {
						heads.push({
							colour: colour,
							x2: x2 + x_head_adjustment,
							y2: y2,
							info: info_list[i]
						});
						this.one_click_moves[x2][y2] = info_list[i].move;
					}
				}
			}
		}
	}

	// ------------------------------------------------------------------------------------------------------------

	// It looks best if the longest arrows are drawn underneath. Manhattan distance is good enough.
	// For the sake of displaying the best pawn promotion (of the 4 possible), sort ties are broken
	// by node counts, with lower drawn first.

	arrows.sort((a, b) => {
		if (Math.abs(a.x2 - a.x1) + Math.abs(a.y2 - a.y1) < Math.abs(b.x2 - b.x1) + Math.abs(b.y2 - b.y1)) {
			return 1;
		}
		if (Math.abs(a.x2 - a.x1) + Math.abs(a.y2 - a.y1) > Math.abs(b.x2 - b.x1) + Math.abs(b.y2 - b.y1)) {
			return -1;
		}
		if (a.info.n < b.info.n) {
			return -1;
		}
		if (a.info.n > b.info.n) {
			return 1;
		}
		return 0;
	});

	boardctx.lineWidth = config.arrow_width;
	boardctx.textAlign = "center";
	boardctx.textBaseline = "middle";
	boardctx.font = config.board_font;

	for (let o of arrows) {
		let cc1 = CanvasCoords(o.x1, o.y1);
		let cc2 = CanvasCoords(o.x2, o.y2);
		boardctx.strokeStyle = o.colour;
		boardctx.fillStyle = o.colour;
		boardctx.beginPath();
		boardctx.moveTo(cc1.cx, cc1.cy);
		boardctx.lineTo(cc2.cx, cc2.cy);
		boardctx.stroke();
	}

	for (let o of heads) {
		let cc2 = CanvasCoords(o.x2, o.y2);
		boardctx.fillStyle = o.colour;
		boardctx.beginPath();
		boardctx.arc(cc2.cx, cc2.cy, config.arrowhead_radius, 0, 2 * Math.PI);
		boardctx.fill();
		boardctx.fillStyle = "black";

		let s = "?";

		switch (config.arrowhead_type) {
		case 0:
			s = o.info.value_string(0, config.ev_white_pov);
			if (s === "100" && o.info.q < 1.0) {
				s = "99";								// Don't round up to 100.
			}
			break;
		case 1:
			if (node.table.nodes > 0) {
				s = (100 * o.info.n / node.table.nodes).toFixed(0);
			}
			break;
		case 2:
			if (o.info.p > 0) {
				s = o.info.p.toFixed(0);
			}
			break;
		case 3:
			s = o.info.multipv;
			break;
		case 4:
			if (typeof o.info.m === "number") {
				s = o.info.m.toFixed(0);
			}
			break;
		default:
			s = "!";
			break;
		}

		if (o.info.__touched === false) {
			s = "?";
		}

		boardctx.fillText(s, cc2.cx, cc2.cy + 1);
	}
};
