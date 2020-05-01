"use strict";

// Experimental WIP
// Should replace movelist.js ultimately

function NewTreeHandler() {

	let handler = Object.create(null);

	handler.root = NewTree();
	handler.node = handler.root;

}
