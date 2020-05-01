"use strict";

// New in 1.2.6 - replaces movelist.js
//
// The point is that updating the node should trigger an immediate redraw. The caller doesn't need
// to care about redrawing. Ideally, this object should be able to make good decisions about how
// to best redraw.

let draw_hard_count = 0;
let draw_lazy_count = 0;
let connections_build_count = 0;

function NewTreeHandler() {

	let handler = Object.create(null);

	handler.root = NewTree();
	handler.node = handler.root;
	handler.tree_version = 0;				// Must increment every time the tree structure changes.

	handler.connections = null;
	handler.connections_version = null;
	handler.line_end = null;

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
		this.draw();
		return true;
	};

	handler.replace_tree = function(root) {
		DestroyTree(this.root);
		this.root = root;
		this.node = this.root;
		this.tree_version++;
		this.draw();
		return true;
	};

	handler.set_node = function(node) {									// node must be in the same tree, or this does nothing
		if (node.get_root() === this.root && node !== this.node) {
			this.node = node;
			this.draw();
			return true;
		}
		return false;
	};

	handler.prev = function() {
		if (this.node.parent) {
			this.node = this.node.parent;
			this.draw();
			return true;
		}
		return false;
	};

	handler.next = function() {
		if (this.node.children.length > 0) {
			this.node = this.node.children[0];
			this.draw();
			return true;
		}
		return false;
	};

	handler.goto_root = function() {
		if (this.node !== this.root) {
			this.node = this.root;
			this.draw();
			return true;
		}
		return false;
	};

	handler.goto_end = function() {
		let end = this.node.get_end();
		if (this.node !== end) {
			this.node = end;
			this.draw();
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
			this.draw();
			return true;
		}
		return false;
	};

	handler.delete_node = function() {

		if (!this.node.parent) {
			return this.delete_children();	// Will return false.
		}

		let parent = this.node.parent;
		this.node.detach();
		this.node = parent;
		this.tree_version++;
		this.draw();
		return true;
	};

	handler.make_move = function(s, force_new_node, suppress_draw) {

		// s must be exactly a legal move, including having promotion char iff needed (e.g. e2e1q)

		if (!force_new_node) {
			for (let child of this.node.children) {
				if (child.move === s) {
					this.node = child;
					if (!suppress_draw) {
						this.draw();
					}
					return true;
				}
			}
		}

		let new_node = NewNode(this.node, s);
		this.node.children.push(new_node);

		this.node = new_node;
		this.tree_version++;
		if (!suppress_draw) {
			this.draw();					// Could potentially call something else here.
		}
		return true;
	};

	handler.make_move_sequence = function(moves) {

		for (let s of moves) {
			this.make_move(s, false, true);
		}

		this.tree_version++;				// Redundant, but future bug-proof
		this.draw();
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
			this.draw();
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
			this.draw();
		}

		return false;						// this.node never changes here. Caller takes no action.
	};

	handler.delete_children = function() {

		if (this.node.children.length > 0) {
			for (let child of this.node.children) {
				child.detach();
			}
			this.tree_version++;
			this.draw();
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
			this.draw();
		}

		return false;						// this.node never changes here. Caller takes no action.
	};

	handler.add_move_sequence = function(moves) {

		let node = this.node;

		for (let s of moves) {
			node = node.make_move(s);		// Calling the node's make_move() method, not handler's
		}

		this.tree_version++;
		this.draw();
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

		let n = EventPathN(event, "movelist_");
		if (typeof n !== "number") {
			return false;
		}

		if (!this.connections || n < 0 || n >= this.connections.length) {
			return false;
		}

		let node = this.connections.nodes[n];

		if (!node || node.destroyed) {		// Probably the check for .destroyed is unnecessary.
			return false;
		}

		return this.set_node(node);
	};

	// -------------------------------------------------------------------------------------------------------------

	handler.draw = function() {

		let end = this.node.get_end();

		if (end === this.line_end && this.connections && this.connections_version === this.tree_version) {
			this.draw_lazy();
		} else {
			this.draw_hard();
		}
	};

	handler.draw_hard = function() {

		draw_hard_count++;

		let node = this.node;

		// Flag nodes that are on the current line (including into the future).
		// We'll undo this damage to the tree in a bit.

		this.line_end = node.get_end();

		let foo = this.line_end;
		while (foo) {
			foo.current_line = true;
			foo = foo.parent;
		}

		// We'd also like to know if the current node is on the main line...

		let on_mainline = false;

		foo = node.get_root().get_end();
		while (foo) {
			if (foo === node) {
				on_mainline = true;
				break;
			}
			foo = foo.parent;
		}

		//

		if (!this.connections || this.connections_version !== this.tree_version) {
			connections_build_count++;
			this.connections = TokenNodeConnections(node);
			this.connections_version = this.tree_version;
		}

		let elements = [];		// Objects containing class and text.

		for (let n = 0; n < this.connections.length; n++) {

			// Each item in the connections must have a corresponding element
			// in our elements list. The indices must match.

			let s = this.connections.tokens[n];

			let next_s = this.connections.tokens[n + 1];		// possibly undefined
			let connode = this.connections.nodes[n];			// possibly null

			let space = (s === "(" || next_s === ")") ? "" : " ";

			let element = {
				text: `${s}${space}`
			};

			if (connode === node) {
				element.class = on_mainline ? "movelist_highlight_blue" : "movelist_highlight_yellow";
			} else if (connode && connode.current_line) {
				element.class = "white";
			} else {
				element.class = "gray";
			}

			elements.push(element);
		}

		// Generate the new innerHTML for the movelist <p></p>

		let new_inner_parts = [];

		for (let n = 0; n < elements.length; n++) {
			let part = `<span id="movelist_${n}" class="${elements[n].class}">${elements[n].text}</span>`;
			new_inner_parts.push(part);
		}

		movelist.innerHTML = new_inner_parts.join("");	// Setting innerHTML is performant. Direct DOM manipulation is worse, somehow.

		// Undo the damage to our tree...

		foo = this.line_end;
		while(foo) {
			delete foo.current_line;
			foo = foo.parent;
		}

		fix_scrollbar_position();
	};

	handler.draw_lazy = function() {

		// The tree hasn't changed, nor has the end node of the displayed line. Therefore very little needs
		// to be done, except the highlight class needs to be applied to a different element. One thing this
		// fails to do is update stats drawn in the movelist.

		draw_lazy_count++;

		if (!this.connections) {
			return;
		}

		let node = this.node;

		let span = get_movelist_highlight();
		let highlight_class = span ? span.className : "movelist_highlight_blue";	// If nothing was highlighted, old position was root.

		if (span) {
			span.className = "white";		// This is always correct, it's never gray.
		}

		// Find the n of the new highlight...

		let n = null;

		for (let i = 0; i < this.connections.length; i++) {
			if (this.connections.nodes[i] === node) {
				n = i;
				break;
			}
		}

		if (typeof n === "number") {
			let span = document.getElementById(`movelist_${n}`);
			span.className = highlight_class;
		}

		fix_scrollbar_position();
	};

	handler.redraw_node = function(node) {

		// Given a node, redraw it. Also update the relevant connections list token.

		if (!this.connections || !node) {
			return;
		}

		for (let n = 0; n < this.connections.length; n++) {
			if (this.connections.nodes[n] === node) {
				let span = document.getElementById(`movelist_${n}`);
				if (span) {
					let space = this.connections.tokens[n + 1] === ")" ? "" : " ";
					let text = `${node.token()}${space}`;
					span.innerHTML = text;
					this.connections.tokens[n] = node.token();
					break;
				}
			}
		}
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

function fix_scrollbar_position(node) {
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
