"use strict";

function NewInfoHandler() {

	let ih = Object.create(null);
	Object.assign(ih, info_misc_props);
	Object.assign(ih, info_receiver_props);
	Object.assign(ih, arrow_props);
	Object.assign(ih, infobox_props);

	ih.ever_drew_infobox = false;
	ih.ever_updated_a_table = false;

	ih.one_click_moves = New2DArray(8, 8, null);	// Array of possible one-click moves. Updated by draw_arrows().
	ih.info_clickers = [];							// Elements in the infobox. Updated by draw_infobox().
	ih.info_clickers_node_id = null;

	ih.special_message = null;
	ih.special_message_class = "yellow";
	ih.special_message_timeout = performance.now();

	ih.last_drawn_node_id = null;
	ih.last_drawn_version = null;
	ih.last_drawn_highlight = null;
	ih.last_drawn_highlight_class = null;
	ih.last_drawn_length = 0;
	ih.last_drawn_searchmoves = [];
	ih.last_drawn_allow_inactive_focus = null;

	// Info about engine cycles. These aren't reset even when the engine resets.

	ih.engine_cycle = 0;		// Count of "go" commands emitted. Since Engine can change, can't store this in Engine objects
	ih.engine_subcycle = 0;		// Count of how many times we have seen "multipv 1" - each time it's a new "block" of info

	// Info about the current engine...
	// Note that, when the engine is restarted, hub must call reset_engine_info() to fix these. A bit lame.

	ih.engine_start_time = performance.now();
	ih.engine_sent_info = false;
	ih.engine_sent_q = false;
	ih.engine_sent_errors = false;
	ih.error_time = 0;
	ih.error_log = "";
	ih.next_vms_order_int = 1;

	return ih;
}

let info_misc_props = {

	set_special_message: function(s, css_class, duration) {
		if (!css_class) css_class = "yellow";
		if (!duration) duration = 3000;
		this.special_message = s;
		this.special_message_class = css_class;
		this.special_message_timeout = performance.now() + duration;
	},

	reset_engine_info: function() {
		this.engine_start_time = performance.now();
		this.engine_sent_info = false;
		this.engine_sent_q = false;
		this.engine_sent_errors = false;
		this.error_time = 0;
		this.error_log = "";
		this.next_vms_order_int = 1;
	},

	displaying_error_log: function() {

		// Recent error...

		if (this.engine_sent_errors && performance.now() - this.error_time < 10000) {
			return true;
		}

		// Engine hasn't yet sent info, and was recently started...

		if (!this.engine_sent_info) {
			if (performance.now() - this.engine_start_time < 5000) {
				return true;
			}
		}

		// We have never updated a table (meaning we never received useful info from an engine)...

		if (!this.ever_updated_a_table) {
			return true;
		}

		return false;
	},
};

let info_receiver_props = {

	err_receive: function(s) {

		if (typeof s !== "string") {
			return;
		}

		if (this.error_log.length > 50000) {
			return;
		}

		let s_low = s.toLowerCase();

		if (s_low.includes("warning") || s_low.includes("error") || s_low.includes("unknown") || s_low.includes("failed") || s_low.includes("exception")) {
			this.engine_sent_errors = true;
			this.error_log += `<span class="red">${s}</span><br>`;
			this.error_time = performance.now();
		} else {
			this.error_log += `${s}<br>`;
		}
	},

	receive: function(engine, node, s) {

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
			} else {																	// We don't.
				if (board.illegal(move)) {
					if (config.log_illegal_moves) {
						Log(`INVALID / ILLEGAL MOVE RECEIVED: ${move}`);
					}
					return;
				}
				move_info = NewInfo(board, move);
				node.table.moveinfo[move] = move_info;
			}

			let move_cycle_pre_update = move_info.cycle;

			// ---------------------------------------------------------------------------------------------------------------------

			if (!engine.leelaish) {
				move_info.clear_stats();				// The stats we get this way are all that the engine has, so clear everything.
			}
			move_info.leelaish = engine.leelaish;

			this.engine_sent_info = true;				// After the move legality check; i.e. we want REAL info
			this.ever_updated_a_table = true;
			node.table.version++;

			move_info.cycle = this.engine_cycle;
			move_info.__touched = true;

			// ---------------------------------------------------------------------------------------------------------------------

			let did_set_q_from_mate = false;

			tmp = parseInt(infovals["cp"], 10);
			if (Number.isNaN(tmp) === false) {
				move_info.cp = tmp;
				if (this.engine_sent_q === false) {
					move_info.q = QfromPawns(tmp / 100);		// Potentially overwritten later by the better QfromWDL()
				}
				move_info.mate = 0;								// Engines will send one of cp or mate, so mate gets reset when receiving cp
			}

			tmp = parseInt(infovals["mate"], 10);
			if (Number.isNaN(tmp) === false) {
				move_info.mate = tmp;
				if (tmp !== 0) {
					move_info.q = tmp > 0 ? 1 : -1;
					move_info.cp = tmp > 0 ? 32000 : -32000;
					did_set_q_from_mate = true;
				}
			}

			tmp = parseInt(infovals["multipv"], 10);
			if (Number.isNaN(tmp) === false) {
				move_info.multipv = tmp;
				if (tmp === 1) {
					this.engine_subcycle++;
				}
			} else {
				this.engine_subcycle++;
			}
			move_info.subcycle = this.engine_subcycle;

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
			if (this.engine_sent_q === false && !did_set_q_from_mate && Array.isArray(move_info.wdl)) {
				move_info.q = QfromWDL(move_info.wdl);
			}

			// If the engine isn't respecting Chess960 castling format, the PV
			// may contain old-fashioned castling moves...

			let new_pv = InfoPV(s);
			C960_PV_Converter(new_pv, board);

			if (CompareArrays(new_pv, move_info.pv) === false) {
				if (!board.sequence_illegal(new_pv)) {
					if (move_cycle_pre_update === move_info.cycle && ArrayStartsWith(move_info.pv, new_pv)) {
						// Skip the update. This partially mitigates Stockfish sending unresolved PVs.
					} else {
						move_info.pv = new_pv;
						move_info.nice_pv_cache = null;
					}
				} else {
					move_info.pv = [move];
					move_info.nice_pv_cache = null;
				}
			}

		} else if (s.startsWith("info string") && !s.includes("NNUE evaluation")) {

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
				if (board.illegal(move)) {
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

			this.engine_sent_info = true;				// After the move legality check; i.e. we want REAL info
			this.ever_updated_a_table = true;
			node.table.version++;

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
				this.engine_sent_q = true;
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

		} else if (s.startsWith("info") && s.includes(" pv ") && (s.includes("lowerbound") || s.includes("upperbound"))) {

			if (config.log_info_lines) Log("< " + s);

			let infovals = InfoValMany(s, ["pv", "multipv"]);

			let tmp;
			let move_info;
			let move = infovals["pv"];
			move = board.c960_castling_converter(move);

			if (node.table.moveinfo[move] && !node.table.moveinfo[move].__ghost) {		// We already have move info for this move.
				move_info = node.table.moveinfo[move];
			}

			if (move_info) {
				tmp = parseInt(infovals["multipv"], 10);
				if (Number.isNaN(tmp) === false) {
					move_info.multipv = tmp;
					move_info.subcycle = this.engine_subcycle;
				}
			}

		} else {

			if (config.log_info_lines && config.log_useless_info) Log("< " + s);

		}
	},
};
