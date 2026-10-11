"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const {create_snapshot, restore_snapshot, create_store} = require("../files/src/modules/last_session");

function makeRoot(fen = "test start position") {
	function node(parent, move) {
		return {
			parent, move, children: [], annotation: null, position_nag: null,
			comment_before: "", comment_after: "", user_arrows: [], user_highlights: [],
			make_move(s) {
				if (s === "a1a1") throw new Error("Invalid move");
				let child = node(this, s);
				this.children.push(child);
				return child;
			},
		};
	}
	let root = node(null, null);
	root.board = {fen: () => fen};
	root.tags = {White: "Alice", Black: "Bob", Event: "Saved game"};
	return root;
}

function makeHub() {
	let nextId = 1;
	function newTab() {
		const root = makeRoot();
		let tab = {
			id: nextId++, title: "New game", tree: {
				root, node: root, tree_version: 0,
			}, flip: false,
		};
		manager.tabs.push(tab);
		if (manager.active_tab_id === null) manager.active_tab_id = tab.id;
		return tab;
	}
	let manager = {tabs: [], active_tab_id: null, new_tab: newTab};
	newTab();
	return {tab_manager: manager};
}

test("entire workspace restores, including branches, evaluations, comments, selected move and active tab", () => {
	let source = makeHub();
	let first = source.tab_manager.tabs[0];
	let e4 = first.tree.root.make_move("e2e4");
	let e5 = e4.make_move("e7e5");
	let c5 = e4.make_move("c7c5");
	c5.annotation = "!";
	c5.position_nag = 14;
	c5.comment_after = "Sicilian variation";
	c5.user_arrows = [{from: "g1", to: "f3", color: "G"}];
	c5.user_highlights = [{square: "d4", color: "R"}];
	first.tree.node = c5;
	first.flip = true;
	first.session_source = "first.pgn";
	let second = source.tab_manager.new_tab();
	let d4 = second.tree.root.make_move("d2d4");
	second.tree.node = d4;
	second.tree.root.tags = {White: "Carol", Black: "Dave"};
	source.tab_manager.active_tab_id = second.id;

	let restored = makeHub();
	let snapshot = create_snapshot(source);
	assert.equal(snapshot.tabs[0].tree.children[0].children.length, 2);
	assert.equal(restore_snapshot(restored, JSON.parse(JSON.stringify(snapshot)), makeRoot), true);
	assert.equal(restored.tab_manager.tabs.length, 2);
	let tab = restored.tab_manager.tabs[0];
	assert.equal(tab.tree.root.children[0].children[0].move, "e7e5");
	assert.equal(tab.tree.node.move, "c7c5");
	assert.equal(tab.tree.node.annotation, "!");
	assert.equal(tab.tree.node.position_nag, 14);
	assert.equal(tab.tree.node.comment_after, "Sicilian variation");
	assert.deepEqual(tab.tree.node.user_arrows, [{from: "g1", to: "f3", color: "G"}]);
	assert.deepEqual(tab.tree.node.user_highlights, [{square: "d4", color: "R"}]);
	assert.equal(tab.session_source, "first.pgn");
	assert.equal(tab.flip, true);
	assert.equal(restored.tab_manager.tabs[1].tree.node.move, "d2d4");
	assert.equal(restored.tab_manager.tabs[1].tree.root.tags.White, "Carol");
	assert.equal(restored.tab_manager.active_tab_id, restored.tab_manager.tabs[1].id);
	assert.equal(e5.move, "e7e5");
});

test("atomic session autosave avoids unnecessary rewrites and recovers from damaged main file", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nibbler-session-"));
	try {
		const store = create_store(dir);
		let source = makeHub();
		const main = store.filepath;
		assert.equal(store.load(), null);
		assert.equal(store.save(source), true);
		assert.equal(store.save(source), false);
		source.tab_manager.tabs[0].tree.node = source.tab_manager.tabs[0].tree.root.make_move("e2e4");
		assert.equal(store.save(source), true);
		assert.equal(fs.existsSync(main + ".bak"), true);
		assert.equal(store.load().tabs[0].selected.length, 1);
		fs.writeFileSync(main, "{broken JSON", "utf8");
		assert.equal(create_store(dir).load().tabs[0].selected.length, 0);
		assert.equal(fs.existsSync(main + ".tmp"), false);
	} finally {
		fs.rmSync(dir, {recursive: true, force: true});
	}
});

test("restoration skips corrupt tabs, ignores unknown file versions and refuses empty sessions", () => {
	let source = makeHub();
	source.tab_manager.new_tab();
	let snapshot = create_snapshot(source);
	snapshot.tabs[0].tree.children = [{move: "a1a1", children: []}];
	snapshot.active_index = 1;
	let restored = makeHub();
	assert.equal(restore_snapshot(restored, snapshot, makeRoot), true);
	assert.equal(restored.tab_manager.tabs.length, 1);
	assert.equal(restored.tab_manager.active_tab_id, restored.tab_manager.tabs[0].id);
	assert.equal(restored.tab_manager.tabs[0].tree.root.tags.Event, "Saved game");
	assert.equal(restore_snapshot(makeHub(), {version: 99, tabs: [{}]}, makeRoot), false);
	assert.equal(restore_snapshot(makeHub(), {version: 1, tabs: []}, makeRoot), false);
});

test("the normal Quit path saves the session before stopping engines and terminating", () => {
	let renderer = fs.readFileSync(path.join(__dirname, "../files/src/renderer/95_hub.js"), "utf8");
	let actions = [];
	let context = vm.createContext({ipcRenderer: {send: name => actions.push(name)}});
	vm.runInContext(renderer, context);
	let quit = vm.runInContext("hub_props.quit", context);
	let hub = {
		last_session_store: {save: target => {
			assert.equal(target, hub);
			actions.push("save session");
		}},
		engine_manager: {stop_all: () => actions.push("stop engines")},
		save_config: () => actions.push("save config"),
		save_engineconfig: () => actions.push("save engine config"),
	};
	quit.call(hub);
	assert.deepEqual(actions, ["save session", "stop engines", "save config", "save engine config", "terminate"]);
});

test("backup survives recovery when the primary JSON is structurally corrupted", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nibbler-session-backup-"));
	try {
		const store = create_store(dir);
		const source = makeHub();
		store.save(source);
		source.tab_manager.tabs[0].tree.node = source.tab_manager.tabs[0].tree.root.make_move("e2e4");
		store.save(source);
		const savedBackup = fs.readFileSync(store.filepath + ".bak", "utf8");
		fs.writeFileSync(store.filepath, JSON.stringify({
			version: 1, active_index: 0, tabs: [{fen: "test", tree: {children: [{move: "a1a1", children: []}]}}],
		}));
		const recoveredStore = create_store(dir);
		assert.equal(restore_snapshot(makeHub(), recoveredStore.load(), makeRoot), false);
		assert.equal(restore_snapshot(makeHub(), recoveredStore.load_backup(), makeRoot), true);
		recoveredStore.save(source);
		assert.equal(fs.readFileSync(store.filepath + ".bak", "utf8"), savedBackup);
	} finally {
		fs.rmSync(dir, {recursive: true, force: true});
	}
});
