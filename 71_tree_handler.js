"use strict";

// New in 1.2.6 - replaces movelist.js
//
// The point is that updating the node should trigger an immediate redraw. The caller doesn't need
// to care about redrawing. Ideally, this object should be able to make good decisions about how
// to best redraw.
//
// Intentions / desires / hopes / dreams:
//
// - When adding a node, insert its text straight into the DOM.
// - When switching node, simply set the classes of all relevant nodes.
//
// One thing I've noticed, in some cases Electron 5 seems way faster than 8.

function NewTreeHandler() {
	let handler = Object.create(null);
	Object.assign(handler, tree_manipulation_props);
	Object.assign(handler, tree_draw_props);
	handler.root = NewRoot();
	handler.node = handler.root;
	return handler;
}

let tree_manipulation_props = {

	// Since we use Object.assign(), it's bad form to have any deep objects in the props.

	tree_version: 0,		// Increment every time the tree structure changes.
	root: null,
	node: null,
	
	// Where relevant, return values of the methods are whether this.node changed -
	// i.e. whether the renderer has to call position_changed()

	replace_tree: function(root) {
		DestroyTree(this.root);
		this.root = root;
		this.node = root;
		this.tree_version++;
		this.dom_from_scratch();
		return true;
	},

	set_node: function(node) {

		// The node must be in the same tree, or this does nothing. Note also that we may call
		// dom_easy_highlight_change() so don't rely on this to draw any nodes that never got drawn.

		if (node.get_root() !== this.root || node === this.node) {
			return false;
		}

		let original_node = this.node;
		this.node = node;

		if (original_node.is_same_line(this.node)) {
			this.dom_easy_highlight_change();
		} else {
			this.dom_from_scratch();
		}

		return true;
	},

	prev: function() {

		if (!this.node.parent) {
			return false;
		}

		let original_node = this.node;
		this.node = this.node.parent;

		if (original_node.is_same_line(this.node)) {
			this.dom_easy_highlight_change();
		} else {
			this.dom_from_scratch();
		}

		return true;
	},

	next: function() {

		if (this.node.children.length === 0) {
			return false;
		}

		this.node = this.node.children[0];
		this.dom_easy_highlight_change();
		return true;
	},

	goto_root: function() {

		if (this.node === this.root) {
			return false;
		}

		let original_node = this.node;
		this.node = this.root;

		if (original_node.is_main_line()) {
			this.dom_easy_highlight_change();		// OK because no gray / white changes needed.
		} else {
			this.dom_from_scratch();
		}

		return true;
	},

	goto_end: function() {

		let end = this.node.get_end();

		if (this.node === end) {
			return false;
		}

		this.node = end;
		this.dom_easy_highlight_change();
		return true;
	},

	return_to_main_line: function() {

		let main_line = this.root.future_history();
		let history = this.node.history();

		let node = this.root;

		for (let n = 0; n < history.length; n++) {
			if (main_line[n] !== history[n]) {
				break;
			}
			if (node.children.length === 0) {
				break;
			}
			node = node.children[0];
		}

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
		this.node = this.node.make_move(s)

		if (next_node_id !== next_node_id__initial) {		// NewNode() was called
			this.tree_version++;
		}

		this.dom_from_scratch();			// Could potentially call something else here.
		return true;
	},

	make_move_sequence: function(moves) {

		if (Array.isArray(moves) === false || moves.length === 0) {
			return false;
		}

		let next_node_id__initial = next_node_id;

		let node = this.node;
		for (let s of moves) {
			node = node.make_move(s);		// Calling the node's make_move() method, not handler's
		}
		this.node = node;

		if (next_node_id !== next_node_id__initial) {		// NewNode() was called
			this.tree_version++;
		}

		this.dom_from_scratch();
		return true;
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
						break;
					}
				}
				changed = true;
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
			if (node.children.length > 1) {
				node.children = node.children.slice(0, 1);
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

	add_move_sequence: function(moves) {

		if (Array.isArray(moves) === false || moves.length === 0) {
			return;
		}

		let node = this.node;

		for (let s of moves) {
			node = node.make_move(s);		// Calling the node's make_move() method, not handler's
		}

		this.tree_version++;
		this.dom_from_scratch();
	},

	// -------------------------------------------------------------------------------------------------------------

	get_node_from_move: function(s) {

		for (let child of this.node.children) {
			if (child.move === s) {
				return child;
			}
		}

		throw `get_node_from_move("${s}") - not found`;
	},

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

