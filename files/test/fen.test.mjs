import test from "node:test";
import assert from "node:assert/strict";
import { make_context, run } from "./harness.mjs";

test("fen(true) converts castling to KQkq in normal chess", () => {
	const ctx = make_context();
	const normal = run(ctx, `LoadFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1").fen(true)`);
	assert.match(normal, / KQkq /);
});

test("fen(true) preserves AHah castling notation in Chess960", () => {
	const ctx = make_context();
	const chess960 = run(ctx, `LoadFEN("rk5r/pppppppp/8/8/8/8/PPPPPPPP/RK5R w AHah - 0 1").fen(true)`);
	assert.match(chess960, / AHah /);
});
