"use strict";

function NewNode(parent, move, board_for_root) {		// move must be legal; board is only relevant for root nodes

	let node = Object.create(node_prototype);
	node.id = next_node_id++;
	live_nodes[node.id.toString()] = node;

	if (parent) {
		parent.children.push(node);
		node.parent = parent;
		node.move = move;
		node.board = parent.board.move(move);
		node.depth = parent.depth + 1;
		node.graph_length_knower = parent.graph_length_knower;		// 1 object every node points to, a bit lame
	} else {
		node.parent = null;
		node.move = null;
		node.board = board_for_root;
		node.depth = 0;
		node.graph_length_knower = {val: config.graph_minimum_length};
	}

	if (node.depth + 1 > node.graph_length_knower.val) {
		node.graph_length_knower.val = node.depth + 1;
	}

	node.table = NewTable();
	node.searchmoves = [];
	node.__nice_move = null;
	node.destroyed = false;
	node.children = [];

	return node;
}

function NewRoot(board) {					// Arg is a board (position) object, not a FEN

	if (!board) {
		board = LoadFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
	}

	let root = NewNode(null, null, board);

	// Tags. Only root gets these. Get overwritten by the PGN loader.
	// Internally, these get kept as HTML-safe, PGN-unsafe.

	root.tags = Object.create(null);
	root.tags.Event = "?";
	root.tags.Site = "?";
	root.tags.Date = DateString(new Date());
	root.tags.Round = "?";
	root.tags.White = "White";
	root.tags.Black = "Black";
	root.tags.Result = "*";

	return root;
}

const node_prototype = {

	make_move: function(s, force_new_node) {

		// s must be exactly a legal move, including having promotion char iff needed (e.g. e2e1q)

		if (!force_new_node) {
			for (let child of this.children) {
				if (child.move === s) {
					return child;
				}
			}
		}

		return NewNode(this, s, null);
	},

	history: function() {

		let ret = [];
		let node = this;

		while (node.move) {
			ret.push(node.move);
			node = node.parent;
		}

		ret.reverse();
		return ret;
	},

	history_old_format: function() {		// For engines that can't handle Chess960 format stuff.

		let ret = [];
		let node = this;

		while (node.move) {
			ret.push(node.move_old_format());
			node = node.parent;
		}

		ret.reverse();
		return ret;
	},

	move_old_format: function() {
		let move = this.move;
		if (move === "e1h1" && this.parent.board.state[4][7] === "K") return "e1g1";
		if (move === "e1a1" && this.parent.board.state[4][7] === "K") return "e1c1";
		if (move === "e8h8" && this.parent.board.state[4][0] === "k") return "e8g8";
		if (move === "e8a8" && this.parent.board.state[4][0] === "k") return "e8c8";
		return move;
	},

	node_history: function() {

		let ret = [];
		let node = this;

		while (node) {
			ret.push(node);
			node = node.parent;
		}

		ret.reverse();
		return ret;
	},

	all_graph_values: function() {

		// Call this on any node in the line will give the same result.

		let ret = [];
		let node = this.get_end();

		while (node) {
			ret.push(node.table.get_graph_y());
			node = node.parent;
		}

		ret.reverse();
		return ret;
	},

	future_history: function() {
		return this.get_end().history();
	},

	future_node_history: function() {
		return this.get_end().node_history();
	},

	get_root: function() {

		let node = this;

		while (node.parent) {
			node = node.parent;
		}

		return node;
	},

	get_end: function() {

		let node = this;

		while (node.children.length > 0) {
			node = node.children[0];
		}

		return node;
	},

	return_to_main_line_helper: function() {

		// Returns the node that "return to main line" should go to.

		let ret = this;
		let node = this;

		while (node.parent) {
			if (node.parent.children[0] !== node) {
				ret = node.parent;
			}
			node = node.parent;
		}

		return ret;
	},

	is_main_line: function() {

		let node = this;

		while (node.parent) {
			if (node.parent.children[0] !== node) {
				return false;
			}
			node = node.parent;
		}

		return true;
	},

	is_same_line: function(other) {

		// This is not testing whether one is an ancestor of the other, but
		// rather whether the main lines of each end in the same place.

		// Easy case is when one is the parent of the other...

		if (this.parent === other) return other.children[0] === this;
		if (other.parent === this) return this.children[0] === other;

		return this.get_end() === other.get_end();
	},

	is_triple_rep: function() {

		// Are there enough ancestors since the last pawn move or capture?

		if (this.board.halfmove < 8) {
			return false;
		}

		let ancestor = this;
		let hits = 0;

		while (ancestor.parent && ancestor.parent.parent) {
			ancestor = ancestor.parent.parent;
			if (ancestor.board.compare(this.board)) {
				hits++;
				if (hits >= 2) {
					return true;
				}
			}

			// All further ancestors are the wrong side of a pawn move or capture?

			if (ancestor.board.halfmove < 2) {
				return false;
			}
		}

		return false;
	},

	nice_move: function() {

		if (this.__nice_move) {
			return this.__nice_move;
		}

		if (!this.move || !this.parent) {
			this.__nice_move = "??";
		} else {
			this.__nice_move = this.parent.board.nice_string(this.move);
		}

		return this.__nice_move;
	},

	token: function(stats_flag, force_number_flag) {

		// The complete token when writing the move, including number string if necessary,
		// which depends on position within variations etc and so cannot easily be cached.
		// We don't do brackets because closing brackets are complicated.

		if (!this.move || !this.parent) {
			return "";
		}

		let need_number_string = false;

		if (force_number_flag) need_number_string = true;
		if (!this.parent.parent) need_number_string = true;
		if (this.parent.board.active === "w") need_number_string = true;
		if (this.parent.children[0] !== this) need_number_string = true;

		// There are some other cases where we are supposed to have numbers but the logic
		// escapes me right now.

		let s = "";

		if (need_number_string) {
			s += this.parent.board.next_number_string() + " ";
		}

		s += this.nice_move();

		if (stats_flag) {
			let stats = this.make_stats();
			if (stats !== "") {
				s += " {" + stats + "}";
			}
		}

		return s;
	},

	make_stats: function() {

		if (!this.parent) {
			return "";
		}

		let info = this.parent.table.moveinfo[this.move];
		let total_nodes = this.parent.table.nodes;

		if (!info || info.__ghost || info.__touched === false) {
			return "";
		}

		let sl = info.stats_list({
			ev_pov:        config.ev_pov,
			cp_pov:        config.cp_pov,
			wdl_pov:       config.wdl_pov,
			ev:            config.pgn_ev,
			cp:            config.pgn_cp,
			n:             config.pgn_n,
			n_abs:         config.pgn_n_abs,
			of_n:          config.pgn_of_n,
			depth:         config.pgn_depth,
			wdl:           config.pgn_wdl,
			p:             config.pgn_p,
			m:             config.pgn_m,
			v:             config.pgn_v,
			q:             config.pgn_q,
			u:             config.pgn_u,
			s:             config.pgn_s,
		}, total_nodes);

		return sl.join(", ");			// Will be "" on empty list
	},

	end_nodes: function() {
		if (this.children.length === 0) {
			return [this];
		} else {
			let list = [];
			for (let child of this.children) {
				list = list.concat(child.end_nodes());
			}
			return list;
		}
	},

	terminal_reason: function() {

		// Returns "" if not a terminal position, otherwise returns the reason.
		// Also updates table.graph_y if needed.

		if (typeof this.table.terminal === "string") {
			return this.table.terminal;
		}

		let board = this.board;

		if (board.no_moves()) {
			if (board.king_in_check()) {
				this.table.set_terminal_info("Checkmate", board.active === "w" ? 0 : 1);	// The PGN writer checks for this exact string! (Lame...)
			} else {
				this.table.set_terminal_info("Stalemate", 0.5);
			}
		} else if (board.insufficient_material()) {
			this.table.set_terminal_info("Insufficient Material", 0.5);
		} else if (board.halfmove >= 100) {
			this.table.set_terminal_info("50 Move Rule", 0.5);
		} else if (this.is_triple_rep()) {
			this.table.set_terminal_info("Triple Repetition", 0.5);
		} else {
			this.table.set_terminal_info("", null);
		}

		return this.table.terminal;
	},

	validate_searchmoves: function(arr) {

		// Returns a new array with only legal searchmoves.

		if (Array.isArray(arr) === false) {
			arr = [];
		}

		let valid_list = [];

		for (let move of arr) {
			if (this.board.illegal(move) === "") {
				valid_list.push(move);
			}
		}

		return valid_list;
	},

	detach: function() {

		// Returns the node that the hub should point to,
		// which is the parent unless the call is a bad one.

		let parent = this.parent;
		if (!parent) return this;			// Fail

		parent.children = parent.children.filter(child => child !== this);

		this.parent = null;
		DestroyTree(this);
		return parent;
	},

	polyglot_book: function(filepath) {		// Partially written by Claude, secret method for Naphthalin, saves .bin to filepath

		let book = [];
		AddTreeToBook(this, book);

		let polyglot_entries = [];

		for (let entry of book) {

			let [x1, y1] = XY(entry.move.slice(0, 2));
			let [x2, y2] = XY(entry.move.slice(2, 4));
			let promotion = entry.move.slice(4);

			let move_val = 0;
			let promotion_val = 0;

			if (promotion) {
				switch (promotion.toLowerCase()) {
					case "n": promotion_val = 1; break;
					case "b": promotion_val = 2; break;
					case "r": promotion_val = 3; break;
					case "q": promotion_val = 4; break;
				}
			}

			move_val |= (x2 & 0b111);						// bits 0-2: to file
			move_val |= (((7 - y2) & 0b111) << 3);			// bits 3-5: to rank
			move_val |= ((x1 & 0b111) << 6);				// bits 6-8: from file
			move_val |= (((7 - y1) & 0b111) << 9);  		// bits 9-11: from rank
			move_val |= ((promotion_val & 0b111) << 12);	// bits 12-14: promotion piece

			polyglot_entries.push((entry.key << 64n) + (BigInt(move_val) << 48n) + (1n << 32n));
		}

		polyglot_entries.sort((a, b) => (a < b) ? -1 : (a > b) ? 1 : 0);

		let buffer = Buffer.alloc(polyglot_entries.length * 16);

		for (let i = 0; i < polyglot_entries.length; i++) {
			let entry = polyglot_entries[i];
			let position = i * 16;

			for (let j = 0; j < 16; j++) {
				let bit_shift = BigInt(15 - j) * 8n;
				let byte_val = Number((entry >> bit_shift) & 0xFFn);
				buffer[position + j] = byte_val;
			}
		}

		fs.writeFileSync(filepath, buffer);
	},
};

// ---------------------------------------------------------------------------------------------------------
// On the theory that it might help the garbage collector, we can
// destroy trees when we're done with them. Whether this is helpful
// in general I don't know, but we also take this opportunity to
// clear nodes from the live_list.

function DestroyTree(node) {
	if (!node || node.destroyed) {
		console.log("Warning: DestroyTree() called with invalid arg");
		return;
	}
	__destroy_tree(node.get_root());
}

function __destroy_tree(node) {

	// Non-recursive when possible...

	while (node.children.length === 1) {

		let child = node.children[0];

		node.parent = null;
		node.board = null;
		node.children = null;
		node.searchmoves = null;
		node.table = null;
		node.graph_length_knower = null;
		node.destroyed = true;

		delete live_nodes[node.id.toString()];

		node = child;
	}

	// Recursive when necessary...

	let children = node.children;

	node.parent = null;
	node.board = null;
	node.children = null;
	node.searchmoves = null;
	node.table = null;
	node.graph_length_knower = null;
	node.destroyed = true;

	delete live_nodes[node.id.toString()];

	for (let child of children) {
		__destroy_tree(child);
	}
}

// ---------------------------------------------------------------------------------------------------------
// Reset analysis and searchmove selections, recursively.

function CleanTree(node) {
	if (!node || node.destroyed) {
		return;
	}
	__clean_tree(node.get_root());
}

function __clean_tree(node) {

	// Non-recursive when possible...

	while (node.children.length === 1) {
		node.table.clear();
		node.searchmoves = [];
		node = node.children[0];
	}

	// Recursive when necessary...

	node.table.clear();
	node.searchmoves = [];

	for (let child of node.children) {
		__clean_tree(child);
	}
}

// ------------------------------------------------------------------------------------------------------
// Add positions to a book, using the given tree. No sorting here, needs to be done after completion.

function AddTreeToBook(node, book) {

	if (!book || Array.isArray(book) === false) {
		throw "AddTreeToBook called without valid array";
	}

	if (!node || node.destroyed) {
		return book;
	}

	__add_tree_to_book(node.get_root(), book);

	return book;
}

function __add_tree_to_book(node, book) {

	// Non-recursive when possible...

	while (node.children.length === 1) {

		let key = KeyFromBoard(node.board);
		let move = node.children[0].move;

		book.push({							// Duplicates allowed. This is improper.
			key: key,
			move: move,
			weight: 1,
		});

		node = node.children[0];
	}

	if (node.children.length === 0) {		// Do this test here, not at the start, since it can become true.
		return;
	}

	// Recursive when necessary...

	let key = KeyFromBoard(node.board);

	for (let child of node.children) {

		book.push({							// Duplicates allowed. This is improper.
			key: key,
			move: child.move,
			weight: 1,
		});

		__add_tree_to_book(child, book);
	}
}
