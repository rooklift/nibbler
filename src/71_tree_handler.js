"use strict";

// The point is that updating the node should trigger an immediate redraw. The caller doesn't need
// to care about redrawing. Ideally, this object should be able to make good decisions about how
// to best redraw.

function NewTreeHandler() {
	let handler = Object.create(null);
	Object.assign(handler, tree_manipulation_props);
	Object.assign(handler, tree_draw_props);
	handler.root = NewRoot();
	handler.node = handler.root;
	handler.node.table.autopopulate(handler.node);
	return handler;
}

let tree_manipulation_props = {

	// Since we use Object.assign(), it's bad form to have any deep objects in the props.

	tree_version: 0,		// Increment every time the tree structure changes.
	root: null,
	node: null,

	// Where relevant, return values of the methods are whether this.node changed -
	// i.e. whether the hub has to call position_changed()

	replace_tree: function(root) {
		DestroyTree(this.root);
		this.root = root;
		this.node = root;
		this.node.table.autopopulate(this.node);
		this.tree_version++;
		this.dom_from_scratch();
		return true;
	},

	set_node: function(node) {

		// Note that we may call dom_easy_highlight_change() so don't
		// rely on this to draw any nodes that never got drawn.

		if (!node || node === this.node || node.destroyed) {
			return false;
		}

		let original_node = this.node;
		this.node = node;

		if (original_node.is_same_line(this.node)) {		// This test is super-fast if one node is a parent of the other
			this.dom_easy_highlight_change();
		} else {
			this.dom_from_scratch();
		}

		return true;
	},

	prev: function() {
		return this.set_node(this.node.parent);				// OK if undefined
	},

	next: function() {
		return this.set_node(this.node.children[0]);		// OK if undefined
	},

	goto_root: function() {
		return this.set_node(this.root);
	},

	goto_end: function() {
		return this.set_node(this.node.get_end());
	},

	previous_sibling: function() {
		if (!this.node.parent || this.node.parent.children.length < 2) {
			return false;
		}
		if (this.node.parent.children[0] === this.node) {
			return this.set_node(this.node.parent.children[this.node.parent.children.length - 1]);
		}
		for (let i = this.node.parent.children.length - 1; i > 0; i--) {
			if (this.node.parent.children[i] === this.node) {
				return this.set_node(this.node.parent.children[i - 1]);
			}
		}
		return false;		// Can't get here.
	},

	next_sibling: function() {
		if (!this.node.parent || this.node.parent.children.length < 2) {
			return false;
		}
		if (this.node.parent.children[this.node.parent.children.length - 1] === this.node) {
			return this.set_node(this.node.parent.children[0]);
		}
		for (let i = 0; i < this.node.parent.children.length - 1; i++) {
			if (this.node.parent.children[i] === this.node) {
				return this.set_node(this.node.parent.children[i + 1]);
			}
		}
		return false;		// Can't get here.
	},

	return_to_main_line: function() {
		let node = this.node.return_to_main_line_helper();
		if (this.node === node) {
			return false;
		}
		this.node = node;
		this.dom_from_scratch();
		return true;
	},

	delete_node: function() {

		if (!this.node.parent) {
			this.delete_children();
			return false;
		}

		let parent = this.node.parent;
		this.node.detach();
		this.node = parent;
		this.tree_version++;
		this.dom_from_scratch();
		return true;
	},

	make_move: function(s) {

		// s must be exactly a legal move, including having promotion char iff needed (e.g. e2e1q)

		let next_node_id__initial = next_node_id;
		this.node = this.node.make_move(s);

		if (next_node_id !== next_node_id__initial) {		// NewNode() was called
			this.tree_version++;
		}

		this.dom_from_scratch();			// Could potentially call something else here.
		return true;
	},

	make_move_sequence: function(moves, set_this_node = true) {

		if (Array.isArray(moves) === false || moves.length === 0) {
			return false;
		}

		let next_node_id__initial = next_node_id;

		let node = this.node;
		for (let s of moves) {
			node = node.make_move(s);		// Calling the node's make_move() method, not handler's
		}

		if (set_this_node) {
			this.node = node;
		}

		if (next_node_id !== next_node_id__initial) {		// NewNode() was called
			this.tree_version++;
		}

		this.dom_from_scratch();
		return true;
	},

	add_move_sequence: function(moves) {
		return this.make_move_sequence(moves, false);
	},

	// -------------------------------------------------------------------------------------------------------------
	// The following methods don't ever change this.node - so the caller has no action to take. No return value.

	promote_to_main_line: function() {

		let node = this.node;
		let changed = false;

		while (node.parent) {
			if (node.parent.children[0] !== node) {
				for (let n = 1; n < node.parent.children.length; n++) {
					if (node.parent.children[n] === node) {
						node.parent.children[n] = node.parent.children[0];
						node.parent.children[0] = node;
						changed = true;
						break;
					}
				}
			}
			node = node.parent;
		}

		if (changed) {
			this.tree_version++;
			this.dom_from_scratch();
		}
	},

	promote: function() {

		let node = this.node;
		let changed = false;

		while (node.parent) {
			if (node.parent.children[0] !== node) {
				for (let n = 1; n < node.parent.children.length; n++) {
					if (node.parent.children[n] === node) {
						let swapper = node.parent.children[n - 1];
						node.parent.children[n - 1] = node;
						node.parent.children[n] = swapper;
						changed = true;
						break;
					}
				}
				break;		// 1 tree change only
			}
			node = node.parent;
		}

		if (changed) {
			this.tree_version++;
			this.dom_from_scratch();
		}
	},

	delete_other_lines: function() {

		this.promote_to_main_line();

		let changed = false;
		let node = this.root;

		while (node.children.length > 0) {
			for (let child of node.children.slice(1)) {
				child.detach();
				changed = true;
			}
			node = node.children[0];
		}

		if (changed) {
			this.tree_version++;
			this.dom_from_scratch();		// This may be the 2nd draw since promote_to_main_line() may have drawn. Bah.
		}
	},

	delete_children: function() {

		if (this.node.children.length > 0) {
			for (let child of this.node.children) {
				child.detach();
			}
			this.tree_version++;
			this.dom_from_scratch();
		}
	},

	delete_siblings: function() {

		let changed = false;

		if (this.node.parent) {
			for (let sibling of this.node.parent.children) {
				if (sibling !== this.node) {
					sibling.detach();
					changed = true;
				}
			}
		}

		if (changed) {
			this.tree_version++;
			this.dom_from_scratch();
		}
	},

	// -------------------------------------------------------------------------------------------------------------

	handle_click: function(event) {

		let n = EventPathN(event, "node_");
		if (typeof n !== "number") {
			return false;
		}

		let node = live_nodes[n.toString()];

		if (!node || node.destroyed) {		// Probably the check for .destroyed is unnecessary.
			return false;
		}

		return this.set_node(node);
	},
};

