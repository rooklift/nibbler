"use strict";

// New in 1.2.6 - replaces movelist.js
//
// The point is that updating the node should trigger an immediate redraw. The caller doesn't need
// to care about redrawing. Ideally, this object should be able to make good decisions about how
// to best redraw.
//
// WIP / intentions:
//
// - All nodes findable in the DOM by unique span id corresponding to their id.
// - When adding a node, insert its text straight into the DOM.
// - When switching node, simply set the classes of all relevant nodes.
// - Use CSS like ::before and ::after
// - https://www.designcise.com/web/tutorial/how-to-add-space-before-or-after-an-element-using-css-pseudo-elements

function NewTreeHandler() {

	let handler = Object.create(null);

	handler.root = NewTree();
	handler.node = handler.root;
	handler.tree_version = 0;				// Must increment every time the tree structure changes.

	// Return values of the methods are whether this.node changed -
	// i.e. whether the renderer has to call position_changed()
	//
	// We need to draw if either:
	//    - node changed
	//    - tree changed

	handler.new_root_from_board = function(board) {
		DestroyTree(this.root);
		this.root = NewTree(board);
		this.node = this.root;
		this.tree_version++;
		this.dom_from_scratch();
		return true;
	};

	handler.replace_tree = function(root) {
		DestroyTree(this.root);
		this.root = root;
		this.node = this.root;
		this.tree_version++;
		this.dom_from_scratch();
		return true;
	};

	handler.set_node = function(node) {									// node must be in the same tree, or this does nothing
		if (node.get_root() === this.root && node !== this.node) {
			this.node = node;
			this.dom_from_scratch();
			return true;
		}
		return false;
	};

	handler.prev = function() {
		if (this.node.parent) {
			this.node = this.node.parent;
			this.dom_from_scratch();
			return true;
		}
		return false;
	};

	handler.next = function() {
		if (this.node.children.length > 0) {
			this.node = this.node.children[0];
			this.dom_from_scratch();
			return true;
		}
		return false;
	};

	handler.goto_root = function() {
		if (this.node !== this.root) {
			this.node = this.root;
			this.dom_from_scratch();
			return true;
		}
		return false;
	};

	handler.goto_end = function() {
		let end = this.node.get_end();
		if (this.node !== end) {
			this.node = end;
			this.dom_from_scratch();
			return true;
		}
		return false;
	};

	handler.return_to_main_line = function() {

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

		if (this.node !== node) {
			this.node = node;
			this.dom_from_scratch();
			return true;
		}
		return false;
	};

	handler.delete_node = function() {

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
	};

	handler.make_move = function(s, force_new_node, suppress_draw) {

		// s must be exactly a legal move, including having promotion char iff needed (e.g. e2e1q)

		let node = null;
		let extend_flag = false;

		if (!force_new_node) {
			for (let child of this.node.children) {
				if (child.move === s) {
					node = child;
					break;
				}
			}
		}

		if (!node) {
			node = NewNode(this.node, s);
			if (this.node.children.length === 0 && this.node !== this.root) {
				extend_flag = true;			// The new node is the simplest case of extending a line.
			}
			this.node.children.push(node);
		}

		this.node = node;
		this.tree_version++;
		if (!suppress_draw) {
			this.dom_from_scratch();					// Could potentially call something else here.
		}
		return true;
	};

	handler.make_move_sequence = function(moves) {

		if (Array.isArray(moves) === false || moves.length === 0) {
			return false;
		}

		for (let s of moves) {
			this.make_move(s, false, true);
		}

		this.tree_version++;				// Redundant, but future bug-proof
		this.dom_from_scratch();
		return true;
	};

	// -------------------------------------------------------------------------------------------------------------
	// The following methods don't ever change this.node - so the caller has no action to take. All return false.

	handler.promote_to_main_line = function() {

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

		return false;						// this.node never changes here. Caller takes no action.
	};

	handler.delete_other_lines = function() {

		let changed = this.promote_to_main_line();
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
			this.dom_from_scratch();
		}

		return false;						// this.node never changes here. Caller takes no action.
	};

	handler.delete_children = function() {

		if (this.node.children.length > 0) {
			for (let child of this.node.children) {
				child.detach();
			}
			this.tree_version++;
			this.dom_from_scratch();
		}

		return false;						// this.node never changes here. Caller takes no action.
	};

	handler.delete_siblings = function() {

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

		return false;						// this.node never changes here. Caller takes no action.
	};

	handler.add_move_sequence = function(moves) {

		if (Array.isArray(moves) === false || moves.length === 0) {
			return false;
		}

		let node = this.node;

		for (let s of moves) {
			node = node.make_move(s);		// Calling the node's make_move() method, not handler's
		}

		this.tree_version++;
		this.dom_from_scratch();
		return false;						// this.node never changes here. Caller takes no action.
	};

	// -------------------------------------------------------------------------------------------------------------

	handler.get_node_from_move = function(s) {

		for (let child of this.node.children) {
			if (child.move === s) {
				return child;
			}
		}

		throw `get_node_from_move("${s}") - not found`;
	};

	handler.handle_click = function(event) {

		let n = EventPathN(event, "node_");
		if (typeof n !== "number") {
			return false;
		}

		let node = __live_nodes[n.toString()];

		if (!node || node.destroyed) {		// Probably the check for .destroyed is unnecessary.
			return false;
		}

		return this.set_node(node);
	};

	// -------------------------------------------------------------------------------------------------------------

	handler.dom_from_scratch = function() {

		// Some prep-work (we need to undo all this at the end)...

		let line_end = this.node.get_end();

		let foo = line_end;
		while (foo) {
			foo.current_line = true;	// These nodes will be coloured white, others gray
			foo = foo.parent;
		}

		let main_line_end = this.root.get_end();
		main_line_end.main_line_end = true;

		// ---

		let ordered_nodes = [];
		order_nodes(this.root, ordered_nodes, false);

		let pseudoelements = [];		// Objects containing class, id, and text

		for (let node of ordered_nodes) {

			let classes = [];

			if (node === this.node) {
				if (node.is_main_line()) {
					classes.push("movelist_highlight_blue");
				} else {
					classes.push("movelist_highlight_yellow");
				}
			}

			if (node.parent && node.parent.children[0] !== node) {
				classes.push("var_start");
			}

			if (node.children.length === 0 && !node.main_line_end) {
				classes.push("var_end");
			} else {
				classes.push("not_end");
			}

			if (node.current_line) {
				classes.push("white");
			} else {
				classes.push("gray");
			}

			pseudoelements.push({
				class: classes.join(" "), id: `node_${node.id}`, text: node.token()
			});
		}

		let texts = [];

		for (let p of pseudoelements) {
			texts.push(`<span class="${p.class}" id="${p.id}">${p.text}</span>`);
		}

		movelist.innerHTML = texts.join("");

		// Undo the damage to our tree from the start...

		foo = line_end;
		while(foo) {
			delete foo.current_line;
			foo = foo.parent;
		}

		delete main_line_end.main_line_end;

	};

	return handler;
}



dom_insert_node = function(node) {
	// Insert the node. Examine it and decide where it should be in the order.
};

dom_change_highlight = function(old_highlight_node, new_highlight_node) {
	// If one is an ancestor of the other, the idea should be to change gray / white on the nodes between them.
	// Otherwise, the idea should be to find the common ancestor, and change gray / white on both paths.
};

dom_advance_highlight = function(old_highlight_node) {
	// Advance the highlight one node further on.
};

dom_retreat_highlight = function(old_highlight_node) {
	// Retreat the highlight one node back. Hard(ish) case is when it was at the start of a variation before it moved.
};

dom_redraw_node = function(node) {
	// Given a node, redraw it.
};
