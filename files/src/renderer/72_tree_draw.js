"use strict";

let tree_draw_props = {

	// Since we use Object.assign(), it's bad form to have any deep objects in the props.

	ordered_nodes_cache: null,
	ordered_nodes_cache_version: -1,

	dom_bold_bestmove_child: function(node) {
		let bestmove_move = node.table.bestmove_so_far;

		node.children.forEach( function(child_node) {
			let dom_child_node = document.getElementById(`node_${child_node.id}`);
			dom_child_node.style.fontWeight = (bestmove_move == child_node.move) ? 'bold' : 'normal';
		});
	},

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

		let dom_bestmove_fontweight_ids = [];
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

			if ((node.parent !== null) && (node.parent.table.bestmove_so_far !== null) && (node.parent.table.bestmove_so_far == node.move)) {
				dom_bestmove_fontweight_ids.push(node.id);
			}

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

		dom_bestmove_fontweight_ids.forEach( function(node_id) {
			document.getElementById(`node_${node_id}`).style.fontWeight = 'bold';
		});

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
