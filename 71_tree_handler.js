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

let easy_draws = 0;
let hard_draws = 0;

function NewTreeHandler() {

	let handler = Object.create(null);

	handler.tree_version = 0;		// Increment every time the tree structure changes.
	handler.root = NewRoot();
	handler.node = handler.root;
	
	// Where relevant, return values of the methods are whether this.node changed -
	// i.e. whether the renderer has to call position_changed()

	handler.replace_tree = function(root) {
		DestroyTree(this.root);
		this.root = root;
		this.node = this.root;
		this.tree_version++;
		this.dom_from_scratch();
		return true;
	};

	handler.new_root_from_board = function(board) {
		let root = NewRoot(board);
		this.replace_tree(root);
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
			let original_node = this.node;
			this.node = this.node.parent;
			if (original_node.is_same_line(this.node)) {
				this.dom_easy_highlight_change();
			} else {
				this.dom_from_scratch();
			}
			return true;
		}
		return false;
	};

	handler.next = function() {
		if (this.node.children.length > 0) {
			this.node = this.node.children[0];
			this.dom_easy_highlight_change();
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

	handler.make_move = function(s) {

		// s must be exactly a legal move, including having promotion char iff needed (e.g. e2e1q)

		let next_node_id__initial = next_node_id;
		this.node = this.node.make_move(s)

		if (next_node_id !== next_node_id__initial) {		// NewNode() was called
			this.tree_version++;
		}

		this.dom_from_scratch();			// Could potentially call something else here.
		return true;
	};

	handler.make_move_sequence = function(moves) {

		if (Array.isArray(moves) === false || moves.length === 0) {
			return false;
		}

		let next_node_id__initial = next_node_id;
		let node = this.node;

		for (let s of moves) {
			node = node.make_move(s);		// Calling the node's make_move() method, not handler's
		}

		if (next_node_id !== next_node_id__initial) {		// NewNode() was called
			this.tree_version++;
		}

		return this.set_node(node);
	};

	// -------------------------------------------------------------------------------------------------------------
	// The following methods don't ever change this.node - so the caller has no action to take. No return value.

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
	};

	handler.delete_children = function() {

		if (this.node.children.length > 0) {
			for (let child of this.node.children) {
				child.detach();
			}
			this.tree_version++;
			this.dom_from_scratch();
		}
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
	};

	handler.add_move_sequence = function(moves) {

		if (Array.isArray(moves) === false || moves.length === 0) {
			return;
		}

		let node = this.node;

		for (let s of moves) {
			node = node.make_move(s);		// Calling the node's make_move() method, not handler's
		}

		this.tree_version++;
		this.dom_from_scratch();
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

		let node = live_nodes[n.toString()];

		if (!node || node.destroyed) {		// Probably the check for .destroyed is unnecessary.
			return false;
		}

		return this.set_node(node);
	};

	// -------------------------------------------------------------------------------------------------------------

	handler.dom_easy_highlight_change = function() {

		// When the previously highlighted node and the newly highlighted node are on the same line.

		easy_draws++

		let old_highlight = get_movelist_highlight();
		let highlight_class;

		if (old_highlight && old_highlight.classList.contains("movelist_highlight_yellow")) {
			highlight_class = "movelist_highlight_yellow";
		} else {
			highlight_class = "movelist_highlight_blue";
		}

		if (old_highlight) {
			old_highlight.classList.remove("movelist_highlight_blue");
			old_highlight.classList.remove("movelist_highlight_yellow");
		}

		let node_element = document.getElementById(`node_${this.node.id}`);

		if (node_element) {
			node_element.classList.add(highlight_class);
		}

		fix_scrollbar_position();
	};

	handler.dom_from_scratch = function() {

		hard_draws++;

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
				classes.push("white");	// Otherwise, inherits gray colour from movelist CSS
			}

			pseudoelements.push({
				class: classes.join(" "),
				id: `node_${node.id}`,
				text: node.token()
			});
		}

		let all_spans = [];

		for (let p of pseudoelements) {
			all_spans.push(`<span class="${p.class}" id="${p.id}">${p.text}</span>`);
		}

		movelist.innerHTML = all_spans.join("");

		// Undo the damage to our tree from the start...

		foo = line_end;
		while(foo) {
			delete foo.current_line;
			foo = foo.parent;
		}

		delete main_line_end.main_line_end;

		// And finally...

		fix_scrollbar_position();
	};

	handler.dom_redraw_node = function(node) {

		let element = document.getElementById(`node_${node.id}`);

		if (!element) {
			return;
		}

		element.innerHTML = node.token();
	};

	return handler;
}

// Helpers...

function get_movelist_highlight() {
	let elements = document.getElementsByClassName("movelist_highlight_blue");
	if (elements && elements.length > 0) {
		return elements[0];
	}
	elements = document.getElementsByClassName("movelist_highlight_yellow");
	if (elements && elements.length > 0) {
		return elements[0];
	}
	return null;
}

function fix_scrollbar_position() {
	let highlight = get_movelist_highlight();
	if (highlight) {
		let top = highlight.offsetTop - movelist.offsetTop;
		if (top < movelist.scrollTop) {
			movelist.scrollTop = top;
		}
		let bottom = top + highlight.offsetHeight;
		if (bottom > movelist.scrollTop + movelist.offsetHeight) {
			movelist.scrollTop = bottom - movelist.offsetHeight;
		}
	} else {
		movelist.scrollTop = 0;
	}
}
