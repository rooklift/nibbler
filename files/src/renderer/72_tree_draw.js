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

		let dom_node = document.getElementById(`node_${this.node.id}`);

		if (dom_node) {
			dom_node.classList.add(highlight_class);
		}

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

	dom_update_underlines: function () {
		if (this.node === null) {
			return;
		}

		let dom_node = document.getElementById(`node_${this.node.id}`);

		if (dom_node === null) {
			return;
		}

		let eval_underline = this.underline_html_classlist;

		// When receiving a new eval for `this.node`, it may become an inaccuracy/mistake/blunder
		eval_underline(this.node, dom_node.classList);

		// When receiving an eval for `this.node`, the updated eval could cause the subsequent move(s) to become an inaccuracy/mistake/blunder
		this.node.children.forEach(function(adjacent_node) {
			if (adjacent_node) {
				let adjacent_dom_node = document.getElementById(`node_${adjacent_node.id}`);

				eval_underline(adjacent_node, adjacent_dom_node.classList);
			}
		});
	},

	// Helpers...

	underline_html_classlist: function (eval_node, dom_classlist) {
		let eval_node_cp = eval_node.table.get_cp();
		let eval_parentnode_cp = eval_node.parent.table.get_cp();
		if ( ((typeof eval_node_cp) == 'number') && ((typeof eval_parentnode_cp) == 'number') ) {
			if ((dom_classlist.length > 0) && (dom_classlist instanceof DOMTokenList)) {
				// NOTE: we don't need to `.remove` when `dom_classlist instanceof Array` because
				// dom_from_scratch is recreating elements from the ground up (they won't have classes we need to remove)
				dom_classlist.remove('underline-inaccuracy');
				dom_classlist.remove('underline-mistake');
				dom_classlist.remove('underline-blunder');
			}

			let clamped_eval_node_cp = Math.min(Math.max(eval_node_cp, -250), 250);
			let clamped_eval_parentnode_cp = Math.min(Math.max(eval_parentnode_cp, -250), 250);
			let clamped_delta_centipawns = Math.abs(clamped_eval_node_cp - clamped_eval_parentnode_cp);
			let eval_html_classname = null;
			// underline based on…
			//  ±300 centipawns or larger = blunder
			//  ±100 centipawns or larger = mistake
			//   ±50 centipawns or larger = inaccuracy
			// …within the stipulation that all evals larger than ±2.5 are to be considered virtually the same.
			if (((30000 < Math.abs(eval_parentnode_cp)) && (Math.abs(eval_node_cp) <= 250))  ||  ((30000 < Math.abs(eval_node_cp)) && (Math.abs(eval_parentnode_cp) <= 250))) {
				// Centipawns near 32000 are reported by Stockfish/Leela when forced mate is found, so if you go from forced mate -> unclear, or vice versa that's a blunder.
				eval_html_classname = 'underline-blunder;'
			} else if ((Math.abs(eval_node_cp) < 250) && (250 <= Math.abs(eval_parentnode_cp)) && (200 <= clamped_delta_centipawns)) {
				eval_html_classname = 'underline-blunder';
			} else if ((Math.abs(eval_parentnode_cp) < 250) && (250 <= Math.abs(eval_node_cp)) && (100 <= clamped_delta_centipawns)) {
				eval_html_classname = 'underline-blunder';
			} else if (300 <= clamped_delta_centipawns) {
				eval_html_classname = 'underline-blunder';
			} else if (100 <= clamped_delta_centipawns) {
				eval_html_classname = 'underline-mistake';
			} else if (50 <= clamped_delta_centipawns) {
				eval_html_classname = 'underline-inaccuracy';
			}

			if (eval_html_classname !== null) {
				if (dom_classlist instanceof Array) {
					// e.g. dom_from_scratch
					dom_classlist.push(eval_html_classname);
				} else if (dom_classlist instanceof DOMTokenList) {
					// e.g. dom_update_underlines
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
