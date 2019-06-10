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

	get_root: function() {

		let node = this;

		while (node.parent) {
			node = node.parent;
		}

		return node;
	},

	get_board: function() {

		if (this.position) {
			return this.position;
		}

		let ppos = this.parent.get_board();
		this.position = ppos.move(this.move);
		return this.position;
	},

	fen: function() {
		return this.get_board().fen();
	}
};

function NewNode(parent, move) {		// args are null for root only.

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
	ret.position = startpos;

	return ret;
}
