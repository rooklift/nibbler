"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const src = path.join(__dirname, "../files/src");

function node(parent, move, id) {
	const result = {
		id,
		parent,
		children: [],
		move,
		annotation: null,
		comment_before: "",
		comment_after: "",
		user_arrows: [],
		user_highlights: [],
		token() { return move; },
		get_end() {
			let current = this;
			while (current.children.length) current = current.children[0];
			return current;
		},
		is_main_line() {
			let current = this;
			while (current.parent) {
				if (current.parent.children[0] !== current) return false;
				current = current.parent;
			}
			return true;
		},
	};
	if (parent) parent.children.push(result);
	return result;
}

function createTree() {
	const movelist = {innerHTML: ""};
	const context = vm.createContext({movelist, SafeStringHTML: s => s, SerializePgnGraphics: () => []});
	for (const filename of ["60_pgn_utils.js", "72_tree_draw.js"]) {
		vm.runInContext(fs.readFileSync(path.join(src, "renderer", filename), "utf8"), context, {filename});
	}
	const props = vm.runInContext("tree_draw_props", context);
	const root = node(null, "", 1);
	const e4 = node(root, "e4", 2);
	const d4 = node(root, "d4", 3);
	const e5 = node(e4, "e5", 4);
	const c5 = node(e4, "c5", 5);
	const d5 = node(d4, "d5", 6);
	const nf6 = node(d4, "Nf6", 7);
	const nf3 = node(c5, "Nf3", 8);
	const tree = Object.assign({}, props, {
		root,
		node: e5,
		tree_version: 1,
		fix_scrollbar_position() {},
	});
	const classes = current => {
		const match = movelist.innerHTML.match(new RegExp(`<span class="([^"]*)" id="node_${current.id}"`));
		assert.ok(match, `move ${current.move} missing from rendered list`);
		return match[1].split(" ");
	};
	return {tree, movelist, classes, e4, d4, e5, c5, d5, nf6, nf3};
}

test("only first moves of each alternative line have the variation-start class", () => {
	const {tree, classes, e4, d4, e5, c5, d5, nf6, nf3} = createTree();
	tree.dom_from_scratch();
	for (const start of [d4, c5, nf6]) {
		assert.ok(classes(start).includes("variation_start"), `expected branch marker on ${start.move}`);
	}
	for (const continuation of [e4, e5, d5, nf3]) {
		assert.ok(!classes(continuation).includes("variation_start"), `unexpected branch marker on ${continuation.move}`);
	}
});

test("selected moves and annotated moves retain their own highlight classes", () => {
	const {tree, classes, d4, c5} = createTree();
	tree.node = c5;
	d4.annotation = "!";
	tree.dom_from_scratch();
	assert.ok(classes(c5).includes("variation_start"));
	assert.ok(classes(c5).includes("movelist_highlight_yellow"));
	assert.ok(classes(d4).includes("variation_start"));
	assert.ok(classes(d4).includes("annotation_good"));

	const css = fs.readFileSync(path.join(src, "nibbler.css"), "utf8");
	assert.match(css, /span\.variation_start\s*\{[^}]*color:\s*#c9a5ff;/);
	assert.ok(css.indexOf("span.variation_start") < css.indexOf("span.movelist_highlight_yellow"));
	assert.ok(css.indexOf("span.variation_start") < css.indexOf("span.annotation_good"));
});

test("changing which line is main also changes which first move is marked", () => {
	const {tree, classes, e4, d4} = createTree();
	// Promote d4 to main line; e4 then becomes the variation.
	tree.root.children = [d4, e4];
	tree.tree_version++;
	tree.dom_from_scratch();
	assert.ok(!classes(d4).includes("variation_start"));
	assert.ok(classes(e4).includes("variation_start"));
});
