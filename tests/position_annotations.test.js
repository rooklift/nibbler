"use strict";

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
		this.halfmove = 0;
	}
	move() { return new FakeBoard(this.ply + 1); }
	parse_pgn(move) { return [move, ""]; }
	nice_string(move) { return move; }
	next_number_string() { return Math.floor(this.ply / 2) + 1 + (this.active === "w" ? "." : "..."); }
	fen() { return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"; }
	no_moves() { return false; }
	insufficient_material() { return false; }
}

function makeRuntime() {
	const ctx = vm.createContext({
		console,
		Buffer,
		Uint8Array,
		decoder: new TextDecoder(),
		config: {graph_minimum_length: 41},
		next_node_id: 1,
		live_nodes: Object.create(null),
		position_annotations,
		LoadFEN: () => new FakeBoard(),
		DateString: () => "2026.10.11",
		NewTable: () => ({moveinfo: {}, terminal: "", autopopulate() {}}),
		StringIsNumeric: s => /^\d+(?:\.\d+)?$/.test(s),
		SafeStringHTML: s => s,
		UnsafeStringPGN: s => s,
		SafeStringPGN: s => s,
		UnsafeStringHTML: s => s,
	});
	for (const name of ["51_node.js", "60_pgn_utils.js", "61_pgn_parse.js", "68_undo_stack.js", "95_hub.js"]) {
		vm.runInContext(fs.readFileSync(path.join(src, "renderer", name), "utf8"), ctx, {filename: name});
	}
	return vm.runInContext("({NewRoot, PreParsePGN, LoadPGNRecord, make_movetext, make_pgn_string, NewUndoStack, hub_props})", ctx);
}

test("all agreed position symbols have unique standard NAG codes", () => {
	assert.deepEqual(position_annotations.evaluations.map(e => e.nag), [10, 13, 14, 15, 16, 17, 18, 19, 44]);
	assert.deepEqual(position_annotations.evaluations.map(e => e.symbol), ["=", "∞", "⩲", "⩱", "±", "∓", "+−", "−+", "⨀"]);
});

test("quality marks and all position NAGs survive PGN export/import", () => {
	const rt = makeRuntime();
	let root = rt.NewRoot();
	let node = root;
	for (const evaluation of position_annotations.evaluations) {
		node = node.make_move("e4");
		node.annotation = "!";
		node.position_nag = evaluation.nag;
		assert.ok(node.token().includes("e4! " + evaluation.symbol));
	}
	const movetext = rt.make_movetext(root);
	for (const evaluation of position_annotations.evaluations) {
		assert.ok(movetext.includes("$" + evaluation.nag), "missing NAG $" + evaluation.nag);
	}
	const restored = rt.LoadPGNRecord(rt.PreParsePGN(Buffer.from(rt.make_pgn_string(root), "utf8")));
	let current = restored;
	for (const evaluation of position_annotations.evaluations) {
		current = current.children[0];
		assert.equal(current.position_nag, evaluation.nag);
		assert.equal(current.annotation, "!");
		assert.ok(current.token().includes(evaluation.symbol));
	}
});

test("import handles NAGs, comments, and independent evaluations inside variations", () => {
	const rt = makeRuntime();
	const source = '[Event "NAG example"]\n\n1. e4 $3 $14 {White has the initiative} (1. d4 $15) 1... e5? $13 *';
	const root = rt.LoadPGNRecord(rt.PreParsePGN(Buffer.from(source, "utf8")));
	const main = root.children[0];
	const variation = root.children[1];
	const reply = main.children[0];
	assert.equal(main.annotation, "!!");
	assert.equal(main.position_nag, 14);
	assert.equal(main.comment_after, "White has the initiative");
	assert.equal(variation.position_nag, 15);
	assert.equal(variation.annotation, null);
	assert.equal(reply.annotation, "?");
	assert.equal(reply.position_nag, 13);
	const text = rt.make_movetext(root);
	assert.ok(text.includes("$14"));
	assert.ok(text.includes("$15"));
	assert.ok(text.includes("$13"));
});

test("position evaluation can be replaced and cleared without removing the move annotation; undo/redo works", () => {
	const rt = makeRuntime();
	const root = rt.NewRoot();
	const move = root.make_move("e4");
	move.annotation = "!!";
	const tree = {root, node: move, tree_version: 0, dom_from_scratch() {}};
	const hub = {
		tree,
		behaviour: "halt",
		set_behaviour(value) { this.behaviour = value; },
		position_changed() {},
		set_special_message() {},
	};
	hub.undo_stack = rt.NewUndoStack(hub);
	hub.set_node_position_annotation = rt.hub_props.set_node_position_annotation;

	hub.set_node_position_annotation(14);
	assert.equal(tree.node.position_nag, 14);
	assert.equal(tree.node.annotation, "!!");
	hub.set_node_position_annotation(18);
	assert.equal(tree.node.position_nag, 18);
	hub.undo_stack.undo();
	assert.equal(tree.node.position_nag, 14);
	assert.equal(tree.node.annotation, "!!");
	hub.undo_stack.redo();
	assert.equal(tree.node.position_nag, 18);
	hub.set_node_position_annotation(null);
	assert.equal(tree.node.position_nag, null);
	assert.equal(tree.node.annotation, "!!");
	assert.equal(hub.undo_stack.undo_stack.length, 3);
});

test("Annotation submenu sends all NAG codes through the native context menu", () => {
	const source = fs.readFileSync(path.join(src, "main.js"), "utf8");
	const begin = source.indexOf("function build_movelist_context_menu(msg) {");
	const end = source.indexOf("// Avoid a theoretical race", begin);
	assert.ok(begin >= 0 && end > begin);
	const sent = [];
	const ctx = vm.createContext({
		electron: {Menu: {buildFromTemplate: items => items}},
		translate: {t: key => key},
		win: {webContents: {send: (...args) => sent.push(args)}},
		position_annotations,
	});
	vm.runInContext(source.slice(begin, end), ctx);
	const menu = vm.runInContext("build_movelist_context_menu({can_edit_node: true})", ctx);
	const annotationMenu = menu.find(item => item.label === "Annotation");
	assert.ok(annotationMenu);
	const positionMenu = annotationMenu.submenu.find(item => item.label === "Position evaluation");
	assert.ok(positionMenu);
	for (const e of position_annotations.evaluations) {
		const item = positionMenu.submenu.find(item => item.label.startsWith(e.symbol + "  "));
		assert.ok(item, "missing menu item " + e.symbol);
		item.click();
		const message = sent.pop();
		assert.equal(message[0], "call");
		assert.equal(message[1].fn, "set_node_position_annotation");
		assert.deepEqual(Array.from(message[1].args), [e.nag]);
	}
	positionMenu.submenu.find(item => item.label === "Clear position evaluation").click();
	assert.deepEqual(Array.from(sent.pop()[1].args), [null]);
});

test("numeric move-quality and positional NAGs coexist in imported PGN", () => {
	const rt = makeRuntime();
	const root = rt.LoadPGNRecord(rt.PreParsePGN(Buffer.from("1. e4 $1 $14 e5 $2 $15 *")));
	assert.equal(root.children[0].annotation, "!");
	assert.equal(root.children[0].position_nag, 14);
	assert.equal(root.children[0].children[0].annotation, "?");
	assert.equal(root.children[0].children[0].position_nag, 15);
	assert.ok(rt.make_movetext(root).includes("e4! $14"));
});

test("evaluations in PGN variations attach to the correct variation nodes", () => {
	const rt = makeRuntime();
	const root = rt.LoadPGNRecord(rt.PreParsePGN(Buffer.from("1. e4 $14 (1. d4 $15) e5 $16 *")));
	assert.equal(root.children[0].move, "e4");
	assert.equal(root.children[0].position_nag, 14);
	assert.equal(root.children[1].move, "d4");
	assert.equal(root.children[1].position_nag, 15);
	assert.equal(root.children[0].children[0].position_nag, 16);
	const serialized = rt.make_movetext(root);
	assert.ok(serialized.includes("(1. d4 $15)"), serialized);
});
