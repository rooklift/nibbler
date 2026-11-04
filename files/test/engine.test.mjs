import test from "node:test";
import assert from "node:assert/strict";
import { make_context, run } from "./harness.mjs";

function engine_send(ctx, setup) {
	return run(ctx, `
		(() => {
			let tree = ${setup};
			let eng = NewEngine({info_handler: {engine_cycle: 0, engine_subcycle: 0}});
			let sent = [];
			eng.send = (msg) => sent.push(msg);
			eng.search_desired = {node: tree.get_end(), limit: 1, limit_by_time: false, searchmoves: null};
			eng.send_desired();
			return sent;
		})()
	`);
}

test("engine slices at the last null move in the middle of the game", () => {
	const ctx = make_context();
	const sent = engine_send(ctx, `
		(() => {
			let root = NewRoot();
			let e4 = root.make_move("e2e4");
			let n = e4.make_move("0000");
			n.make_move("d2d4");
			return root;
		})()
	`);
	assert.match(sent[0], /^position fen .* w .* moves d2d4$/);
});

test("engine sends no moves for a terminal null", () => {
	const ctx = make_context();
	const sent = engine_send(ctx, `
		(() => {
			let root = NewRoot();
			root.make_move("e2e4").make_move("0000");
			return root;
		})()
	`);
	assert.match(sent[0], /^position fen /);
	assert.doesNotMatch(sent[0], / moves /);
});

test("engine slices when null move is at the beginning", () => {
	const ctx = make_context();
	const sent = engine_send(ctx, `
		(() => {
			let root = NewRoot();
			root.make_move("0000").make_move("e7e5");
			return root;
		})()
	`);
	assert.match(sent[0], /^position fen .* b .* moves e7e5$/);
});

test("engine sends startpos without nulls", () => {
	const ctx = make_context();
	const sent = engine_send(ctx, `
		(() => {
			let root = NewRoot();
			root.make_move("e2e4");
			return root;
		})()
	`);
	assert.equal(sent[0], "position startpos moves e2e4");
});

test("engine keeps Chess960 castling notation", () => {
	const ctx = make_context();
	const sent = run(ctx, `
		(() => {
			let root = NewRoot(LoadFEN("rk5r/pppppppp/8/8/8/8/PPPPPPPP/RK5R w AHah - 0 1"));
			root.make_move("b1c1");
			let eng = NewEngine({info_handler: {engine_cycle: 0, engine_subcycle: 0}});
			eng.sent_options["uci_chess960"] = "true";
			let sent = [];
			eng.send = (msg) => sent.push(msg);
			eng.search_desired = {node: root.get_end(), limit: 1, limit_by_time: false, searchmoves: null};
			eng.send_desired();
			return sent[0];
		})()
	`);
	assert.match(sent, /^position fen rk5r\/pppppppp\/8\/8\/8\/8\/PPPPPPPP\/RK5R w AHah - 0 1 moves b1c1$/);
});
