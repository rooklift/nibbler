import test from "node:test";
import assert from "node:assert/strict";
import { make_context, run } from "./harness.mjs";

const SETUP = `
	let t = NewTreeHandler();
	t.dom_from_scratch = () => {};
	t.dom_easy_highlight_change = () => {};
`;

test("playing a real move detaches an empty null leaf", () => {
	const ctx = make_context();
	const result = run(ctx, `
		(() => {
			${SETUP}
			let e4 = t.root.make_move("e2e4");
			e4.make_move("0000");
			t.node = e4;
			t.make_move("e7e5");
			return e4.children.map(c => c.move);
		})()
	`);
	assert.deepEqual(JSON.parse(JSON.stringify(result)), ["e7e5"]);
});

test("playing a real move preserves a null branch that has children", () => {
	const ctx = make_context();
	const result = run(ctx, `
		(() => {
			${SETUP}
			let e4 = t.root.make_move("e2e4");
			let n = e4.make_move("0000");
			n.make_move("d2d4");
			t.node = e4;
			t.make_move("e7e5");
			return e4.children.map(c => c.move);
		})()
	`);
	assert.deepEqual(JSON.parse(JSON.stringify(result)), ["0000", "e7e5"]);
});

test("make_move('0000') twice returns the same node without duplicating children", () => {
	const ctx = make_context();
	const result = run(ctx, `
		(() => {
			${SETUP}
			let e4 = t.root.make_move("e2e4");
			let n1 = e4.make_move("0000");
			let n2 = e4.make_move("0000");
			return [n1 === n2, e4.children.length];
		})()
	`);
	assert.deepEqual(JSON.parse(JSON.stringify(result)), [true, 1]);
});

test("make_move bumps tree_version when pruning an empty null leaf for an existing real move", () => {
	const ctx = make_context();
	const result = run(ctx, `
		(() => {
			${SETUP}
			let e4 = t.root.make_move("e2e4");
			e4.make_move("e7e5");
			e4.make_move("0000");
			t.node = e4;
			let before = t.tree_version;
			t.make_move("e7e5");
			return [t.tree_version - before, e4.children.map(c => c.move)];
		})()
	`);
	assert.deepEqual(JSON.parse(JSON.stringify(result)), [1, ["e7e5"]]);
});

test("make_move_sequence bumps tree_version when a later step prunes a null", () => {
	const ctx = make_context();
	const result = run(ctx, `
		(() => {
			${SETUP}
			let e4 = t.root.make_move("e2e4");
			e4.make_move("e7e5");
			e4.make_move("0000");
			t.node = t.root;
			let before = t.tree_version;
			t.make_move_sequence(["e2e4", "e7e5"]);
			return [t.tree_version - before, e4.children.map(c => c.move)];
		})()
	`);
	assert.deepEqual(JSON.parse(JSON.stringify(result)), [1, ["e7e5"]]);
});

test("consecutive null move on an empty null leaf detaches it and returns to parent", () => {
	const ctx = make_context();
	const result = run(ctx, `
		(() => {
			${SETUP}
			let e4 = t.root.make_move("e2e4");
			t.node = e4;
			t.make_move("0000");
			let before = t.tree_version;
			t.make_move("0000");
			return [t.node === e4, e4.children.length, t.tree_version - before];
		})()
	`);
	assert.deepEqual(JSON.parse(JSON.stringify(result)), [true, 0, 1]);
});

test("consecutive null move on a null node with children returns to parent without detaching", () => {
	const ctx = make_context();
	const result = run(ctx, `
		(() => {
			${SETUP}
			let e4 = t.root.make_move("e2e4");
			let n = e4.make_move("0000");
			n.make_move("d2d4");
			t.node = n;
			let before = t.tree_version;
			t.make_move("0000");
			return [t.node === e4, e4.children.map(c => c.move), t.tree_version - before];
		})()
	`);
	assert.deepEqual(JSON.parse(JSON.stringify(result)), [true, ["0000"], 0]);
});
