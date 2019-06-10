"use strict";

function NewTree(startpos) {
	
	if (!startpos) {
		startpos = LoadFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
	}

	let ret = NewNode(null, null);
	ret.startpos = startpos;			// only root gets this.

	return ret;
}

let node_prototype = {

	make_move: function(s) {

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

		if (!this.parent) {
			return this.startpos;
		}

		let moves = this.history();
		let pos = this.get_root().get_board();

		for (let m of moves) {
			pos = pos.move(m);
		}

		return pos;
	},

	fen: function() {
		return this.get_board().fen();
	}
};

function NewNode(parent, move) {		// args are null for root only.

	let ret = Object.create(node_prototype);

	ret.parent = parent;
	ret.move = move;
	ret.children = [];

	return ret;
}
