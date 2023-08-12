"use strict";

// This file implements drawing the `movelist` element.

let tree_draw_props = {

	// Since we use Object.assign(), it's bad form to have any deep objects in the props.

	ordered_nodes_cache: null,
	ordered_nodes_cache_version: -1,

	dom_easy_highlight_change: function() {

		// When the previously highlighted node and the newly highlighted node are on the same line,
		// with the same end-of-line, meaning no gray / white changes are needed.

		let dom_highlight = this.get_movelist_highlight();
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

		let eval_underline = this.underline_html_classlist;

		let dom_node = document.getElementById(`node_${this.node.id}`);

		if (dom_node) {
			dom_node.classList.add(highlight_class);

			// When leaving a node, the updated eval left behind may cause it to become an inaccuracy/mistake/blunder
			eval_underline(this.node, dom_node.classList);
		}

		// When leaving a node, the updated eval left behind may cause the move afterward to become an inaccuracy/mistake/blunder
		this.node.children.forEach(function(adjacent_node) {
			if (adjacent_node) {
				let adjacent_dom_node = document.getElementById(`node_${adjacent_node.id}`);

				eval_underline(adjacent_node, adjacent_dom_node.classList);
			}
		});

		this.fix_scrollbar_position();
	},

	dom_from_scratch: function() {

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

		let pseudoelements = [];		// Objects containing opening span string `<span foo>` and text string

		for (let item of this.ordered_nodes_cache) {

			if (item === this.root) {
				continue;
			}

			// As a crude hack, the item can be a bracket string.
			// Deal with that first...

			if (typeof item === "string") {
				pseudoelements.push({
					opener: "",
					text: item,
					closer: ""
				});
				continue;
			}

			// So item is a real node...

			let node = item;
			let classes = [];

			if (node === this.node) {
				if (node.is_main_line()) {
					classes.push("movelist_highlight_blue");
				} else {
					classes.push("movelist_highlight_yellow");
				}
			}

			if (node.current_line) {
				classes.push("white");		// Otherwise, inherits gray colour from movelist CSS
			}

			this.underline_html_classlist(node, classes);

			pseudoelements.push({
				opener: `<span class="${classes.join(" ")}" id="node_${node.id}">`,
				text: node.token(),
				closer: `</span>`
			});
		}

		let all_spans = [];

		for (let n = 0; n < pseudoelements.length; n++) {

			let p = pseudoelements[n];
			let nextp = pseudoelements[n + 1];		// Possibly undefined

			if (!nextp || (p.text !== "(" && nextp.text !== ")")) {
				p.text += " ";
			}

			all_spans.push(`${p.opener}${p.text}${p.closer}`);
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

		this.fix_scrollbar_position();
	},

	// Helpers...

	underline_html_classlist: function (eval_node, dom_classlist) {
		if ((eval_node.parent.table.eval !== null) && (eval_node.table.eval !== null)) {
			dom_classlist.remove('underline-inaccuracy');
			dom_classlist.remove('underline-mistake');
			dom_classlist.remove('underline-blunder');

			// underline based on:
			// inaccuracy: 0.1 <= change in win percentage < 0.2
			// mistake: 0.2 <= change in win percentage < 0.3
			// blunder: 0.3 <= change in win percentage
			let delta_eval = Math.abs(eval_node.table.eval - eval_node.parent.table.eval);

			let eval_html_classname = null;
			if (0.3 <= delta_eval) {
				eval_html_classname = 'underline-blunder';
			} else if (0.2 <= delta_eval) {
				eval_html_classname = 'underline-mistake';
			} else if (0.1 <= delta_eval) {
				eval_html_classname = 'underline-inaccuracy';
			}

			if (eval_html_classname !== null) {
				if (dom_classlist instanceof Array) {
					// e.g. dom_from_scratch
					dom_classlist.push(eval_html_classname);
				} else if (dom_classlist instanceof DOMTokenList) {
					// e.g. dom_easy_highlight_change
					dom_classlist.add(eval_html_classname);
				}
			}
		}
	},

	get_movelist_highlight: function() {
		let elements = document.getElementsByClassName("movelist_highlight_blue");
		if (elements && elements.length > 0) {
			return elements[0];
		}
		elements = document.getElementsByClassName("movelist_highlight_yellow");
		if (elements && elements.length > 0) {
			return elements[0];
		}
		return null;
	},

	fix_scrollbar_position: function() {
		let highlight = this.get_movelist_highlight();
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
	},
};
