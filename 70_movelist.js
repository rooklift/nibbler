"use strict";

// In an ideal world, the inherent tree structure in the Chess record and the
// inherent tree structure in the DOM would relate to each other in such a way
// that inserting a new move, or highlighting a new node, etc, would have an
// obviously corresponding set of operations that had to occur in the DOM. Hmm.

/*

function NewMovelistHander() {

	// Note that this stores almost no info about the tree. It's its own
	// object for cleanliness purposes rather than because it has some
	// huge amount of state to store.
	//
	// Only one of these objects is ever made.

	let handler = Object.create(null);

	handler.connections = null;
	handler.connections_version = null;
	handler.line_end = null;

	handler.draw = function(node) {

		// Note that the node passed as an argument is the currently displayed node.
		// This info is used to decide what to highlight.

		if (!node) {
			return;
		}

		let end = node.get_end();

		if (end === this.line_end && this.connections && this.connections_version === tree_version) {
			this.draw_lazy(node);
		} else {
			this.draw_hard(node);
		}

		fix_scrollbar_position();
	};

	handler.draw_lazy = function(node) {

		// The tree hasn't changed, nor has the end node of the displayed line. Therefore very little needs
		// to be done, except the highlight class needs to be applied to a different element. One thing this
		// fails to do is update stats drawn in the movelist.

		if (!node || !this.connections) {
			return;
		}

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
	};

	handler.draw_hard = function(node) {

		if (!node) {
			return;
		}

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

		if (!this.connections || this.connections_version !== tree_version) {
			this.connections = TokenNodeConnections(node);
			this.connections_version = tree_version;
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
	};

	handler.redraw_node = function(node) {

		// For when some node in the tree has had its stats changed and we want to redraw just it.

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
					break;
				}
			}
		}
	};

	handler.node_from_click = function(event) {

		let n = EventPathN(event, "movelist_");
		if (typeof n !== "number") {
			return null;
		}

		if (!this.connections || n < 0 || n >= this.connections.length) {
			return null;
		}

		let node = this.connections.nodes[n];

		if (!node || node.destroyed) {		// Probably the check for .destroyed is unnecessary.
			return null;
		}

		return node;
	};
	
	return handler;
}

*/
