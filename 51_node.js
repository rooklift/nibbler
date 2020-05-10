"use strict";

function NewNode(parent, move, board) {		// move must be legal; board is only relevant for root nodes

	let node = Object.create(node_prototype);
	node.id = next_node_id++;
	live_nodes[node.id.toString()] = node;

	if (parent) {
		node.parent = parent;
		node.move = move;
		node.board = parent.board.move(move);
		node.depth = parent.depth + 1;
		node.graph_length_knower = parent.graph_length_knower		// 1 object every node points to, a bit lame
	} else {
		node.parent = null;
		node.move = null;
		node.board = board;
		node.depth = 0;
		node.graph_length_knower = {val: config.graph_minimum_length};
	}

	if (node.depth + 1 > node.graph_length_knower.val) {
		node.graph_length_knower.val = node.depth + 1;
	}

	node.table = NewTable();
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

	root.tags = Object.create(null);		// Only root gets these. Get overwritten by the PGN loader.
	root.tags.Event = "Nibbler Line";
	root.tags.Site = "The fevered dreams of a neural net";
	root.tags.Date = DateString(new Date());
	root.tags.Round = "1";
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

		let new_node = NewNode(this, s);
		this.children.push(new_node);

		return new_node;
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

	eval_history: function() {

		let ret = [];
		let node = this;

		while (node) {
			ret.push(node.table.eval);
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

	future_eval_history: function() {
		return this.get_end().eval_history();
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

		// Easy case is when one is the parent of the other...

		if (this.parent === other) return other.children[0] === this;
		if (other.parent === this) return this.children[0] === other;

		return this.get_end() === other.get_end();
	},

	is_triple_rep: function() {

		let our_board = this.board;
		let ancestor = this;
		let hits = 0;

		while (ancestor.parent && ancestor.parent.parent) {
			ancestor = ancestor.parent.parent;
			if (ancestor.board.compare(our_board)) {
				hits++;
				if (hits >= 2) {
					return true;
				}
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

	token: function(stats_flag) {

		// The complete token when writing the move, including number string if necessary,
		// which depends on position within variations etc and so cannot easily be cached.
		// We don't do brackets because closing brackets are complicated.

		if (!this.move || !this.parent) {
			return "";
		}

		let need_number_string = false;

		if (this.parent.board.active === "w") need_number_string = true;
		if (this.parent.children[0] !== this) need_number_string = true;

		// In theory we should also write the number if the parent had siblings. Meh.

		let s = "";

		if (need_number_string) {
			s += this.parent.board.next_number_string() + " ";
		}
		
		s += this.nice_move();

		if (stats_flag) {
			let stats = this.make_stats();
			if (stats != "") {
				s += " {" + stats + "}";
			}
		}

		return s;
	},

	make_stats() {

		if (!this.parent) {
			return "";
		}

		let info = this.parent.table.moveinfo[this.move];

		if (!info) {
			return "";
		}

		let sl = info.stats_list({
			ev_white_pov: config.ev_white_pov,
			cp_white_pov: config.cp_white_pov,
			ev:           config.sam_ev,
			cp:           config.sam_cp,
			n:            config.sam_n,
			n_abs:        config.sam_n_abs,
			of_n:         config.sam_of_n,
			wdl:          config.sam_wdl,
			p:            config.sam_p,
			m:            config.sam_m,
			v:            config.sam_v,
			q:            config.sam_q,
			d:            config.sam_d,
			u:            config.sam_u,
			s:            config.sam_s,
		});

		return sl.join(", ");			// Will be "" on empty list
	},

	detach: function() {

		// Returns the node that the renderer should point to,
		// which is the parent unless the call is a bad one.

		let parent = this.parent;
		if (!parent) return this;		// Fail

		let new_list_for_parent = [];

		for (let c of parent.children) {
			if (c !== this) {
				new_list_for_parent.push(c);
			}
		}

		parent.children = new_list_for_parent;
		this.parent = null;
		DestroyTree(this);
		return parent;
	},
};

// ---------------------------------------------------------------------------------------------------------
// On the theory that it might help the garbage collector, we can
// destroy trees when we're done with them. Whether this is helpful
// in general I don't know, but we also take this opportunity to
// clear nodes from the live_list.

function DestroyTree(node) {
	__destroy_tree(node.get_root());
}

function __destroy_tree(node) {

	// Non-recursive when possible...

	while (node.children.length === 1) {

		let child = node.children[0];

		node.parent = null;
		node.board = null;
		node.children = null;
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
	node.table = null;
	node.graph_length_knower = null;
	node.destroyed = true;

	delete live_nodes[node.id.toString()];

	for (let child of children) {
		__destroy_tree(child);
	}
}
