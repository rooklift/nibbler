"use strict";

// The table object stores info from the engine about a game-tree (PGN) node.

function NewTable() {
	let table = Object.create(table_prototype);
	table.clear();
	return table;
}

const table_prototype = {

	clear: function() {
		this.moveinfo = Object.create(null);	// move --> info
		this.version = 0;						// Incremented on any change
		this.nodes = 0;							// Stat sent by engine
		this.nps = 0;							// Stat sent by engine
		this.tbhits = 0;						// Stat sent by engine
		this.time = 0;							// Stat sent by engine
		this.limit = null;						// The limit of the last search that updated this.
		this.terminal = null;					// null = unknown, "" = not terminal, "Non-empty string" = terminal reason
		this.graph_y = null;					// Used by grapher only, value from White's POV between 0 and 1
		this.graph_y_version = 0;				// Which version (above) was used to generate the graph_y value
		this.already_autopopulated = false;
	},

	get_cp_details: function() {
		let info = SortedMoveInfoFromTable(this)[0];
		if (info && !info.__ghost && info.__touched && (this.nodes > 1 || this.limit === 1)) {
			let return_cp = ((info.board.active === "b") ? (-info.cp) : (info.cp));
			return {
				'nextmove': info.board.active,
				'cp': return_cp
			};
		} else {
			return null;
		}
	},

	get_graph_y: function() {

		// Naphthalin's scheme: based on centipawns.

		if (this.graph_y_version !== this.version) {
			let engine_info_graph_details = this.get_cp_details();
			if (engine_info_graph_details !== null) {
				let cp = engine_info_graph_details.cp;
				this.graph_y = 1 / (1 + Math.pow(0.5, cp / 100));
			} else {
				this.graph_y = null;
			}
			this.graph_y_version = this.version;
		}
		return this.graph_y;
	},

	set_terminal_info: function(reason, ev) {	// ev is ignored if reason is "" (i.e. not a terminal position)
		if (reason) {
			this.terminal = reason;
			this.graph_y = ev;
			this.graph_y_version = this.version;
		} else {
			this.terminal = "";
		}
	},

	autopopulate: function(node) {

		if (!node) {
			throw "autopopulate() requires node argument";
		}

		if (this.already_autopopulated) {
			return;
		}

		if (node.destroyed) {
			return;
		}

		let moves = node.board.movegen();

		for (let move of moves) {
			if (node.table.moveinfo[move] === undefined) {
				node.table.moveinfo[move] = NewInfo(node.board, move);
			}
		}

		this.already_autopopulated = true;
	}
};

// --------------------------------------------------------------------------------------------
// The info object stores info received from the engine about a move. The actual updating of
// the object takes place in info.js and the ih.receive() method there.

function NewInfo(board, move) {

	let info = Object.create(info_prototype);

	info.board = board;
	info.move = move;
	info.__ghost = false;			// If not false, this is temporary inferred info.
	info.__touched = false;			// Has this ever actually been updated?
	info.leelaish = false;			// Whether the most recent update to this info was from an engine considered Leelaish.
	info.pv = [move];				// Validated as a legal sequence upon reception.
	info.cycle = 0;					// How many "go" commands Nibbler has emitted.
	info.subcycle = 0;				// How many "blocks" of info we have seen (delineated by multipv 1 info).

	info.nice_pv_cache = [board.nice_string(move)];

	info.clear_stats();
	return info;
}

const info_prototype = {

	// I'm not sure I've been conscientious everywhere in the code about checking whether these things are
	// of the right type, so for that reason most are set to some neutralish value by default.
	//
	// Exceptions: m, v, wdl (and note that all of these can be set to null by info.js)

	clear_stats: function() {
		this.cp = 0;
		this.depth = 0;
		this.m = null;
		this.mate = 0;				// 0 can be the "not present" value.
		this.multipv = 1;
		this.n = 0;
		this.p = 0;					// Note P is received and stored as a percent, e.g. 31.76 is a reasonable P.
		this.q = 0;
		this.s = 1;					// Known as Q+U before Lc0 v0.25-rc2
		this.seldepth = 0;
		this.u = 1;
		this.uci_nodes = 0;			// The number of nodes reported by the UCI info lines (i.e. for the whole position).
		this.v = null;
		this.vms_order = 0;			// VerboseMoveStats order, 0 means not present, 1 is the worst, higher is better.
		this.wdl = null;			// Either null or a length 3 array of ints.
	},

	set_pv: function(pv) {
		this.pv = Array.from(pv);
		this.nice_pv_cache = null;
	},

	nice_pv: function() {

		// Human readable moves.

		if (this.nice_pv_cache) {
			return Array.from(this.nice_pv_cache);
		}

		let tmp_board = this.board;

		if (!this.pv || this.pv.length === 0) {			// Should be impossible.
			this.pv = [this.move];
		}

		let ret = [];

		for (let move of this.pv) {

			// if (tmp_board.illegal(move)) break;		// Should be impossible as of 1.8.4: PVs are validated upon reception, and the only other
														// way they can get changed is by maybe_infer_info(), which hopefully is sound.
			ret.push(tmp_board.nice_string(move));
			tmp_board = tmp_board.move(move);
		}

		this.nice_pv_cache = ret;
		return Array.from(this.nice_pv_cache);
	},

	value: function() {
		return Value(this.q);		// Rescaled to 0..1
	},

	value_string: function(dp, pov) {
		if (!this.__touched || typeof this.q !== "number") {
			return "?";
		}
		if (this.leelaish && this.n === 0) {
			return "?";
		}
		let val = this.value();
		if ((pov === "w" && this.board.active === "b") || (pov === "b" && this.board.active === "w")) {
			val = 1 - val;
		}
		return (val * 100).toFixed(dp);
	},

	cp_string: function(pov) {
		if (!this.__touched || typeof this.cp !== "number") {
			return "?";
		}
		if (this.leelaish && this.n === 0) {
			return "?";
		}
		let cp = this.cp;
		if ((pov === "w" && this.board.active === "b") || (pov === "b" && this.board.active === "w")) {
			cp = 0 - cp;
		}
		let ret = (cp / 100).toFixed(2);
		if (cp > 0) {
			ret = "+" + ret;
		}
		return ret;
	},

	mate_string: function(pov) {
		if (typeof this.mate !== "number" || this.mate === 0) {
			return "?";
		}
		let mate = this.mate;
		if ((pov === "w" && this.board.active === "b") || (pov === "b" && this.board.active === "w")) {
			mate = 0 - mate;
		}
		if (mate < 0) {
			return `(-M${0 - mate})`;
		} else {
			return `(+M${mate})`;
		}
	},

	wdl_string: function(pov) {
		if (Array.isArray(this.wdl) === false || this.wdl.length !== 3) {
			return "?";
		}
		if ((pov === "w" && this.board.active === "b") || (pov === "b" && this.board.active === "w")) {
			return `${this.wdl[2]} ${this.wdl[1]} ${this.wdl[0]}`;
		} else {
			return `${this.wdl[0]} ${this.wdl[1]} ${this.wdl[2]}`;
		}
	},

	stats_list: function(opts, total_nodes) {		// We pass total_nodes rather than use this.uci_nodes which can be obsolete (e.g. due to searchmoves)

		if (this.__ghost) {
			return ["Inferred"];
		}

		let ret = [];

		if (opts.ev) {
			ret.push(`EV: ${this.value_string(1, opts.ev_pov)}%`);
		}

		if (opts.cp) {
			ret.push(`CP: ${this.cp_string(opts.cp_pov)}`);
		}

		// N is fairly complicated...

		if (this.leelaish) {

			if (typeof this.n === "number" && total_nodes) {		// i.e. total_nodes is not zero or undefined

				let n_string = "";

				if (opts.n) {
					n_string += ` N: ${(100 * this.n / total_nodes).toFixed(2)}%`;
				}

				if (opts.n_abs) {
					if (opts.n) {
						n_string += ` [${NString(this.n)}]`;
					} else {
						n_string += ` N: ${NString(this.n)}`;
					}
				}

				if (opts.of_n) {
					n_string += ` of ${NString(total_nodes)}`;
				}

				if (n_string !== "") {
					ret.push(n_string.trim());
				}

			} else {

				if (opts.n || opts.n_abs || opts.of_n) {
					ret.push("N: ?");
				}

			}
		}

		// Everything else...

		if (!this.leelaish) {
			if (opts.depth) {
				if (typeof this.depth === "number" && this.depth > 0) {
					ret.push(`Depth: ${this.depth}`);
				} else {
					ret.push(`Depth: 0`);
				}
			}
		}

		if (this.leelaish) {
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
		}

		if (opts.q) {
			if (typeof this.q === "number") {
				ret.push(`Q: ${this.q.toFixed(3)}`);
			} else {
				ret.push(`Q: ?`);
			}
		}

		if (this.leelaish) {
			if (opts.u) {
				if (typeof this.u === "number" && this.n > 0) {						// Checking n is correct.
					ret.push(`U: ${this.u.toFixed(3)}`);
				} else {
					ret.push(`U: ?`);
				}
			}
			if (opts.s) {
				if (typeof this.s === "number" && this.n > 0) {						// Checking n is correct.
					ret.push(`S: ${this.s.toFixed(5)}`);
				} else {
					ret.push(`S: ?`);
				}
			}
			if (opts.m) {
				if (typeof this.m === "number") {
					if (this.m > 0) {
						ret.push(`M: ${this.m.toFixed(1)}`);
					} else {
						ret.push(`M: 0`);
					}
				} else {
					ret.push(`M: ?`);
				}
			}
		}

		if (opts.wdl) {
			ret.push(`WDL: ${this.wdl_string(opts.wdl_pov)}`);
		}

		return ret;
	}
};
