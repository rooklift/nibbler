"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const {build_movelist_context_menu_state} = require("../files/src/modules/movelist_context_menu");

const renderer = path.join(__dirname, "../files/src/renderer");
const context = vm.createContext({build_movelist_context_menu_state});

for (const file of ["71_tree_handler.js", "95_hub.js"]) {
	vm.runInContext(fs.readFileSync(path.join(renderer, file), "utf8"), context, {filename: file});
}

const {tree_manipulation_props, hub_props} = vm.runInContext("({tree_manipulation_props, hub_props})", context);

function makeNode(parent = null) {
	const node = {
		parent,
		children: [],
		get_root() {
			let current = this;
			while (current.parent) current = current.parent;
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
		return_to_main_line_helper() {
			let current = this;
			let target = this;
			while (current.parent) {
				if (current.parent.children[0] !== current) target = current.parent;
				current = current.parent;
			}
			return target;
		},
		detach() {
			if (!this.parent) return this;
			const parent = this.parent;
			parent.children = parent.children.filter(child => child !== this);
			this.parent = null;
			return parent;
		},
	};
	if (parent) parent.children.push(node);
	return node;
}

function makeHarness() {
	const root = makeNode();
	const tree = Object.assign({}, tree_manipulation_props, {
		root,
		node: root,
		tree_version: 0,
		draws: 0,
		dom_from_scratch() { this.draws++; },
	});
	const undo = [];
	const hub = {
		tree,
		undo_stack: {
			wrap(description, fn) {
				undo.push(description);
				fn();
			},
		},
	};
	hub.delete_other_lines = hub_props.delete_other_lines;
	return {root, tree, hub, undo};
}

test("deletes variations below a single root move, even from the main line", () => {
	const {root, tree, hub, undo} = makeHarness();
	const first = makeNode(root);
	const main = makeNode(first);
	const variation = makeNode(first);
	const mainNext = makeNode(main);
	const deeperVariation = makeNode(main);
	tree.node = main;

	assert.equal(root.children.length, 1);
	assert.equal(build_movelist_context_menu_state(main).can_delete_other_lines, true);
	hub.delete_other_lines();

	assert.deepEqual(first.children, [main]);
	assert.deepEqual(main.children, [mainNext]);
	assert.equal(variation.parent, null);
	assert.equal(deeperVariation.parent, null);
	assert.equal(tree.node, main);
	assert.equal(tree.tree_version, 1);
	assert.deepEqual(undo, ["Delete other lines"]);
});

test("promotes a selected side line, then deletes competing variations", () => {
	const {root, tree, hub, undo} = makeHarness();
	const first = makeNode(root);
	const oldMain = makeNode(first);
	const selected = makeNode(first);
	const continuation = makeNode(selected);
	tree.node = continuation;

	assert.equal(build_movelist_context_menu_state(continuation).can_delete_other_lines, true);
	hub.delete_other_lines();

	assert.deepEqual(first.children, [selected]);
	assert.deepEqual(selected.children, [continuation]);
	assert.equal(oldMain.parent, null);
	assert.equal(tree.node, continuation);
	assert.deepEqual(undo, ["Delete other lines"]);
});

test("keeps normal root-level variation deletion working", () => {
	const {root, tree, hub} = makeHarness();
	const main = makeNode(root);
	const side = makeNode(root);
	tree.node = main;
	hub.delete_other_lines();
	assert.deepEqual(root.children, [main]);
	assert.equal(side.parent, null);
});

test("does not create a spurious undo entry with no variations", () => {
	const {root, tree, hub, undo} = makeHarness();
	const main = makeNode(root);
	tree.node = main;
	hub.delete_other_lines();
	assert.deepEqual(undo, []);
	assert.equal(tree.tree_version, 0);
});
