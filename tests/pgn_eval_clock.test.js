"use strict";

// Tests for the [%eval] and [%clk] annotations in PGN: export from the analysis tables, import into them
// (so that the graph can be drawn without re-analysing), and the clock helpers. Loads the real renderer
// files, like position_annotations.test.js does.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const src = path.join(__dirname, "../files/src");
const position_annotations = require("../files/src/modules/position_annotations");

class FakeBoard {
	constructor(ply = 0) {
		this.ply = ply;
		this.active = ply % 2 === 0 ? "w" : "b";
	}
	move() { return new FakeBoard(this.ply + 1); }
	parse_pgn(move) { return [move, ""]; }
	nice_string(move) { return move; }
	next_number_string() { return Math.floor(this.ply / 2) + 1 + (this.active === "w" ? "." : "..."); }
	fen() { return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"; }
}

function makeRuntime() {
	const ctx = vm.createContext({
		console,
		Buffer,
		TextDecoder,
		decoder: new TextDecoder(),
		config: {
			graph_minimum_length: 41,
			pgn_ev: false, pgn_cp: false, pgn_n: false, pgn_n_abs: false, pgn_of_n: false, pgn_depth: false,
			pgn_p: false, pgn_v: false, pgn_q: false, pgn_u: false, pgn_s: false, pgn_m: false, pgn_wdl: false,
		},
		next_node_id: 1,
		live_nodes: Object.create(null),
		position_annotations,
		LoadFEN: () => new FakeBoard(),
		SafeStringHTML: s => s,
		UnsafeStringPGN: s => s,
		SafeStringPGN: s => s,
		UnsafeStringHTML: s => s,
	});
	for (const name of ["20_utils.js", "50_table.js", "52_sorted_moves.js", "51_node.js", "60_pgn_utils.js", "61_pgn_parse.js"]) {
		vm.runInContext(fs.readFileSync(path.join(src, "renderer", name), "utf8"), ctx, {filename: name});
	}
	return vm.runInContext("({NewRoot, NewInfo, LoadPGNRecord, PreParsePGN, make_movetext, ParsePgnGraphicsComment, PgnClockString, config})", ctx);
}

function loadGame(rt, pgn) {
	return rt.LoadPGNRecord(rt.PreParsePGN(Buffer.from(pgn, "utf8")));
}

// The nodes of the main line, in order, not counting the root.
function mainLine(root) {
	const nodes = [];
	let node = root;
	while (node.children.length > 0) {
		node = node.children[0];
		nodes.push(node);
	}
	return nodes;
}

// Puts analysis for `move` into the table of `parent`, the way the engine would.
function setMoveInfo(rt, parent, move, fields) {
	const info = rt.NewInfo(parent.board, move);
	info.__touched = true;
	Object.assign(info, fields);
	parent.table.moveinfo[move] = info;
	return info;
}

test("analysis is exported as a standard [%eval], from White's point of view", () => {
	const rt = makeRuntime();
	const root = rt.NewRoot();
	const e4 = root.make_move("e4");
	e4.make_move("e5");
	setMoveInfo(rt, root, "e4", {cp: 34, depth: 20});		// White to move: +0.34 for White
	setMoveInfo(rt, e4, "e5", {cp: 50, depth: 18});			// Black to move: +0.50 for Black, so -0.50 for White
	const movetext = rt.make_movetext(root);
	assert.ok(movetext.includes("e4 {[%eval 0.34,20]}"), movetext);
	assert.ok(movetext.includes("e5 {[%eval -0.50,18]}"), movetext);
});

test("mate is written as #n from White's point of view", () => {
	const rt = makeRuntime();
	const root = rt.NewRoot();
	const e4 = root.make_move("e4");
	e4.make_move("e5");
	setMoveInfo(rt, root, "e4", {mate: -3, cp: -32000, depth: 12});	// White to move, so Black mates in 3
	setMoveInfo(rt, e4, "e5", {mate: 2, cp: 32000});				// Black to move, so Black mates in 2
	const movetext = rt.make_movetext(root);
	assert.ok(movetext.includes("e4 {[%eval #-3,12]}"), movetext);
	assert.ok(movetext.includes("e5 {[%eval #-2]}"), movetext);
});

test("[%eval] in an imported game fills the parent tables, from the side to move's point of view", () => {
	const rt = makeRuntime();
	const root = loadGame(rt, "1. e4 {[%eval 0.30,20]} 1... e5 {[%eval -0.50,18]} 2. Nf3 {[%eval #-3]} *");
	const [e4, e5, nf3] = mainLine(root);

	const a = root.table.moveinfo.e4;
	assert.equal(a.__from_pgn, true);
	assert.equal(a.__touched, true);
	assert.equal(a.cp, 30);				// White to move in the root, and +0.30 for White
	assert.equal(a.depth, 20);

	const b = e4.table.moveinfo.e5;
	assert.equal(b.cp, 50);				// Black to move after 1. e4, and -0.50 for White means +0.50 for Black
	assert.equal(b.depth, 18);

	const c = e5.table.moveinfo.Nf3;
	assert.equal(c.mate, -3);			// White to move, and #-3 means Black mates in 3
	assert.equal(c.cp, -32000);
	assert.equal(c.q, -1);

	assert.equal(nf3.comment_after, "");
});

test("imported evaluations draw the graph without any engine analysis", () => {
	const rt = makeRuntime();
	const root = loadGame(rt, "1. e4 {[%eval 0.30,20]} 1... e5 {[%eval -0.50,18]} *");
	const [e4] = mainLine(root);
	assert.ok(Math.abs(root.table.get_graph_y() - 1 / (1 + Math.pow(0.5, 0.30))) < 1e-9);
	assert.ok(Math.abs(e4.table.get_graph_y() - 1 / (1 + Math.pow(0.5, -0.50))) < 1e-9);
});

test("a position with no analysis still has no graph value", () => {
	const rt = makeRuntime();
	const root = loadGame(rt, "1. e4 e5 *");
	assert.equal(root.table.get_graph_y(), null);
});

test("the summary Nibbler writes next to [%eval] is not kept as a second comment on import", () => {
	const rt = makeRuntime();
	const root = loadGame(rt, "1. e4 {[%eval 0.30,20] EV: 55.1%} *");
	assert.equal(mainLine(root)[0].comment_after, "");
});

test("re-exporting an imported game does not repeat the summary", () => {
	const rt = makeRuntime();
	rt.config.pgn_ev = true;
	const root = loadGame(rt, "1. e4 {[%eval 0.30,20] EV: 55.1%} *");
	const movetext = rt.make_movetext(root);
	assert.equal(movetext.split("EV:").length - 1, 1, movetext);
	assert.ok(movetext.includes("[%eval 0.30,20]"), movetext);
});

test("a comment next to [%eval] is kept, and so is text that is not a summary", () => {
	const rt = makeRuntime();
	const root = loadGame(rt, "1. e4 {Good move [%eval 0.30]} 1... e5 {[%eval 0.20] EV: good, but risky} *");
	const [e4, e5] = mainLine(root);
	assert.equal(e4.comment_after, "Good move");
	assert.equal(e5.comment_after, "EV: good, but risky");
});

test("a summary without an [%eval] is an ordinary comment, as before", () => {
	const rt = makeRuntime();
	const root = loadGame(rt, "1. e4 {EV: 55.1%} *");
	assert.equal(mainLine(root)[0].comment_after, "EV: 55.1%");
	assert.equal(root.table.get_graph_y(), null);
});

test("[%clk] is read after each move and written back on export", () => {
	const rt = makeRuntime();
	const root = loadGame(rt, "1. e4 {[%clk 0:05:00]} 1... e5 {Quick [%clk 0:04:58]} *");
	const [e4, e5] = mainLine(root);
	assert.equal(e4.clock_after, 300);
	assert.equal(e5.clock_after, 298);
	assert.equal(e5.comment_after, "Quick");
	const movetext = rt.make_movetext(root);
	assert.ok(movetext.includes("{[%clk 0:05:00]}"), movetext);
	assert.ok(movetext.includes("{Quick [%clk 0:04:58]}"), movetext);
});

test("time spent on a move uses the previous clock of the same side and the TimeControl increment", () => {
	const rt = makeRuntime();
	const root = loadGame(rt, '[TimeControl "300+3"]\n\n1. e4 {[%clk 0:05:00]} 1... e5 {[%clk 0:04:58]} 2. Nf3 {[%clk 0:04:59]} *');
	const [e4, e5, nf3] = mainLine(root);
	assert.equal(nf3.clock_spent_seconds(), 4);		// 300 - 299 + 3
	assert.equal(e4.clock_spent_seconds(), null);	// No earlier clock reading for White
	assert.equal(e5.clock_spent_seconds(), null);	// No earlier clock reading for Black
});

test("time spent needs the TimeControl tag, because the increment is unknown without it", () => {
	const rt = makeRuntime();
	const root = loadGame(rt, "1. e4 {[%clk 0:05:00]} 1... e5 {[%clk 0:04:58]} 2. Nf3 {[%clk 0:04:59]} *");
	assert.equal(mainLine(root)[2].clock_spent_seconds(), null);
});

test("clock strings are H:MM:SS, rounded down", () => {
	const rt = makeRuntime();
	assert.equal(rt.PgnClockString(0), "0:00:00");
	assert.equal(rt.PgnClockString(59.9), "0:00:59");
	assert.equal(rt.PgnClockString(3661), "1:01:01");
});

test("export, import and export again give the same text", () => {
	const rt = makeRuntime();
	rt.config.pgn_ev = true;
	const root = loadGame(rt, '[TimeControl "300+3"]\n\n1. e4 {[%eval 0.30,20] [%clk 0:05:00]} 1... e5 {Quick [%eval -0.50,18] [%clk 0:04:58]} *');
	const first = rt.make_movetext(root);
	const again = rt.make_movetext(loadGame(rt, first));
	assert.equal(again, first);
});

test("tags that cannot be read stay in the comment text", () => {
	const rt = makeRuntime();
	const parsed = rt.ParsePgnGraphicsComment("Fine [%eval soon] [%clk later]");
	assert.equal(parsed.text, "Fine [%eval soon] [%clk later]");
	assert.equal(parsed.evaluation, null);
	assert.equal(parsed.clock, null);
});
