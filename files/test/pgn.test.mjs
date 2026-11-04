import test from "node:test";
import assert from "node:assert/strict";
import { make_context, run } from "./harness.mjs";

function movetext(ctx, code) {
	return run(ctx, `
		(() => {
			let root = NewRoot();
			${code}
			return make_pgn_string(root.get_end()).split("\\n\\n")[1].trim();
		})()
	`);
}

function import_pgn(ctx, text) {
	return run(ctx, `
		(() => {
			let o = {tags: {}, movebufs: [Buffer.from(${JSON.stringify(text)})]};
			let root = LoadPGNRecord(o);
			return root.get_end().history().join(" ");
		})()
	`);
}

test("PGN import accepts 0000", () => {
	const ctx = make_context();
	assert.equal(import_pgn(ctx, "1. 0000 e5 *"), "0000 e7e5");
});

test("PGN import accepts --", () => {
	const ctx = make_context();
	assert.equal(import_pgn(ctx, "1. e4 -- 2. d4 *"), "e2e4 0000 d2d4");
});

test("PGN import accepts Z0", () => {
	const ctx = make_context();
	assert.equal(import_pgn(ctx, "1. Z0 e5 *"), "0000 e7e5");
});

test("PGN import accepts null", () => {
	const ctx = make_context();
	assert.equal(import_pgn(ctx, "1. null e5 *"), "0000 e7e5");
});

test("PGN import accepts <>", () => {
	const ctx = make_context();
	assert.equal(import_pgn(ctx, "1. <> e5 *"), "0000 e7e5");
});

test("PGN import cancels consecutive null moves back to the prior node", () => {
	const ctx = make_context();
	assert.equal(import_pgn(ctx, "1. -- -- *"), "");
	assert.equal(import_pgn(ctx, "1. -- -- e4 *"), "e2e4");
	assert.equal(import_pgn(ctx, "1. e4 -- -- e5 *"), "e2e4 e7e5");
});

test("PGN import rejects null move in check", () => {
	const ctx = make_context();
	assert.throws(() => import_pgn(ctx, "1. e4 f5 2. Qh5+ -- *"), /in check/i);
});

test("trailing terminal null move on main line is omitted", () => {
	const ctx = make_context();
	assert.equal(movetext(ctx, `
		root.make_move("e2e4").make_move("e7e5").make_move("0000");
	`), "1. e4 e5 *");
});

test("internal null move is preserved", () => {
	const ctx = make_context();
	assert.equal(movetext(ctx, `
		let a = root.make_move("e2e4");
		let n = a.make_move("0000");
		n.make_move("d2d4");
	`), "1. e4 -- 2. d4 *");
});

test("white initial null move followed by black move is preserved", () => {
	const ctx = make_context();
	assert.equal(movetext(ctx, `
		root.make_move("0000").make_move("e7e5");
	`), "1. -- e5 *");
});

test("a game consisting only of a null move is not emptied", () => {
	const ctx = make_context();
	assert.equal(movetext(ctx, `root.make_move("0000");`), "1. -- *");
});

test("terminal null variation is omitted", () => {
	const ctx = make_context();
	assert.equal(movetext(ctx, `
		root.make_move("e2e4");
		root.make_move("0000", true);
	`), "1. e4 *");
});

test("main-line null move with continuation and sibling variation stays main line", () => {
	const ctx = make_context();
	assert.equal(movetext(ctx, `
		let n = root.make_move("0000");
		n.make_move("e7e5");
		root.make_move("e2e4", true);
	`), "1. -- (1. e4) e5 *");
});

test("main-line terminal null move does not promote sibling variation to main line", () => {
	const ctx = make_context();
	assert.equal(movetext(ctx, `
		root.make_move("0000");
		root.make_move("e2e4", true);
	`), "1. -- (1. e4) *");
});

test("PGN round-trip preserves internal null moves", () => {
	const ctx = make_context();
	const pgn = movetext(ctx, `
		root.make_move("e2e4").make_move("0000").make_move("d2d4");
	`);
	assert.equal(import_pgn(ctx, pgn), "e2e4 0000 d2d4");
});
