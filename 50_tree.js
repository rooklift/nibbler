"use strict";

// EVERYTHING that changes the tree structure must increment the global counter  tree_version
// Currently this means:
//
//		- NewNode()
//		- promote_to_main_line()
//		- detach()

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

		let moves = [];
		let node = this;

		while (node.move) {
			moves.push(node.move);
			node = node.parent;
		}

		moves.reverse();
		return moves;
	},

	future_history: function() {
		return this.get_end().history();
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

	get_board: function() {

		if (this.__position) {
			return this.__position;
		}

		let ppos = this.parent.get_board();
		this.__position = ppos.move(this.move);
		return this.__position;
	},

	promote_to_main_line: function() {

		let node = this;

		while (node.parent) {
			if (node.parent.children[0] !== node) {
				for (let n = 1; n < node.parent.children.length; n++) {
					if (node.parent.children[n] === node) {
						node.parent.children[n] = node.parent.children[0];
						node.parent.children[0] = node;
						break;
					}
				}
			}
			node = node.parent;
		}

		tree_version++;
	},

	fen: function() {
		return this.get_board().fen();
	},

	nice_move: function() {
		if (!this.move || !this.parent) {
			return "??";
		}

		return this.parent.get_board().nice_string(this.move);
	},

	token: function() {

		// The complete token when writing the move, including number string if necessary,
		// which depends on position within variations etc...

		if (!this.parent) {
			return "";
		}

		let need_number_string = false;

		if (this.parent.get_board().active === "w") need_number_string = true;
		if (this.parent.children[0] !== this) need_number_string = true;

		// In theory we should also write the number if the parent had siblings. Meh.

		let s = "";

		if (need_number_string) {
			s += this.parent.get_board().next_number_string() + " ";
		}
		
		s += this.nice_move();

		if (this.stats) {
			s += " {" + this.stats + "}";
		}

		return s;
	},

	detach: function() {

		// Returns the node that the renderer should point to,
		// which is either the parent (if there is one) or
		// this node itself (if there isn't).

		let parent = this.parent;
		if (!parent) return this;

		let new_list_for_parent = [];

		for (let c of parent.children) {
			if (c !== this) {
				new_list_for_parent.push(c);
			}
		}

		parent.children = new_list_for_parent;
		this.parent = null;

		tree_version++;
		return parent;
	}
};

function NewNode(parent, move) {		// Args are null for root only.

	let node = Object.create(node_prototype);

	node.__position = null;
	node.parent = parent;
	node.move = move;					// Think of this as the move that led to the position associated with node.
	node.children = [];

	tree_version++;
	return node;
}

function NewTree(startpos) {
	
	if (!startpos) {
		startpos = LoadFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
	}

	let root = NewNode(null, null);
	root.__position = startpos;

	return root;
}

// On the theory that it might help the garbage collector, we can
// destroy trees when we're done with them. Perhaps this is totally
// unnecessary. I've seen it matter in Python.

function DestroyTree(node) {
	__destroy_tree(node.get_root());
}

function __destroy_tree(node) {

	while (node.children.length === 1) {
		node.parent = null;
		node.__position = null;
		let child = node.children[0];
		node.children = null;
		node = child;
	}

	node.parent = null;
	node.__position = null;

	for (let child of node.children) {
		__destroy_tree(child);
	}

	node.children = null;
	return;
}
