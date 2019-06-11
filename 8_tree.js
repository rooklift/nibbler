"use strict";

const node_prototype = {

	make_move: function(s) {

		// s must be exactly a legal move, including having promotion char iff needed (e.g. e2e1q)

		for (let child of this.children) {
			if (child.move === s) {
				return child;
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
	},

	fen: function() {
		return this.get_board().fen();
	},

	nice_move: function() {
		if (!this.move || !this.parent) {
			return "??";
		}

		return this.parent.get_board().nice_string(this.move);
	}
};

function NewNode(parent, move) {		// Args are null for root only.

	let ret = Object.create(node_prototype);

	ret.parent = parent;
	ret.move = move;					// Think of this as the move that led to the position associated with node.
	ret.children = [];

	return ret;
}

function NewTree(startpos) {
	
	if (!startpos) {
		startpos = LoadFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
	}

	let ret = NewNode(null, null);
	ret.__position = startpos;

	return ret;
}
