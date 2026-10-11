"use strict";

const assert = require("assert");
const {build_movelist_context_menu_state} = require("./movelist_context_menu");

function make_node(parent = null, main_line = true) {
	let node = {
		parent,
		children: [],
		__main_line: main_line,
		return_target: null,
		is_main_line: function() {
			return this.__main_line;
		},
		return_to_main_line_helper: function() {
			return this.return_target || this;
		},
		get_root: function() {
			let node = this;
			while (node.parent) {
				node = node.parent;
			}
			return node;
		},
	};
	if (parent) {
		parent.children.push(node);
	}
	return node;
}

function test_root_without_variations() {
	let root = make_node();
	let state = build_movelist_context_menu_state(root);
	assert.deepStrictEqual(state, {
		can_return_to_main_line: false,
		can_promote_to_main_line: false,
		can_promote: false,
		can_delete_node: false,
		can_delete_children: false,
		can_delete_siblings: false,
		can_delete_other_lines: false,
		can_edit_node: false,
	});
}

function test_side_line_node_enables_variant_actions() {
	let root = make_node();
	let main_child = make_node(root, true);
	let side_child = make_node(root, false);
	side_child.return_target = root;
	let state = build_movelist_context_menu_state(side_child);
	assert.strictEqual(state.can_return_to_main_line, true);
	assert.strictEqual(state.can_promote_to_main_line, true);
	assert.strictEqual(state.can_promote, true);
	assert.strictEqual(state.can_delete_node, true);
	assert.strictEqual(state.can_delete_children, false);
	assert.strictEqual(state.can_delete_siblings, true);
	assert.strictEqual(state.can_delete_other_lines, true);
	assert.ok(main_child);
}

function test_main_line_variations_enable_delete_other_lines() {
	let root = make_node();
	let main_child = make_node(root, true);
	make_node(root, false);
	let state = build_movelist_context_menu_state(main_child);
	assert.strictEqual(state.can_return_to_main_line, false);
	assert.strictEqual(state.can_promote_to_main_line, false);
	assert.strictEqual(state.can_promote, false);
	assert.strictEqual(state.can_delete_node, true);
	assert.strictEqual(state.can_delete_children, false);
	assert.strictEqual(state.can_delete_siblings, true);
	assert.strictEqual(state.can_delete_other_lines, true);
	assert.ok(main_child);
}

function test_children_enable_delete_children() {
	let root = make_node();
	let child = make_node(root, true);
	make_node(child, true);
	let state = build_movelist_context_menu_state(child);
	assert.strictEqual(state.can_delete_children, true);
	assert.strictEqual(state.can_delete_other_lines, false);
	assert.strictEqual(state.can_delete_siblings, false);
	assert.strictEqual(state.can_delete_node, true);
	assert.strictEqual(state.can_promote, false);
	}

test_root_without_variations();
test_side_line_node_enables_variant_actions();
test_main_line_variations_enable_delete_other_lines();
test_children_enable_delete_children();
