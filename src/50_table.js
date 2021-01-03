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
		this.time = 0;							// Stat sent by engine

		this.eval = null;						// Used by grapher only. Value from White's POV.
		this.eval_nodes = 0;					// Number of search nodes used to generate the eval.
	},

	update_eval_from_move: function(move) {

		// move should be the best move

		let info = this.moveinfo[move];

		if (!info || info.__ghost) return;

		// if (info.total_nodes < this.eval_nodes) return;			// This can feel unintuitive.

		this.eval = info.board.active === "w" ? info.value() : 1 - info.value();
		this.eval_nodes = info.total_nodes;
	},
};

// --------------------------------------------------------------------------------------------
// The info object stores info received from the engine about a move. The actual updating of
// the object takes place in info.js and the ih.receive() method there.

function NewInfo(board, move) {

	// In some places elsewhere we might assume these things will have sensible values, so
	// better not initialise most things to null. Best to use neutral-ish values, especially
	// since some info (cp and q) can be carried (inverted) into the next step of a line...

	let info = Object.create(info_prototype);
	info.__ghost = false;			// If not false, this is temporary inferred info. Will store a string to display.
	info.board = board;
	info.cp = 0;
	info.d = 0;
	info.depth = 0;
	info.m = 0;
	info.mate = 0;					// 0 can be the "not present" value.
	info.move = move;
	info.multipv = 1;
	info.n = 0;
	info.p = 0;						// Note P is received and stored as a percent, e.g. 31.76 is a reasonable P.
	info.pv = [move];				// Warning: never assume this is a legal sequence.
	info.nice_pv_cache = null;
	info.q = 0;
	info.s = 1;						// Known as Q+U before Lc0 v0.25-rc2
	info.seldepth = 0;
	info.total_nodes = 0;
	info.u = 1;
	info.v = null;					// Warning: v is allowed to be null if not known.
	info.version = 0;
	info.vms_order = 0;				// VerboseMoveStats order, 0 means not present, 1 is the worst, higher is better.
	info.wdl = "??";
	return info;
}

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

	value: function() {
		return Value(this.q);		// Rescaled to 0..1
	},

	value_string: function(dp, white_pov) {
		if (typeof this.q !== "number") {
			return "?";
		}
		let val = this.value();
		if (white_pov && this.board.active === "b") {
			val = 1 - val;
		}
		return (val * 100).toFixed(dp);
	},

	wdl_string: function(white_pov) {
		if (typeof this.wdl !== "string") {
			return "?";
		}
		let wdl = this.wdl;
		if (white_pov && this.board.active === "b") {
			let sp = wdl.split(" ");
			sp.reverse();
			return sp.join(" ");
		}
		return wdl;
	},

	cp_string: function(white_pov) {
		if (typeof this.cp !== "number") {
			return "?";
		}
		let cp = this.cp;
		if (white_pov && this.board.active === "b") {
			cp = 0 - cp;
		}
		let ret = (cp / 100).toFixed(2);
		if (cp > 0) {
			ret = "+" + ret;
		}
		return ret;
	},

	mate_string: function(white_pov) {
		if (typeof this.mate !== "number" || this.mate === 0) {
			return "?";
		}
		let mate = this.mate;
		if (white_pov && this.board.active === "b") {	// Is this the convention? Should check some time...
			mate = 0 - mate;
		}
		if (mate < 0) {
			return "-M" + (0 - mate).toString();
		} else {
			return "M" + mate.toString();
		}
	},

	stats_list: function(opts, total_nodes) {		// We pass total_nodes rather than use this.total_nodes which can be obsolete (e.g. due to searchmoves)

		let ret = [];

		if (opts.ev) {
			ret.push(`EV: ${this.value_string(1, opts.ev_white_pov)}%`);
		}

		if (opts.cp) {
			ret.push(`CP: ${this.cp_string(opts.cp_white_pov)}`);
		}

		// N is fairly complicated...

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

		if (opts.s) {
			if (typeof this.s === "number" && this.n > 0) {						// Checking n is correct.
				ret.push(`S: ${this.s.toFixed(5)}`);
			} else {
				ret.push(`S: ?`);
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
			ret.push(`WDL: ${this.wdl_string(opts.wdl_white_pov)}`);
		}

		return ret;
	}
};
