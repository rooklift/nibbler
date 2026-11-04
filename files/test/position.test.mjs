import test from "node:test";
import assert from "node:assert/strict";
import { make_context, run } from "./harness.mjs";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

test("white null flips side, keeps fullmove 1, increments halfmove, clears ep", () => {
	const ctx = make_context();
	const p = run(ctx, `LoadFEN(${JSON.stringify(START)}).move("0000")`);
	assert.equal(p.active, "b");
	assert.equal(p.fullmove, 1);
	assert.equal(p.halfmove, 1);
	assert.equal(p.enpassant, null);
});

test("black null increments fullmove and flips the side to white", () => {
	const ctx = make_context();
	const p = run(ctx, `LoadFEN(${JSON.stringify(START)}).move("e2e4").move("0000")`);
	assert.equal(p.active, "w");
	assert.equal(p.fullmove, 2);
	assert.equal(p.halfmove, 1);
	assert.equal(p.enpassant, null);
});

test("null move preserves castling rights", () => {
	const ctx = make_context();
	const fen = run(ctx, `LoadFEN(${JSON.stringify(START)}).move("0000").fen(true)`);
	assert.equal(fen, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 1 1");
});

test("null move clears en passant target square", () => {
	const ctx = make_context();
	const fen = run(ctx, `LoadFEN("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1").move("0000").fen(true)`);
	assert.equal(fen, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2");
});

test("null move is rejected in check", () => {
	const ctx = make_context();
	const reason = run(ctx, `LoadFEN("4k3/8/8/8/1q6/8/8/4K3 w - - 0 1").illegal("0000")`);
	assert.match(reason, /in check/);
});

test("null move is rejected when opponent is in check", () => {
	const ctx = make_context();
	const reason = run(ctx, `
		(() => {
			let p = LoadFEN("4k3/8/8/8/1q6/8/8/4K3 w - - 0 1");
			p.active = "b";
			return p.illegal("0000");
		})()
	`);
	assert.match(reason, /opponent king is in check/i);
});

test("null move is rejected when 50-move rule reached (halfmove >= 100)", () => {
	const ctx = make_context();
	const reason = run(ctx, `LoadFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 100 50").illegal("0000")`);
	assert.match(reason, /50-move/);
});

test("null move is allowed at halfmove 99", () => {
	const ctx = make_context();
	const reason = run(ctx, `LoadFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 99 50").illegal("0000")`);
	assert.equal(reason, "");
});

test("null move is rejected with insufficient material (KvK)", () => {
	const ctx = make_context();
	const reason = run(ctx, `LoadFEN("4k3/8/8/8/8/8/8/4K3 w - - 0 1").illegal("0000")`);
	assert.match(reason, /insufficient material/i);
});

test("null move is rejected in stalemate (no legal moves)", () => {
	const ctx = make_context();
	const reason = run(ctx, `LoadFEN("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1").illegal("0000")`);
	assert.match(reason, /no legal moves/i);
});

test("nice_string returns '--' for '0000'", () => {
	const ctx = make_context();
	const s = run(ctx, `LoadFEN(${JSON.stringify(START)}).nice_string("0000")`);
	assert.equal(s, "--");
});
