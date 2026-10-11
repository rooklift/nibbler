"use strict";

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
			let title_parts = [];
			// Only the first move of each alternative line marks a branch.
			// Its subsequent moves retain their normal main/variation styling.
			if (node.parent && node.parent.children[0] !== node) {
				classes.push("variation_start");
			}

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

			if (node.annotation) {
				switch (node.annotation) {
				case "!!":
				case "!":
					classes.push("annotation_good");
					break;
				case "!?":
				case "?!":
					classes.push("annotation_dubious");
					break;
				case "??":
				case "?":
					classes.push("annotation_bad");
					break;
				}
			}

			if (node.comment_before) {
				title_parts.push("Before: " + node.comment_before);
			}
			if (node.comment_after) {
				title_parts.push("After: " + node.comment_after);
			}
			if (Array.isArray(node.user_arrows) && node.user_arrows.length > 0 || Array.isArray(node.user_highlights) && node.user_highlights.length > 0) {
				title_parts.push(SerializePgnGraphics(node.user_arrows, node.user_highlights).join(" "));
			}

			let text = node.token();
			if (node.comment_before) {
				text = this.comment_preview_html(node.comment_before) + " " + text;
			}
			if (node.comment_after) {
				text += " " + this.comment_preview_html(node.comment_after);
			}

			pseudoelements.push({
				opener: `<span class="${classes.join(" ")}" id="node_${node.id}"${title_parts.length > 0 ? ` title="${SafeStringHTML(title_parts.join("\n"))}"` : ""}>`,
				text: text,
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

	comment_preview_html: function(comment) {
		let preview = comment.replace(/\s+/g, " ").trim();
		if (preview.length > 48) {
			preview = preview.substr(0, 45) + "...";
		}
		return `<span class="comment_preview">{${SafeStringHTML(preview)}}</span>`;
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
