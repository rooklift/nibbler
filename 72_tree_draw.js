"use strict";

let easy_draws = 0;
let hard_draws = 0;

let tree_draw_props = {

	ordered_nodes_cache: null,
	ordered_nodes_cache_version: -1,

	dom_easy_highlight_change: function() {

		// When the previously highlighted node and the newly highlighted node are on the same line,
		// with the same end-of-line, meaning no gray / white changes are needed.

		easy_draws++

		let dom_highlight = get_movelist_highlight();
		let highlight_class;

		if (dom_highlight && dom_highlight.classList.contains("movelist_highlight_yellow")) {
			highlight_class = "movelist_highlight_yellow";
		} else {
			highlight_class = "movelist_highlight_blue";
		}

		if (dom_highlight) {
			dom_highlight.classList.remove("movelist_highlight_blue");
			dom_highlight.classList.remove("movelist_highlight_yellow");
		}

		let dom_node = document.getElementById(`node_${this.node.id}`);

		if (dom_node) {
			dom_node.classList.add(highlight_class);
		}

		fix_scrollbar_position();
	},

	dom_from_scratch: function() {

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

		// Begin...

		if (this.ordered_nodes_cache_version !== this.tree_version) {
			this.ordered_nodes_cache = get_ordered_nodes(this.root);
			this.ordered_nodes_cache_version = this.tree_version;
		}

		let ordered_nodes = this.ordered_nodes_cache;

		let pseudoelements = [];		// Objects containing class, id, and text

		for (let node of ordered_nodes.slice(1)) {		// Slice to skip the root

			let classes = [];
			let text = node.token();

			if (node === this.node) {
				if (node.is_main_line()) {
					classes.push("movelist_highlight_blue");
				} else {
					classes.push("movelist_highlight_yellow");
				}
			}

			// The use of var_start / var_end / not_end can be avoided for now,
			// they seem slow (all have ::before or ::after content).

			if (node.parent && node.parent.children[0] !== node) {
				//classes.push("var_start");
				text = "(" + text;
			}

			if (node.children.length === 0 && !node.main_line_end) {
				//classes.push("var_end");
				text = text + ") ";
			} else {
				//classes.push("not_end");
				text = text + " ";
			}

			if (node.current_line) {
				classes.push("white");	// Otherwise, inherits gray colour from movelist CSS
			}

			pseudoelements.push({
				class: classes.join(" "),
				id: `node_${node.id}`,
				text: text
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
	},

	dom_redraw_node: function(node) {

		let element = document.getElementById(`node_${node.id}`);

		if (!element) {
			return;
		}

		let text = node.token();

		if (node.parent && node.parent.children[0] !== node) {
			text = "(" + text;
		}

		if (node.children.length === 0 && !node.is_main_line()) {
			text = text + ") ";
		} else {
			text = text + " ";
		}

		element.innerHTML = text;
	}
};

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
