"use strict";

function NewInfoHandler() {

	let ih = Object.create(null);

	ih.engine_start_time = performance.now();
	ih.ever_received_info = false;
	ih.ever_received_q = false;
	ih.ever_received_errors = false;
	ih.stderr_log = "";
	ih.next_vms_order_int = 1;

	ih.engine_cycle = 0;		// Count of "go" commands emitted. Since Engine can change, can't store this in Engine objects
	ih.engine_subcycle = 0;		// Count of how many times we have seen "multipv 1" - each time it's a new "block" of info

	ih.ever_drew_infobox = false;

	ih.one_click_moves = New2DArray(8, 8, null);	// Array of possible one-click moves. Updated by draw_arrows().
	ih.info_clickers = [];							// Elements in the infobox. Updated by draw_infobox().

	ih.special_message = null;
	ih.special_message_class = "yellow";
	ih.special_message_timeout = performance.now();

	ih.last_drawn_board = null;
	ih.last_drawn_version = null;
	ih.last_drawn_highlight = null;
	ih.last_drawn_highlight_class = null;
	ih.last_drawn_length = 0;
	ih.last_drawn_searchmoves = [];
	ih.last_drawn_allow_inactive_focus = null;

	ih.draw_arrows = DrawArrows;					// In arrows.js

	ih.reset_engine_info = function() {
		this.engine_start_time = performance.now();
		this.ever_received_info = false;
		this.ever_received_q = false;
		this.ever_received_errors = false;
		this.stderr_log = "";
		this.next_vms_order_int = 1;
	};

	ih.displaying_stderr = function() {

		if (this.ever_received_info) {
			return false;
		}
		if (this.ever_drew_infobox === false) {
			return true;
		}

		// So we've not received info from this engine, but we have drawn the infobox,
		// meaning the engine was recently restarted or replaced...

		if (performance.now() - ih.engine_start_time > 5000 && ih.ever_received_errors === false) {
			return false;
		}
		if (performance.now() - ih.engine_start_time > 20000) {
			return false;
		}

		return true;
	};

	ih.err_receive = function(s) {

		if (typeof s !== "string") {
			return;
		}

		if (this.stderr_log.length > 50000) {
			return;
		}

		let s_low = s.toLowerCase();

		if (s_low.includes("warning") || s_low.includes("error") || s_low.includes("unknown") || s_low.includes("failed") || s_low.includes("exception")) {
			this.ever_received_errors = true;
			this.stderr_log += `<span class="red">${s}</span><br>`;
			if (this.displaying_stderr() === false) {
				this.set_special_message(s, "red", 5000);
			}
		} else {
			this.stderr_log += `${s}<br>`;
			if (this.displaying_stderr() === false) {
				console.log(s);
			}
		}

	};

	ih.receive = function(engine, node, s) {

		if (typeof s !== "string" || !node || node.destroyed) {
			return;
		}

		let board = node.board;

		if (s.startsWith("info") && s.includes(" pv ") && !s.includes("lowerbound") && !s.includes("upperbound")) {

			if (config.log_info_lines) Log("< " + s);

			// info depth 8 seldepth 31 time 3029 nodes 23672 score cp 27 wdl 384 326 290 nps 7843 tbhits 0 multipv 1
			// pv d2d4 g8f6 c2c4 e7e6 g1f3 d7d5 b1c3 f8b4 c1g5 d5c4 e2e4 c7c5 f1c4 h7h6 g5f6 d8f6 e1h1 c5d4 e4e5 f6d8 c3e4

			let infovals = InfoValMany(s, ["pv", "cp", "mate", "multipv", "nodes", "nps", "time", "depth", "seldepth", "tbhits"]);

			let tmp;
			let move_info;
			let move = infovals["pv"];
			move = board.c960_castling_converter(move);

			if (node.table.moveinfo[move] && !node.table.moveinfo[move].__ghost) {		// We already have move info for this move.
				move_info = node.table.moveinfo[move];
			} else {									// We don't.
				if (board.illegal(move) !== "") {
					if (config.log_illegal_moves) {
						Log(`INVALID / ILLEGAL MOVE RECEIVED: ${move}`);
					}
					return;
				}
				move_info = NewInfo(board, move);
				node.table.moveinfo[move] = move_info;
			}

			// ---------------------------------------------------------------------------------------------------------------------

			if (!engine.leelaish) {
				move_info.clear_stats();				// The stats we get this way are all that the engine has, so clear everything.
			}
			move_info.leelaish = engine.leelaish;

			this.ever_received_info = true;				// After the move legality check; i.e. we want REAL info
			node.table.version++;						// Likewise
			move_info.version = node.table.version;
			move_info.cycle = this.engine_cycle;
			move_info.subcycle = this.engine_subcycle;
			move_info.__touched = true;

			// ---------------------------------------------------------------------------------------------------------------------

			let did_set_q_from_mate = false;

			tmp = parseInt(infovals["cp"], 10);
			if (Number.isNaN(tmp) === false) {
				move_info.cp = tmp;
				if (this.ever_received_q === false) {
					move_info.q = QfromPawns(tmp / 100);		// Potentially overwritten later by the better QfromWDL()
				}
				move_info.mate = 0;								// Engines will send one of cp or mate, so mate gets reset when receiving cp
			}

			tmp = parseInt(infovals["mate"], 10);
			if (Number.isNaN(tmp) === false) {
				move_info.mate = tmp;
				if (tmp !== 0) {
					move_info.q = tmp > 0 ? 1 : -1;
					move_info.cp = tmp > 0 ? 12800 : -12800;
					did_set_q_from_mate = true;
				}
			}

			tmp = parseInt(infovals["multipv"], 10);
			if (Number.isNaN(tmp) === false) {
				move_info.multipv = tmp;
				if (tmp === 1) {
					this.engine_subcycle++;
					move_info.subcycle = this.engine_subcycle;	// Correcting the wrong value set earlier
				}
			}

			tmp = parseInt(infovals["nodes"], 10);
			if (Number.isNaN(tmp) === false) {
				move_info.uci_nodes = tmp;
				node.table.nodes = tmp;
			}

			tmp = parseInt(infovals["nps"], 10);
			if (Number.isNaN(tmp) === false) {
				node.table.nps = tmp;					// Note this is stored in the node.table, not the move_info
			}

			tmp = parseInt(infovals["time"], 10);
			if (Number.isNaN(tmp) === false) {
				node.table.time = tmp;					// Note this is stored in the node.table, not the move_info
			}

			tmp = parseInt(infovals["tbhits"], 10);
			if (Number.isNaN(tmp) === false) {
				node.table.tbhits = tmp;				// Note this is stored in the node.table, not the move_info
			}

			tmp = parseInt(infovals["depth"], 10);
			if (Number.isNaN(tmp) === false) {
				move_info.depth = tmp;
			}

			tmp = parseInt(infovals["seldepth"], 10);
			if (Number.isNaN(tmp) === false) {
				move_info.seldepth = tmp;
			}

			move_info.wdl = InfoWDL(s);
			if (this.ever_received_q === false && !did_set_q_from_mate && Array.isArray(move_info.wdl)) {
				move_info.q = QfromWDL(move_info.wdl);
			}

			// If the engine isn't respecting Chess960 castling format, the PV
			// may contain old-fashioned castling moves...

			let new_pv = InfoPV(s);
			C960_PV_Converter(new_pv, board);

			// Note: we used to ignore PV of length 1 on account of Stockfish sending
			// such PVs sometimes, but this does lead to actual PVs of length 1 being
			// ignored, which can lead to stale long PVs in the infobox.

			new_pv[0] = move;		// This was partial mitigation for wrong-format castling. It's now redundant with C960_PV_Converter().

			if (CompareArrays(new_pv, move_info.pv) === false) {
				move_info.nice_pv_cache = null;
				move_info.pv = new_pv;
			}

		} else if (s.startsWith("info string")) {

			if (config.log_info_lines) Log("< " + s);

			// info string d2d4  (293 ) N:   12005 (+169) (P: 22.38%) (WL:  0.09480) (D:  0.326)
			// (M:  7.4) (Q:  0.09480) (U: 0.01211) (Q+U:  0.10691) (V:  0.0898)

			// Ceres has been known to send these in Euro decimal format e.g. Q: 0,094
			// We'll have to replace all commas...

			s = ReplaceAll(s, ",", ".");

			let infovals = InfoValMany(s, ["string", "N:", "(D:", "(U:", "(Q+U:", "(S:", "(P:", "(Q:", "(V:", "(M:"]);

			let tmp;
			let move_info;
			let move = infovals["string"];

			if (move === "node") {						// Mostly ignore these lines, but...
				this.next_vms_order_int = 1;			// ...use them to note that the VerboseMoveStats have completed. A bit sketchy?
				tmp = parseInt(infovals["N:"], 10);
				if (Number.isNaN(tmp) === false) {
					node.table.nodes = tmp;				// ...and use this line to ensure a valid nodes count for the table. (Mostly helps with Ceres.)
				}
				return;
			}

			move = board.c960_castling_converter(move);

			if (node.table.moveinfo[move] && !node.table.moveinfo[move].__ghost) {		// We already have move info for this move.
				move_info = node.table.moveinfo[move];
			} else {																	// We don't.
				if (board.illegal(move) !== "") {
					if (config.log_illegal_moves) {
						Log(`INVALID / ILLEGAL MOVE RECEIVED: ${move}`);
					}
					return;
				}
				move_info = NewInfo(board, move);
				node.table.moveinfo[move] = move_info;
			}

			// ---------------------------------------------------------------------------------------------------------------------

			engine.leelaish = true;						// Note this isn't the main way engine.leelaish gets set (because reasons)
			move_info.leelaish = true;

			this.ever_received_info = true;				// After the move legality check; i.e. we want REAL info
			node.table.version++;						// Likewise
			move_info.version = node.table.version;
			// move_info.cycle = this.engine_cycle;		// No... we get VMS lines even when excluded by searchmoves.
			// move_info.subcycle = this.engine_subcycle;
			move_info.__touched = true;

			// ---------------------------------------------------------------------------------------------------------------------

			move_info.vms_order = this.next_vms_order_int++;

			tmp = parseInt(infovals["N:"], 10);
			if (Number.isNaN(tmp) === false) {
				move_info.n = tmp;
			}

			tmp = parseFloat(infovals["(U:"]);
			if (Number.isNaN(tmp) === false) {
				move_info.u = tmp;
			}

			tmp = parseFloat(infovals["(Q+U:"]);		// Q+U, old name for S
			if (Number.isNaN(tmp) === false) {
				move_info.s = tmp;
			}

			tmp = parseFloat(infovals["(S:"]);
			if (Number.isNaN(tmp) === false) {
				move_info.s = tmp;
			}

			tmp = parseFloat(infovals["(P:"]);			// P, parseFloat will ignore the trailing %
			if (Number.isNaN(tmp) === false) {
				move_info.p = tmp;
			}

			tmp = parseFloat(infovals["(Q:"]);
			if (Number.isNaN(tmp) === false) {
				this.ever_received_q = true;
				move_info.q = tmp;
			}

			tmp = parseFloat(infovals["(V:"]);
			if (Number.isNaN(tmp) === false) {
				move_info.v = tmp;
			}

			tmp = parseFloat(infovals["(M:"]);
			if (Number.isNaN(tmp) === false) {
				move_info.m = tmp;
			}

		} else {

			if (config.log_useless_info) Log("< " + s);

		}
	};

	ih.draw_statusbox = function(node, engine, analysing_other) {

		if (!engine.ever_received_uciok) {

			statusbox.innerHTML = `<span class="yellow">Awaiting uciok from engine</span>`;

		} else if (this.special_message && performance.now() < this.special_message_timeout) {

			statusbox.innerHTML = `<span class="${this.special_message_class}">${this.special_message}</span>`;

		} else if (config.show_engine_state) {

			let cl;
			let status;

			if (engine.search_running.node && engine.search_running === engine.search_desired) {
				cl = "green";
				status = "running";
			} else if (engine.search_running !== engine.search_desired) {
				cl = "yellow";
				status = "desync";
			} else {
				cl = "yellow";
				status = "stopped";
			}

			statusbox.innerHTML =
			`<span class="${cl}">${status}</span>, ` +
			`${config.behaviour}, ` +
			`${engine.last_send}`;

		} else if (engine.unresolved_stop_time && performance.now() - engine.unresolved_stop_time > 500) {

			statusbox.innerHTML = `<span class="yellow">${messages.desync}</span>`;

		} else if (analysing_other) {

			statusbox.innerHTML = `<span id="lock_return_clicker" class="blue">Locked to ${analysing_other} (return?)</span>`;

		} else if (node.terminal_reason() !== "") {

			statusbox.innerHTML = `<span class="yellow">${node.terminal_reason()}</span>`;

		} else if (!node || node.destroyed) {

			statusbox.innerHTML = `<span class="red">draw_statusbox - !node || node.destroyed</span>`;

		} else {

			let status_string = "";
			let can_have_limit_met_msg = false;

			if (config.behaviour === "halt" && !engine.search_running.node) {
				status_string += `<span id="gobutton_clicker" class="yellow">HALTED (go?) </span>`;
				can_have_limit_met_msg = true;
			} else if (config.behaviour === "halt" && engine.search_running.node) {
				status_string += `<span class="yellow">HALTING... </span>`;
				can_have_limit_met_msg = true;
			} else if (config.behaviour === "analysis_locked") {
				status_string += `<span class="blue">Locked! </span>`;
				can_have_limit_met_msg = true;
			} else if (config.behaviour === "play_white" && node.board.active !== "w") {
				status_string += `<span class="yellow">YOUR MOVE </span>`;
			} else if (config.behaviour === "play_black" && node.board.active !== "b") {
				status_string += `<span class="yellow">YOUR MOVE </span>`;
			} else if (config.behaviour === "self_play") {
				status_string += `<span class="green">Self-play! </span>`;
			} else if (config.behaviour === "auto_analysis") {
				status_string += `<span class="green">Auto-eval! </span>`;
			} else if (config.behaviour === "analysis_free") {
				status_string += `<span id="haltbutton_clicker" class="green">ANALYSIS (halt?) </span>`;
				can_have_limit_met_msg = true;
			}

			status_string += `<span class="gray">${NString(node.table.nodes)} nodes, ${DurationString(node.table.time)} (N/s: ${NString(node.table.nps)})`;
			if (config.options.SyzygyPath) {
				status_string += `, ${NString(node.table.tbhits)} tbhits`;
			}
			status_string += `</span>`;

			if (can_have_limit_met_msg && typeof config.search_nodes === "number" && node.table.nodes >= config.search_nodes) {
				status_string += ` <span class="blue">(limit met)</span>`;
			}

			statusbox.innerHTML = status_string;
		}
	};

	ih.draw_infobox = function(node, mouse_point, active_square, active_colour, hoverdraw_div, allow_inactive_focus) {

		let searchmoves = node.searchmoves;

		if (this.displaying_stderr()) {
			infobox.innerHTML = this.stderr_log;
			this.last_drawn_version = null;
			return;
		}

		if (!node || node.destroyed) {
			return;
		}

		let info_list;

		if (node.terminal_reason() !== "") {
			info_list = [];
		} else {
			info_list = SortedMoves(node);
		}

		let best_subcycle = info_list.length > 0 ? info_list[0].subcycle : 0;
		if (best_subcycle === 0) {		// Because all info was autopopulated
			best_subcycle = -1;			// Causes all info to be gray
		}

		if (typeof config.max_info_lines === "number" && config.max_info_lines > 0) {		// Hidden option, request of rwbc
			info_list = info_list.slice(0, config.max_info_lines);
		}

		// We might be highlighting some div...

		let highlight_move = null;
		let highlight_class = null;

		// We'll highlight it if it's a valid OCM *and* clicking there now would make it happen...

		if (mouse_point && this.one_click_moves[mouse_point.x][mouse_point.y]) {
			if (!active_square || this.one_click_moves[mouse_point.x][mouse_point.y].slice(0, 2) === active_square.s) {
				highlight_move = this.one_click_moves[mouse_point.x][mouse_point.y];
				highlight_class = "ocm_highlight";
			}
		}

		if (typeof hoverdraw_div === "number" && hoverdraw_div >= 0 && hoverdraw_div < info_list.length) {
			highlight_move = info_list[hoverdraw_div].move;
			highlight_class = "hover_highlight";
		}

		// We cannot skip the draw if...

		let no_skip_reasons = [];

		if (node.board !== this.last_drawn_board)                               no_skip_reasons.push("board");
		if (node.table.version !== this.last_drawn_version)                     no_skip_reasons.push("table version");
		if (highlight_move !== this.last_drawn_highlight_move)                  no_skip_reasons.push("highlight move");
		if (highlight_class !== this.last_drawn_highlight_class)                no_skip_reasons.push("highlight class");
		if (info_list.length !== this.last_drawn_length)                        no_skip_reasons.push("info list length");
		if (allow_inactive_focus !== this.last_drawn_allow_inactive_focus)      no_skip_reasons.push("allow inactive focus");
		if (CompareArrays(searchmoves, this.last_drawn_searchmoves) === false)  no_skip_reasons.push("searchmoves");

		draw_infobox_no_skip_reasons = no_skip_reasons.join(", ");	// For debugging only.

		if (no_skip_reasons.length === 0) {
			draw_infobox_total_skips++;
			return;
		}

		this.last_drawn_board = node.board;
		this.last_drawn_version = node.table.version;
		this.last_drawn_highlight_move = highlight_move;
		this.last_drawn_highlight_class = highlight_class;
		this.last_drawn_length = info_list.length;
		this.last_drawn_allow_inactive_focus = allow_inactive_focus;
		this.last_drawn_searchmoves = Array.from(searchmoves);

		this.info_clickers = [];

		let substrings = [];
		let clicker_index = 0;
		let div_index = 0;

		for (let info of info_list) {

			// The div containing the PV etc...

			let divclass = "infoline";

			if (info.subcycle !== best_subcycle) {
				divclass += " " + "gray";
			}

			if (info.move === highlight_move) {
				divclass += " " + highlight_class;
			}

			substrings.push(`<div id="infoline_${div_index++}" class="${divclass}">`);

			// The "focus" button...

			if (config.searchmoves_buttons) {
				if (searchmoves.includes(info.move)) {
					substrings.push(`<span id="searchmove_${info.move}" class="yellow">${config.focus_on_text} </span>`);
				} else {
					if (allow_inactive_focus) {
						substrings.push(`<span id="searchmove_${info.move}" class="gray">${config.focus_off_text} </span>`);
					}
				}
			}

			// The value...

			let value_string = "?";
			if (config.show_cp) {
				value_string = info.cp_string(config.cp_white_pov);
			} else {
				value_string = info.value_string(1, config.ev_white_pov);
				if (value_string !== "?") {
					value_string += "%";
				}
			}

			if (info.subcycle === best_subcycle) {
				substrings.push(`<span class="blue">${value_string} </span>`);
			} else {
				substrings.push(`${value_string} `);
			}

			// The PV...

			let colour = active_colour;
			let movenum = node.board.fullmove;			// Only matters for config.infobox_pv_move_numbers
			let nice_pv = info.nice_pv();

			for (let i = 0; i < nice_pv.length; i++) {
				let spanclass = "";
				if (info.subcycle === best_subcycle) {
					spanclass = colour === "w" ? "white" : "pink";
				}
				if (nice_pv[i].includes("O-O")) {
					spanclass += (spanclass.length > 0) ? " nobr" : "nobr";
				}

				let numstring = "";
				if (config.infobox_pv_move_numbers) {
					if (colour === "w") {
						numstring = `${movenum}. `;
					} else if (colour === "b" && i === 0) {
						numstring = `${movenum}... `;
					}
				}

				substrings.push(`<span id="infobox_${clicker_index++}" class="${spanclass}">${numstring}${nice_pv[i]} </span>`);
				this.info_clickers.push({
					move: info.pv[i],
					is_start: i === 0,
					is_end: i === nice_pv.length - 1,
				});
				colour = OppositeColour(colour);
				if (colour === "w") {
					movenum++;
				}
			}

			// The extra stats...

			if (info.__touched) {

				let extra_stat_strings = info.stats_list(
					{
						n:             config.show_n,
						n_abs:         config.show_n_abs,
						depth:         config.show_depth,
						wdl:           config.show_wdl,
						wdl_white_pov: config.wdl_white_pov,
						p:             config.show_p,
						m:             config.show_m,
						v:             config.show_v,
						q:             config.show_q,
						u:             config.show_u,
						s:             config.show_s,
					}, node.table.nodes);

				if (extra_stat_strings.length > 0) {
					if (config.infobox_stats_newline) {
						substrings.push("<br>");
					}
					substrings.push(`<span class="gray">(${extra_stat_strings.join(', ')})</span>`);
				}
			}

			// Close the whole div...

			substrings.push("</div>");

		}

		infobox.innerHTML = substrings.join("");
		this.ever_drew_infobox = true;
	};

	ih.must_draw_infobox = function() {
		this.last_drawn_version = null;
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

	ih.set_special_message = function(s, css_class, duration) {
		if (!css_class) css_class = "yellow";
		if (!duration) duration = 3000;
		this.special_message = s;
		this.special_message_class = css_class;
		this.special_message_timeout = performance.now() + duration;
	};

	return ih;
}


// For debugging...
let draw_infobox_total_skips = 0;
let draw_infobox_no_skip_reasons = "";
