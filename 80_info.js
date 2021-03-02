"use strict";

function NewInfoHandler() {

	let ih = Object.create(null);

	ih.engine_start_time = performance.now();
	ih.ever_received_info = false;
	ih.ever_received_q = false;
	ih.ever_received_multipv_2 = false;
	ih.ever_received_errors = false;
	ih.stderr_log = "";

	ih.ever_drew_infobox = false;

	ih.next_vms_order_int = 1;

	ih.one_click_moves = New2DArray(8, 8);	// Array of possible one-click moves. Updated by draw_arrows().
	ih.info_clickers = [];					// Elements in the infobox. Updated by draw_infobox().

	ih.special_message = null;
	ih.special_message_class = null;
	ih.special_message_time = performance.now();

	ih.last_drawn_board = null;
	ih.last_drawn_version = null;
	ih.last_drawn_highlight = null;
	ih.last_drawn_highlight_class = null;
	ih.last_drawn_searchmoves = [];

	ih.reset_engine_info = function() {
		this.engine_start_time = performance.now();
		this.ever_received_info = false;
		this.ever_received_q = false;
		this.ever_received_multipv_2 = false;
		this.ever_received_errors = false;
		this.stderr_log = "";
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
		if (performance.now() - ih.engine_start_time > 15000) {
			return false;
		}

		return true;
	};

	ih.err_receive = function(s) {

		if (typeof s !== "string") {
			return;
		}

		if (this.stderr_log.length > 50000) {
			console.log(s);
			return;
		}

		let s_low = s.toLowerCase();

		if (s_low.includes("warning") || s_low.includes("error") || s_low.includes("unknown") || s_low.includes("failed")) {
			this.stderr_log += `<span class="red">${s}</span><br>`;
			this.ever_received_errors = true;
		} else {
			this.stderr_log += `${s}<br>`;
		}

		if (this.displaying_stderr() === false) {
			console.log(s);
		}
	};

	ih.receive = function(s, node) {

		if (typeof s !== "string" || !node || node.destroyed) {
			return;
		}

		let board = node.board;

		if (s.startsWith("info") && s.includes(" pv ") && !s.includes("lowerbound") && !s.includes("upperbound")) {

			// info depth 8 seldepth 31 time 3029 nodes 23672 score cp 27 wdl 384 326 290 nps 7843 tbhits 0 multipv 1
			// pv d2d4 g8f6 c2c4 e7e6 g1f3 d7d5 b1c3 f8b4 c1g5 d5c4 e2e4 c7c5 f1c4 h7h6 g5f6 d8f6 e1h1 c5d4 e4e5 f6d8 c3e4

			let infovals = InfoValMany(s, ["pv", "cp", "mate", "multipv", "nodes", "nps", "time", "depth", "seldepth", "tbhits"]);

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

			this.ever_received_info = true;				// After the move legality check; i.e. we want REAL info
			node.table.version++;						// Likewise

			move_info.version = node.table.version;

			let tmp;

			tmp = parseInt(infovals["cp"], 10);			// Score in centipawns
			if (Number.isNaN(tmp) === false) {
				move_info.cp = tmp;
				if (this.ever_received_q === false) {
					move_info.q = QfromPawns(tmp / 100);
				}
				move_info.mate = 0;						// Engines will send one of cp or mate, so mate gets reset when receiving cp
			}

			tmp = parseInt(infovals["mate"], 10);
			if (Number.isNaN(tmp) === false) {
				move_info.mate = tmp;
				if (tmp !== 0) {
					move_info.q = tmp > 0 ? 1 : -1;
					move_info.cp = tmp > 0 ? 12800 : -12800;
				}
			}

			tmp = parseInt(infovals["multipv"], 10);	// Leela's ranking of the move, starting at 1
			if (Number.isNaN(tmp) === false) {
				move_info.multipv = tmp;
				if (tmp > 1) {
					this.ever_received_multipv_2 = true;
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

			this.ever_received_info = true;				// After the move legality check; i.e. we want REAL info
			node.table.version++;						// Likewise

			move_info.leelaish = true;
			move_info.version = node.table.version;
			move_info.vms_order = this.next_vms_order_int++;

			tmp = parseInt(infovals["N:"], 10);
			if (Number.isNaN(tmp) === false) {
				if (tmp === 0 && move_info.n > 0) {		// Bailout in this exact situation - this allows engine restart
					return;								// combined with searchmove change to work better; engine will send
				}										// useless 0-node info which we don't let override what we had...
				move_info.n = tmp;
			}

			tmp = parseFloat(infovals["(D:"]);
			if (Number.isNaN(tmp) === false) {
				move_info.d = tmp;
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

		}
	};

	ih.sorted = function(node) {

		// There are a lot of subtleties around sorting the moves...
		//
		// - We want to allow other engines than Lc0.
		// - We want to work with low MultiPV values.
		// - Old and stale data can be left in our cache if MultiPV is low. Moves with only old
		//   data are often inferior to moves with new data, regardless of stats.
		// - We want to work with searchmoves, which is bound to leave stale info in the table.
		// - We can try and track the age of the data by various means, but these are fallible.

		if (!node || node.destroyed) {
			return [];
		}

		let info_list = [];

		for (let o of Object.values(node.table.moveinfo)) {
			info_list.push(o);
		}

		info_list.sort((a, b) => {

			const a_is_best = -1;						// return -1 to sort a to the left
			const b_is_best = 1;						// return 1 to sort a to the right

			// Ordering by VerboseMoveStats (request of Napthalin)...

			if (config.vms_ordering) {
				if (a.vms_order > b.vms_order) return a_is_best;
				if (a.vms_order < b.vms_order) return b_is_best;
			}

			// Mate - positive good, negative bad.
			// Note our info struct uses 0 when not given.

			if (Sign(a.mate) !== Sign(b.mate)) {		// negative is worst, 0 is neutral, positive is best
				if (a.mate > b.mate) return a_is_best;
				if (a.mate < b.mate) return b_is_best;
			} else {									// lower (i.e. towards -Inf) is better regardless of who's mating
				if (a.mate < b.mate) return a_is_best;
				if (a.mate > b.mate) return b_is_best;
			}

			// Leela N score (node count) - higher is better...

			if (a.n > b.n) return a_is_best;
			if (a.n < b.n) return b_is_best;

			// Leela will give an N score, so if we're here, it's some other engine,
			// or we're breaking ties.

			// If MultiPV is the same, go with the more recent data...

			if (a.multipv === b.multipv) {
				if (a.version > b.version && a.uci_nodes > b.uci_nodes) return a_is_best;
				if (a.version < b.version && a.uci_nodes < b.uci_nodes) return b_is_best;
			}

			// I hesitate to use multipv sort sorting because of stale data issues, but...

			if (a.multipv < b.multipv) return a_is_best;
			if (a.multipv > b.multipv) return b_is_best;

			// Finally, sort by CP if needed...

			if (a.cp > b.cp) return a_is_best;
			if (a.cp < b.cp) return b_is_best;

			// Who knows...

			return 0;
		});

		return info_list;
	};

	ih.must_draw_infobox = function() {
		this.last_drawn_version = null;
	};

	ih.draw_statusbox = function(node, engine, analysing_other) {

		if (!engine.ever_received_uciok) {

			statusbox.innerHTML = `<span class="yellow">Awaiting uciok from engine</span>`;

		} else if (this.special_message && performance.now() - this.special_message_time < 3000) {

			statusbox.innerHTML = `<span class="${this.special_message_class || "yellow"}">${this.special_message}</span>`;

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
				status_string += ``;

				// I don't like the color of the button. The code I deleted: <span id="haltbutton_clicker" class="black">ANALYSIS (halt?) </span>

				can_have_limit_met_msg = true;
			}

			status_string += `<span class="white">Nodes: ${NString(node.table.nodes)}, N/s: ${NString(node.table.nps)}, tbhits: ${NString(node.table.tbhits)}, Time: ${DurationString(node.table.time)}</span>`;

			if (can_have_limit_met_msg && typeof config.search_nodes === "number" && node.table.nodes >= config.search_nodes) {
				status_string += ` <span class="blue">(limit met)</span>`;
			}

			statusbox.innerHTML = status_string;
		}
	};

	ih.draw_infobox = function(node, mouse_point, active_square, active_colour, hoverdraw_div) {

		let searchmoves = node.searchmoves;

		if (this.displaying_stderr()) {
			infobox.innerHTML = this.stderr_log;
			return;
		}

		if (!node || node.destroyed) {
			return;
		}

		let info_list = this.sorted(node);

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

		// We can skip the draw if:
		//
		// - The last drawn board matches (implying node matches)
		// - The last drawn version matches
		// - The last drawn highlight matches
		// - The last drawn highlight class matches
		// - The searchmoves match (some possibility of false negatives due to re-ordering, but that's OK)

		if (node.board === this.last_drawn_board &&
			node.table.version === this.last_drawn_version &&
			highlight_move === this.last_drawn_highlight_move &&
			highlight_class === this.last_drawn_highlight_class &&
			CompareArrays(searchmoves, this.last_drawn_searchmoves)
		) {
				return;
		}

		this.last_drawn_board = node.board;
		this.last_drawn_version = node.table.version;
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
				value_string = info.cp_string(config.cp_white_pov);
			} else {
				value_string = info.value_string(1, config.ev_white_pov);
				if (value_string !== "?") {
					value_string += "%";
				}
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
					n:             config.show_n,
					n_abs:         config.show_n_abs,
					wdl:           config.show_wdl,
					wdl_white_pov: config.wdl_white_pov,
					p:             config.show_p,
					m:             config.show_m,
					v:             config.show_v,
					q:             config.show_q,
					d:             config.show_d,
					u:             config.show_u,
					s:             config.show_s,
				}, node.table.nodes);

			if (extra_stat_strings.length > 0) {
				if (config.infobox_stats_newline) {
					substrings.push("<br>");
				}
				substrings.push(`<span class="gray">(${extra_stat_strings.join(', ')})</span>`);
			}

			// Close the whole div...

			substrings.push("</div>");

		}

		if (info_list.length === 1 && info_list[0].__ghost) {
			substrings.push(`<div><span id="ancestor_return_clicker" class="gray">${messages.inferred_info} (return?)</span></div>`);
		}

		infobox.innerHTML = substrings.join("");
		this.ever_drew_infobox = true;
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

	ih.draw_arrows = function(node, specific_source = null, show_move = null) {		// point and movestring

		// This function also sets up the one_click_moves array.

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				this.one_click_moves[x][y] = null;
			}
		}

		if (!config.arrows_enabled || !node || node.destroyed) {
			return;
		}

		boardctx.lineWidth = config.arrow_width;
		boardctx.textAlign = "center";
		boardctx.textBaseline = "middle";
		boardctx.font = config.board_font;

		let arrows = [];
		let heads = [];

		let info_list = this.sorted(node);

		// If there's some specific move we're supposed to show, and it's not actually present in the move table,
		// we'll need to add it...

		if (show_move) {
			let present = false;
			for (let info of info_list) {
				if (info.move === show_move) {
					present = true;
					break;
				}
			}
			if (present === false) {
				let temp_info = NewInfo(node.board, show_move);
				temp_info.__arrow_temp = true;
				info_list.push(temp_info);
			}
		}

		if (info_list.length > 0) {

			let best_info = info_list[0];		// Note that, since we may filter the list, it might not contain best_info later.

			if (specific_source) {

				let new_info_list = info_list.filter(o => o.move.slice(0, 2) === specific_source.s);

				if (new_info_list.length > 0) {
					info_list = new_info_list;
				} else {
					specific_source = null;
				}
			}

			for (let i = 0; i < info_list.length; i++) {

				let good_u = true;
				let good_n = true;

				if (config.arrow_filter_type === "top") {	// Rely on the i === 0 test, below.
					good_u = false;
					good_n = false;
				}

				if (config.arrow_filter_type === "U") {
					if (typeof info_list[i].u !== "number") {
						good_u = false;
					} else if (info_list[i].u >= config.arrow_filter_value) {
						good_u = false;
					}
				}

				if (config.arrow_filter_type === "N") {
					if (typeof info_list[i].n !== "number" || info_list[i].n === 0) {
						good_n = false;
					} else {
						let n_fraction = info_list[i].n / node.table.nodes;
						if (n_fraction < config.arrow_filter_value) {
							good_n = false;
						}

						if (Math.abs((best_info.cp - info_list[i].cp)/100) > Math.sqrt((Math.abs(best_info.cp/100) + 0.6))) {
							good_n = false;
						}
					}
				}

				// Doomed flag, for moves proven to lose...

				let doomed = typeof info_list[i].u === "number" && info_list[i].u === 0 && info_list[i].value() === 0;

				if (config.arrow_filter_type === "all") {
					doomed = false;
				}

				// Go ahead, if the various tests don't filter the move out...

				if (specific_source || i === 0 || (good_u && good_n && !doomed) || info_list[i].move === show_move) {

					let [x1, y1] = XY(info_list[i].move.slice(0, 2));
					let [x2, y2] = XY(info_list[i].move.slice(2, 4));

					let loss = 0;

					if (typeof best_info.q === "number" && typeof info_list[i].q === "number") {
						loss = best_info.value() - info_list[i].value();
					}

					let colour;

					if (info_list[i].move === show_move && typeof config.next_move_colour === "string") {
						if (info_list[i] === best_info && !info_list[i].__arrow_temp) {
							colour = config.best_colour;
						} else {
							colour = config.next_move_colour;
						}
					} else if (info_list[i] === best_info) {
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

			if (o.info.__arrow_temp) {							// The info was created above just to have an arrow.
				s = "?";
			}

			boardctx.fillText(s, cc2.cx, cc2.cy + 1);
		}
	};

	ih.set_special_message = function(s, css_class) {		// Can leave css_class undefined to use a default.
		this.special_message = s;
		this.special_message_class = css_class;
		this.special_message_time = performance.now();
	};

	return ih;
}
