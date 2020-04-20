"use strict";

function NewInfoHandler() {

	let ih = Object.create(null);

	ih.table = Object.create(null);			// Map of move (e.g. "e2e4") --> info object.
	ih.board = null;
	ih.version = 0;							// Incremented on any change.
	ih.nodes = 0;							// Stat sent by engine.
	ih.nps = 0;								// Stat sent by engine.
	ih.time = 0;							// Stat sent by engine.

	ih.ever_received_info = false;
	ih.ever_received_q = false;
	ih.ever_received_multipv_2 = false;
	ih.stderr_log = "";

	ih.one_click_moves = New2DArray(8, 8);	// Array of possible one-click moves. Updated by draw_arrows().
	ih.info_clickers = [];					// Elements in the infobox. Updated by draw_infobox().

	ih.last_drawn_version = null;
	ih.last_drawn_highlight = null;
	ih.last_drawn_highlight_class = null;
	ih.last_drawn_searchmoves = [];

	ih.reset_engine_info = function() {
		this.ever_received_info = false;
		this.ever_received_q = false;
		this.ever_received_multipv_2 = false;
		this.stderr_log = "";
	};

	ih.clear = function(board) {
		if (!board) {
			throw "ih.clear(): need board";
		}
		this.table = Object.create(null);
		this.board = board;
		this.version++;
		this.nodes = 0;
		this.nps = 0;
		this.time = 0;
	};

	ih.err_receive = function(s) {

		if (typeof s !== "string") {
			return;
		}

		if (this.stderr_log.length > 50000) {
			console.log(s);
			return;
		}

		if (s.includes("WARNING") || s.includes("error")) {
			this.stderr_log += `<span class="red">${s}</span><br>`;
		} else {
			this.stderr_log += `${s}<br>`;
		}

		if (this.ever_received_info) {		// Means we won't see the err message on screen.
			console.log(s);
		}
	};

	ih.receive = function(s, board) {

		if (typeof s !== "string" || !board) {
			return;
		}

		// We use the board to check legality (only of the first move in the PV,
		// later moves are checked if we ever try to use them) and also to check
		// we are in sync with the renderer.

		if (this.board !== board) {
			throw "ih.receive(): Received unexpected board.";
		}

		if (s.startsWith("info") && s.includes(" pv ") && !s.includes("lowerbound") && !s.includes("upperbound")) {

			// info depth 8 seldepth 31 time 3029 nodes 23672 score cp 27 wdl 384 326 290 nps 7843 tbhits 0 multipv 1
			// pv d2d4 g8f6 c2c4 e7e6 g1f3 d7d5 b1c3 f8b4 c1g5 d5c4 e2e4 c7c5 f1c4 h7h6 g5f6 d8f6 e1h1 c5d4 e4e5 f6d8 c3e4

			this.ever_received_info = true;
			this.version++;

			let move_info;
			let move = InfoVal(s, "pv");
			move = board.c960_castling_converter(move);

			if (this.table[move]) {						// We already have move info for this move.
				move_info = this.table[move];
			} else {									// We don't.
				if (board.illegal(move) !== "") {
					Log(`... Nibbler: invalid move received!: ${move}`);
					return;
				}
				move_info = new_info(board, move);
				this.table[move] = move_info;
			}

			move_info.version = this.version;
			move_info.wdl = InfoWDL(s);

			let tmp;

			tmp = parseInt(InfoVal(s, "cp"), 10);		// Score in centipawns
			if (Number.isNaN(tmp) === false) {
				move_info.cp = tmp;
				if (this.ever_received_q === false) {
					move_info.q = QfromPawns(tmp / 100);
				}
				move_info.mate = 0;						// Engines will send one of cp or mate, so mate gets reset when receiving cp
			}

			tmp = parseInt(InfoVal(s, "mate"), 10);
			if (Number.isNaN(tmp) === false) {
				move_info.mate = tmp;
				if (tmp !== 0) {
					move_info.q = tmp > 0 ? 1 : -1;
					move_info.cp = tmp > 0 ? 12800 : -12800;
				}
			}

			tmp = parseInt(InfoVal(s, "multipv"), 10);	// Leela's ranking of the move, starting at 1
			if (Number.isNaN(tmp) === false) {
				move_info.multipv = tmp;
				if (tmp > 1) {
					this.ever_received_multipv_2 = true;
				}
			}

			tmp = parseInt(InfoVal(s, "nodes"), 10);
			if (Number.isNaN(tmp) === false) {
				this.nodes = tmp;
			}

			tmp = parseInt(InfoVal(s, "nps"), 10);
			if (Number.isNaN(tmp) === false) {
				this.nps = tmp;
			}

			tmp = parseInt(InfoVal(s, "time"), 10);
			if (Number.isNaN(tmp) === false) {
				this.time = tmp;
			}

			let new_pv = InfoPV(s);

			// Note: if the engine isn't respecting Chess960 castling format, the PV
			// may contain old-fashioned castling moves. This is (at time of writing)
			// the only place in the code where we might store such bad-format moves,
			// as everywhere else they are instantly converted.
			//
			// Converting these at reception would be a hassle, and also would cause
			// future CompareArrays() calls (see below) to fail.
			//
			// While we could work around the presence of such bad-format moves,
			// there are many complex ramifications.

			if (new_pv.length === 0) {
				new_pv = [move];
			} else {
				new_pv[0] = move;		// Partial mitigation for the above.
			}

			if (CompareArrays(new_pv, move_info.pv) === false) {
				move_info.nice_pv_cache = null;
				move_info.pv = new_pv;
			}

		} else if (s.startsWith("info string")) {

			// info string d2d4  (293 ) N:   12005 (+169) (P: 22.38%) (WL:  0.09480) (D:  0.326)
			// (M:  7.4) (Q:  0.09480) (U: 0.01211) (Q+U:  0.10691) (V:  0.0898)

			this.ever_received_info = true;
			this.version++;

			let move_info;
			let move = InfoVal(s, "string");
			move = board.c960_castling_converter(move);

			if (this.table[move]) {						// We already have move info for this move.
				move_info = this.table[move];
			} else {									// We don't.
				if (board.illegal(move) !== "") {
					Log(`... Nibbler: invalid move received!: ${move}`);
					return;
				}
				move_info = new_info(board, move);
				this.table[move] = move_info;
			}

			move_info.version = this.version;

			let tmp;

			tmp = parseInt(InfoVal(s, "N:"), 10);
			if (Number.isNaN(tmp) === false) {
				move_info.n = tmp;
			}

			tmp = parseFloat(InfoVal(s, "(D:"));
			if (Number.isNaN(tmp) === false) {
				move_info.d = tmp;
			}

			tmp = parseFloat(InfoVal(s, "(U:"));
			if (Number.isNaN(tmp) === false) {
				move_info.u = tmp;
			}

			tmp = parseFloat(InfoVal(s, "(Q+U:"));
			if (Number.isNaN(tmp) === false) {
				move_info.q_plus_u = tmp;
			}

			tmp = parseFloat(InfoVal(s, "(P:"));		// parseFloat will ignore the trailing %
			if (Number.isNaN(tmp) === false) {
				move_info.p = tmp;
			}

			tmp = parseFloat(InfoVal(s, "(Q:"));
			if (Number.isNaN(tmp) === false) {
				this.ever_received_q = true;
				move_info.q = tmp;
			}

			tmp = parseFloat(InfoVal(s, "(V:"));
			if (Number.isNaN(tmp) === false) {
				move_info.v = tmp;
			}

			tmp = parseFloat(InfoVal(s, "(M:"));
			if (Number.isNaN(tmp) === false) {
				move_info.m = tmp;
			}

		}
	};

	ih.sorted = function() {

		// There are a lot of subtleties around sorting the moves...
		//
		// - We want to allow other engines than Lc0.
		// - We want to work with low MultiPV values.
		// - Old and stale data can be left in our cache if MultiPV is low. Moves with only old
		//   data are often inferior to moves with new data, regardless of stats.
		// - We can try and track the age of the data by various means, but these are fallible.

		let info_list = [];

		for (let o of Object.values(this.table)) {
			info_list.push(o);
		}

		info_list.sort((a, b) => {

			// Mate - positive good, negative bad.
			// Note our info struct uses 0 when not given.

			if (Sign(a.mate) !== Sign(b.mate)) {		// negative is worst, 0 is neutral, positive is best
				if (a.mate < b.mate) return 1;
				if (a.mate > b.mate) return -1;
			} else {									// lower (i.e. towards -Inf) is better regardless of who's mating
				if (a.mate < b.mate) return -1;
				if (a.mate > b.mate) return 1;
			} 

			// Leela N score (node count) - higher is better...

			if (a.n < b.n) return 1;
			if (a.n > b.n) return -1;

			// If we're running Leela we should have an N score, so getting here probably
			// indicates it's some other engine. If it isn't respecting MultiPV, that means
			// its most recently sent message should be its best move...

			if (this.ever_received_multipv_2 === false) {
				if (a.version < b.version) {
					return 1;
				}
				if (a.version > b.version) {
					return -1;
				}
			}

			// Finally, sort by CP if needed...

			if (a.cp < b.cp) return 1;
			if (a.cp > b.cp) return -1;

			// Who knows...

			return 0;
		});

		return info_list;
	};

	ih.must_draw_infobox = function() {
		this.last_drawn_version = null;
	};

	ih.draw_statusbox = function(leela_maybe_running, nogo_reason, searchmoves, syncs_needed) {

		if (special_message && new Date() - special_message_time < 3000) {

			statusbox.innerHTML = `<span class="${special_message_class || "yellow"}">${special_message}</span>`;

		} else if (typeof syncs_needed === "number" && syncs_needed > 1) {

			statusbox.innerHTML = `<span class="gray">Out of sync: ${syncs_needed}</span>`;

		} else if (typeof config.search_nodes === "number" && (searchmoves.length === 1)) {

			statusbox.innerHTML = `<span class="yellow">Node limit with only 1 focus won't run.</span>`;

		} else if (nogo_reason) {

			statusbox.innerHTML = `<span class="yellow">${nogo_reason}</span>`;

		} else {

			let status_string = "";

			if (leela_maybe_running === false) {
				status_string += `<span class="yellow">${config.versus === "" ? "HALTED " : "YOUR MOVE "}</span>`;
			}

			status_string += `<span class="gray">Nodes: ${NString(this.nodes)}, N/s: ${NString(this.nps)}, Time: ${DurationString(this.time)}</span>`;

			if (typeof config.search_nodes === "number" && this.nodes >= config.search_nodes) {
				status_string += ` <span class="blue">(limit met)</span>`;
			}

			statusbox.innerHTML = status_string;
		}
	};

	ih.draw_infobox = function(mouse_point, active_square, leela_maybe_running, nogo_reason, active_colour, searchmoves, hoverdraw_div, syncs_needed) {

		ih.draw_statusbox(leela_maybe_running, nogo_reason, searchmoves, syncs_needed);

		// Display stderr and return if we've never seen any info...

		if (!this.ever_received_info) {
			infobox.innerHTML = this.stderr_log;
			return;
		}

		let info_list = this.sorted();

		if (typeof config.max_info_lines === "number" && config.max_info_lines > 0) {		// Hidden option, request of rwbc
			info_list = info_list.slice(0, config.max_info_lines);
		}

		// We might be highlighting some div...

		let highlight_move = null;
		let highlight_class = null;

		if (mouse_point && mouse_point !== Point(null) && this.one_click_moves[mouse_point.x][mouse_point.y] && !active_square) {
			highlight_move = this.one_click_moves[mouse_point.x][mouse_point.y];
			highlight_class = "ocm_highlight";
		}

		if (typeof hoverdraw_div === "number" && hoverdraw_div >= 0 && hoverdraw_div < info_list.length) {
			highlight_move = info_list[hoverdraw_div].move;
			highlight_class = "hover_highlight";
		}

		// We can skip the draw if:
		//
		// - The last drawn version matches
		// - The last drawn highlight matches
		// - The last drawn highlight class matches
		// - The searchmoves match (some possibility of false negatives due to re-ordering, but that's OK)

		if (this.version === this.last_drawn_version) {
			if (highlight_move === this.last_drawn_highlight_move) {
				if (highlight_class === this.last_drawn_highlight_class) {
					if (CompareArrays(searchmoves, this.last_drawn_searchmoves)) {
						return;
					}
				}
			}
		}

		this.last_drawn_version = this.version;
		this.last_drawn_highlight_move = highlight_move;
		this.last_drawn_highlight_class = highlight_class;
		this.last_drawn_searchmoves = Array.from(searchmoves);

		this.info_clickers = [];

		let substrings = [];
		let clicker_index = 0;
		let div_index = 0;

		for (let info of info_list) {

			// The div containing the PV etc...

			let divclass = "infoline";
			
			if (info.move === highlight_move) {
				divclass += " " + highlight_class;
			}

			substrings.push(`<div id="infoline_${div_index++}" class="${divclass}">`);

			// The "focus" button...

			if (config.searchmoves_buttons) {
				if (searchmoves.includes(info.move)) {
					substrings.push(`<span id="searchmove_${info.move}" class="yellow">${config.focus_on_text} </span>`);
				} else {
					substrings.push(`<span id="searchmove_${info.move}" class="gray">${config.focus_off_text} </span>`);
				}
			}

			// The value...

			let value_string = "?";
			if (config.show_cp) {
				let cp = info.cp;
				if (config.cp_white_pov && active_colour === "b") {
					cp = 0 - cp;
				}
				value_string = (cp / 100).toFixed(2);
				if (cp > 0) {
					value_string = "+" + value_string;
				}
			} else {
				value_string = info.value_string(1) + "%";
			}

			substrings.push(`<span class="blue">${value_string} </span>`);

			// The PV...

			let colour = active_colour;
			let nice_pv = info.nice_pv();

			for (let i = 0; i < nice_pv.length; i++) {
				let spanclass = colour === "w" ? "white" : "pink";
				if (nice_pv[i].includes("O-O")) {
					spanclass += " nobr";
				}
				substrings.push(`<span id="infobox_${clicker_index++}" class="${spanclass}">${nice_pv[i]} </span>`);
				this.info_clickers.push({
					move: info.pv[i],
					is_start: i === 0,
					is_end: i === nice_pv.length - 1,
				});
				colour = OppositeColour(colour);
			}

			// The extra stats...

			let extra_stat_strings = info.stats_list(
				{
					n: config.show_n,
					n_abs: config.show_n_abs,
					wdl: config.show_wdl,
					p: config.show_p,
					m: config.show_m,
					v: config.show_v,
					q: config.show_q,
					d: config.show_d,
					u: config.show_u,
					q_plus_u: config.show_q_plus_u,
				},
				this.nodes);

			if (extra_stat_strings.length > 0) {
				if (config.infobox_stats_newline) {		// Hidden option, request of jhorthos
					substrings.push("<br>");
				}
				substrings.push(`<span class="gray">(${extra_stat_strings.join(', ')})</span>`);
			}

			// Close the whole div...

			substrings.push("</div>");
			
		}

		infobox.innerHTML = substrings.join("");
	};

	ih.moves_from_click = function(event) {
		let n = EventPathN(event, "infobox_");
		return this.moves_from_click_n(n);
	};

	ih.moves_from_click_n = function(n) {

		if (typeof n !== "number" || Number.isNaN(n)) {
			return [];
		}

		if (!this.info_clickers || n < 0 || n >= this.info_clickers.length) {
			return [];
		}

		let move_list = [];

		// Work backwards until we get to the start of the line...

		for (; n >= 0; n--) {
			let object = this.info_clickers[n];
			move_list.push(object.move);
			if (object.is_start) {
				break;
			}
		}

		move_list.reverse();

		return move_list;
	};

	ih.entire_pv_from_click_n = function(n) {

		let move_list = this.moves_from_click_n(n);		// Does all the sanity checks.

		if (move_list.length === 0) {
			return move_list;
		}

		if (this.info_clickers[n].is_end) {				// Do we already have the whole thing?
			return move_list;
		}

		n++;

		for (; n < this.info_clickers.length; n++) {
			let object = this.info_clickers[n];
			move_list.push(object.move);
			if (object.is_end) {
				break;
			}
		}

		return move_list;
	};

	ih.searchmove_from_click = function(event) {
		let s = EventPathString(event, "searchmove_");
		if (typeof s === "string" && (s.length === 4 || s.length === 5)) {
			return s;
		}
		return null;
	};

	ih.draw_arrows = function(specific_source = null) {

		// This function also sets up the one_click_moves array.

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				this.one_click_moves[x][y] = null;
			}
		}

		if (!config.arrows_enabled) {
			return;
		}

		if (specific_source === Point(null)) {
			specific_source = null;
		}

		context.lineWidth = config.arrow_width;
		context.textAlign = "center";
		context.textBaseline = "middle";
		context.font = config.board_font;

		let arrows = [];
		let heads = [];

		let info_list = this.sorted();

		if (info_list.length > 0) {

			let best_move = info_list[0];		// Note that, since we may filter the list, it might not contain best_move later.

			if (specific_source) {

				let new_info_list = info_list.filter(o => o.move.slice(0, 2) === specific_source.s);

				if (new_info_list.length > 0) {
					info_list = new_info_list;
				} else {
					specific_source = null;
				}
			}
			
			for (let i = 0; i < info_list.length; i++) {

				let good_u = typeof info_list[i].u === "number" && info_list[i].u < config.uncertainty_cutoff;
				let good_n = typeof info_list[i].n === "number" && info_list[i].n > 0;

				if (specific_source || i === 0 || (good_u && good_n)) {

					let [x1, y1] = XY(info_list[i].move.slice(0, 2));
					let [x2, y2] = XY(info_list[i].move.slice(2, 4));

					let loss = 0;

					if (typeof best_move.q === "number" && typeof info_list[i].q === "number") {
						loss = best_move.value() - info_list[i].value();
					}

					let colour;

					if (info_list[i] === best_move) {
						colour = config.best_colour;
					} else if (loss > config.terrible_move_threshold) {
						colour = config.terrible_colour;
					} else if (loss > config.bad_move_threshold) {
						colour = config.bad_colour;
					} else {
						colour = config.good_colour;
					}

					let x_head_adjustment = 0;				// Adjust head of arrow for castling moves...
					let normal_castling_flag = false;

					if (this.board && this.board.colour(Point(x1, y1)) === this.board.colour(Point(x2, y2))) {

						// So the move is a castling move (reminder: as of 1.1.6 castling format is king-onto-rook).

						if (this.board.normalchess) {
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
							if (!specific_source) {
								this.one_click_moves[x2 + x_head_adjustment][y2] = info_list[i].move;
							}
							heads.push({
								colour: colour,
								x2: x2 + x_head_adjustment,
								y2: y2,
								info: info_list[i]
							});
						}
					} else {
						if (!this.one_click_moves[x2][y2]) {
							if (!specific_source) {
								this.one_click_moves[x2][y2] = info_list[i].move;
							}
							heads.push({
								colour: colour,
								x2: x2 + x_head_adjustment,
								y2: y2,
								info: info_list[i]
							});
						}
					}
				}
			}
		}

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

		for (let o of arrows) {
			let cc1 = CanvasCoords(o.x1, o.y1);
			let cc2 = CanvasCoords(o.x2, o.y2);
			context.strokeStyle = o.colour;
			context.fillStyle = o.colour;
			context.beginPath();
			context.moveTo(cc1.cx, cc1.cy);
			context.lineTo(cc2.cx, cc2.cy);
			context.stroke();
		}

		for (let o of heads) {
			let cc2 = CanvasCoords(o.x2, o.y2);
			context.fillStyle = o.colour;
			context.beginPath();
			context.arc(cc2.cx, cc2.cy, config.arrowhead_radius, 0, 2 * Math.PI);
			context.fill();
			context.fillStyle = "black";

			let s = "?";

			switch (config.arrowhead_type) {
			case 0:
				s = o.info.value_string(0);
				break;
			case 1:
				if (this.nodes > 0) {
					s = (100 * o.info.n / this.nodes).toFixed(0);
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
			default:
				s = "!";
				break;
			}

			context.fillText(s, cc2.cx, cc2.cy + 1);
		}
	};

	return ih;
}

// --------------------------------------------------------------------------------------------

const info_prototype = {

	nice_pv: function() {

		// Human readable moves. Since there's no real guarantee that our
		// moves list is legal, we legality check them. Also note that
		// our stored PV might conceivably contain old-fashioned castling
		// moves.

		if (this.nice_pv_cache) {
			return Array.from(this.nice_pv_cache);
		}

		let tmp_board = this.board;

		if (!this.pv || this.pv.length === 0) {		// Should be impossible.
			this.pv = [this.move];
		}

		let ret = [];

		for (let move of this.pv) {
			if (tmp_board.illegal(move) !== "") {
				break;
			}
			ret.push(tmp_board.nice_string(move));
			tmp_board = tmp_board.move(move);
		}

		this.nice_pv_cache = ret;
		return Array.from(this.nice_pv_cache);
	},

	value: function() {								// Rescale Q to 0..1 range.

		if (typeof this.q !== "number") {
			return 0;
		}

		if (this.q < -1) {
			return 0;
		}

		if (this.q > 1) {
			return 1;
		}

		return (this.q + 1) / 2;
	},

	value_string: function(dp) {
		if (typeof this.q !== "number") {
			return "?";
		}
		return (this.value() * 100).toFixed(dp);
	},

	stats_list: function(opts, nodes_total) {

		let ret = [];

		if (opts.ev) {
			ret.push(`EV: ${this.value_string(1)}%`);
		}

		// N is fairly complicated...

		if (typeof this.n === "number" && nodes_total) {		// i.e. nodes_total is not zero or undefined

			let n_string = "";

			if (opts.n) {
				n_string += ` N: ${(100 * this.n / nodes_total).toFixed(2)}%`;
			}

			if (opts.n_abs) {
				if (opts.n) {
					n_string += ` [${NString(this.n)}]`;
				} else {
					n_string += ` N: ${NString(this.n)}`;
				}
			}

			if (opts.of_n) {
				n_string += ` of ${NString(nodes_total)}`;
			}

			if (n_string !== "") {
				ret.push(n_string.trim());
			}

		} else {

			if (opts.n || opts.n_abs || opts.of_n) {
				ret.push("N: ?");
			}
			
		}

		// Everything else...

		if (opts.p) {
			if (typeof this.p === "number" && this.p > 0) {
				ret.push(`P: ${this.p}%`);
			} else {
				ret.push(`P: ?`);
			}
		}

		if (opts.v) {
			if (typeof this.v === "number") {
				ret.push(`V: ${this.v.toFixed(3)}`);
			} else {
				ret.push(`V: ?`);
			}
		}

		if (opts.q) {
			if (typeof this.q === "number") {
				ret.push(`Q: ${this.q.toFixed(3)}`);
			} else {
				ret.push(`Q: ?`);
			}
		}

		if (opts.u) {
			if (typeof this.u === "number" && this.n > 0) {						// Checking n is correct.
				ret.push(`U: ${this.u.toFixed(3)}`);
			} else {
				ret.push(`U: ?`);
			}
		}

		if (opts.q_plus_u) {
			if (typeof this.q_plus_u === "number" && this.n > 0) {				// Checking n is correct.
				ret.push(`Q+U: ${this.q_plus_u.toFixed(5)}`);
			} else {
				ret.push(`Q+U: ?`);
			}
		}

		if (opts.m) {
			if (typeof this.m === "number" && this.m > 0) {
				ret.push(`M: ${this.m.toFixed(1)}`);
			} else {
				ret.push(`M: 0`);
			}
		}

		if (opts.d) {
			if (typeof this.d === "number") {
				ret.push(`D: ${this.d.toFixed(3)}`);
			} else {
				ret.push(`D: ?`);
			}
		}

		if (opts.wdl) {
			ret.push(`WDL: ${this.wdl}`);
		}

		return ret;
	}
};

function new_info(board, move) {

	// In some places elsewhere we might assume these things will have sensible values, so
	// better not initialise most things to null. Best to use neutral-ish values, especially
	// since some info (cp and q) can be carried (inverted) into the next step of a line...

	let info = Object.create(info_prototype);
	info.board = board;
	info.cp = 0;
	info.d = 0;
	info.m = 0;
	info.mate = 0;					// 0 can be the "not present" value.
	info.move = move;
	info.multipv = 1;
	info.n = 0;
	info.p = 0;						// Note P is received and stored as a percent, e.g. 31.76 is a reasonable P.
	info.pv = [move];				// Warning: never assume this is a legal sequence.
	info.nice_pv_cache = null;
	info.q = 0;
	info.q_plus_u = 1;
	info.u = 1;
	info.v = null;					// Warning: v is allowed to be null if not known.
	info.version = 0;
	info.wdl = "??";
	return info;
}
