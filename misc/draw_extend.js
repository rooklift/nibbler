	handler.draw_extend = function() {

		// To be used when a single new node is simply added at a leaf which was already highlighted.

		draw_extend_count++;

		let parent = this.node.parent;

		if (!parent || this.node.children.length > 0) {
			throw "Bad draw_extend() - assumptions not met";
		}

		// So we want to insert the new node's text after the parent's

		let parent_span = get_movelist_highlight();

		if (!parent_span) {
			throw "Bad draw_extend() - normal assumptions met but parent_span not found";
		}

		// Everything is OK...

		let highlight_class = parent_span.className;
		parent_span.className = "white";
		if (parent_span.innerHTML.endsWith(" ") === false) {
			parent_span.innerHTML += " ";
		}
		parent_span.insertAdjacentHTML("afterend", `<span class="${highlight_class}">${this.node.token()} </span>`);

		// FIXME - the span should have an id.
		// FIXME - the connectors need something inserted into them.
		// FIXME - this.line_end needs set.
		// FIXME = this.connections_version needs set.

	};
