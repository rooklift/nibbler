"use strict";

// Regression test for the auto_analysis / back_analysis state machine.
//
// Loads the REAL 90_engine.js and 95_hub.js (like new_engine.test.js does) and
// drives the flow: set_behaviour -> behave() -> search -> bestmove ->
// continue_auto_analysis -> step forward/back. Verifies that:
//   * auto_analysis walks the line forward and halts at the end,
//   * back_analysis walks the line backward and halts at the root,
//   * each position is searched for config.auto_analysis_time_ms (time budget),
//     so the line advances even when search_nodes_special is enormous (1e9),
//   * an invalid budget falls back to the old behaviour (huge node limit ->
//     search never completes -> no stepping).

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const SRC = path.join(__dirname, "../../files/src/renderer");

// ---------------------------------------------------------------- engine load

function loadEngine() {
	let processes = [];
	let scanners = [];
	let writes = [];

	class FakeProcess {
		constructor(filepath) {
			this.filepath = filepath;
			this.stdin = {write: s => writes.push(String(s).trim())};
			this.stdout = {};
			this.stderr = {};
			this.listeners = Object.create(null);
		}
		on(event, callback) {
			(this.listeners[event] ||= []).push(callback);
			return this;
		}
		once(event, callback) {
			return this.on(event, (...args) => {
				this.listeners[event] = [];
				callback(...args);
			});
		}
		emit(event, ...args) {
			for (let callback of this.listeners[event] || []) callback(...args);
		}
		kill() {}
	}

	class FakeScanner {
		constructor() {
			this.listeners = Object.create(null);
		}
		on(event, callback) {
			(this.listeners[event] ||= []).push(callback);
			return this;
		}
		emit(event, value) {
			for (let callback of this.listeners[event] || []) callback(value);
		}
	}

	let context = {
		console,
		Object,
		Array,
		Map,
		Number,
		String,
		Math,
		JSON,
		performance: {now: () => 0},
		alert: () => {},
		Log: () => {},
		SafeStringHTML: value => value,
		path: {
			basename: value => path.basename(value),
			dirname: value => path.dirname(value),
		},
		child_process: {
			spawn: filepath => {
				let process = new FakeProcess(filepath);
				processes.push(process);
				return process;
			},
		},
		readline: {
			createInterface: () => {
				let scanner = new FakeScanner();
				scanners.push(scanner);
				return scanner;
			},
		},
		ipcRenderer: {
			send: () => {},
		},
		require: modulePath => {
			if (modulePath === "./modules/engine_lab") {
				return require("../../files/src/modules/engine_lab");
			}
			throw new Error(`Unexpected module: ${modulePath}`);
		},
		config: {
			searchmoves_buttons: false,
			log_positions: false,
			log_info_lines: false,
		},
		CompareArrays: (a, b) => {
			if (a === b) return true;
			if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
			return a.every((v, i) => v === b[i]);
		},
	};
	vm.createContext(context);
	let source = fs.readFileSync(path.join(SRC, "90_engine.js"), "utf8");
	vm.runInContext(`${source}\nthis.__NewEngine = NewEngine;`, context);

	return {NewEngine: context.__NewEngine, processes, scanners, writes};
}

// -------------------------------------------------------------------- hub load

function loadHub() {
	let engineconfig = {
		"C:\\fake.exe": {
			args: [],
			options: {MultiPV: 2},		// Like the user's real engines.json; prevents the "new A/B engine" 10M default.
			search_nodes: 1000,
			search_nodes_special: 10000,
			limit_by_time: false,
		},
	};
	let config = {
		allow_stopped_analysis: false,
		suppress_ucinewgame: false,
		searchmoves_buttons: false,
		leelaish_names: ["Lc0", "Ceres"],
		auto_analysis_time_ms: 10000,
	};
	let context = {
		console,
		Object,
		Array,
		Map,
		Set,
		Number,
		String,
		Math,
		JSON,
		performance: {now: () => 0},
		alert: () => {},
		Log: () => {},
		LogBoth: () => {},
		SafeStringHTML: value => value,
		config,
		engineconfig,
		engine_display: {
			name_from_id_line: s => s.slice("id name ".length).trim(),
		},
		enginebox: {innerHTML: ""},
		ipcRenderer: {send: () => {}},
		CommaNum: n => n,
		drag_handler: {cancel_drag: () => {}},
		fenbox: {value: ""},
		forced_lc0_options: {},
		forced_ab_options: {},
		standard_lc0_options: {},
		standard_ab_options: {},
	};
	vm.createContext(context);
	let source = fs.readFileSync(path.join(SRC, "95_hub.js"), "utf8");
	vm.runInContext(`${source}\nthis.__hub_props = hub_props;`, context);
	return {hub_props: context.__hub_props, engineconfig, config};
}

// --------------------------------------------------------------------- stubs

function mkNode(id, move, parent, children = []) {
	let node = {
		id,
		move,
		parent,
		children,
		destroyed: false,
		searchmoves: [],
		terminal_reason: () => null,
		validate_searchmoves: moves => (Array.isArray(moves) ? moves.slice() : []),
		is_same_line: other => false,
		table: {
			already_autopopulated: true,
			moveinfo: {},
			autopopulate() {},
		},
	};
	node.get_root = () => {
		let r = node;
		while (r.parent) r = r.parent;
		return r;
	};
	node.board = {
		fen: () => "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
	};
	node.history_old_format = () => {
		let out = [];
		let n = node;
		while (n.parent) {
			out.push(n.move);
			n = n.parent;
		}
		return out.reverse();
	};
	node.history = node.history_old_format;
	return node;
}

function mkTree(startNode) {
	return {
		node: startNode,
		prev() {
			if (this.node.parent) {
				this.node = this.node.parent;
				return true;
			}
			return false;
		},
		next() {
			if (this.node.children.length > 0) {
				this.node = this.node.children[0];
				return true;
			}
			return false;
		},
	};
}

function makeHub(hub_props, engine, tree) {
	let hub = Object.create(null);
	Object.assign(hub, hub_props);

	hub.engine = engine;
	hub.tree = tree;
	hub.engine_manager = {handle_event: () => false};
	hub.tab_manager = {active: () => ({id: 1}), active_tab_id: 1, count: () => 1};

	hub.current_tab = () => ({id: 1});
	hub.is_active_context = () => true;
	hub.find_tab_for_node = () => null;
	hub.active_tab = () => ({id: 1});
	hub.with_tab = (tab, fn) => fn();

	hub.update_toolbar_state = () => {};
	hub.draw_statusbox = () => {};
	hub.set_special_message = () => {};
	hub.hide_fullbox = () => {};
	hub.hide_promotiontable = () => {};
	hub.escape = () => {};
	hub.draw = () => {};
	hub.send_title = () => {};
	hub.maybe_infer_info = () => {};
	hub.node_exit_cleanup = () => {};
	hub.send_ucinewgame = () => {};
	hub.looker = {add_to_queue: () => {}};
	hub.draw_enginebox = () => {};
	hub.leela_lock_node = null;
	hub.behaviour = "halt";
	hub.hoverdraw_div = -1;
	hub.node_to_clean = null;
	hub.position_change_time = 0;

	hub.info_handler = {engine_cycle: 0, engine_subcycle: 0, must_draw_infobox: () => {}, err_receive: () => {}, receive: () => {}};

	hub.fenbox = {value: ""};

	return hub;
}

// -------------------------------------------------------------------- runner

function runScenario(behaviour, startIndex, engineCfg, emitBestmove = true) {
	let engineLoad = loadEngine();
	let hubLoad = loadHub();
	let hub_props = hubLoad.hub_props;
	let engineconfigEntry = hubLoad.engineconfig["C:\\fake.exe"];

	let root = mkNode("root", null, null, []);
	let n1 = mkNode("n1", "e2e4", root, []);
	let n2 = mkNode("n2", "e7e5", n1, []);
	let n3 = mkNode("n3", "g1f3", n2, []);
	root.children = [n1];
	n1.children = [n2];
	n2.children = [n3];

	let nodes = [root, n1, n2, n3];
	let tree = mkTree(nodes[startIndex]);

	let engine = engineLoad.NewEngine({}, {event_sink: null, ack_to_main: false});
	let hub = makeHub(hub_props, engine, tree);
	engine.event_sink = hub;

	engine.setup("C:\\fake.exe", []);

	let scanner = engineLoad.scanners[0];
	scanner.emit("line", "id name FakeEngine");
	scanner.emit("line", "uciok");
	scanner.emit("line", "readyok");

	// Apply the scenario's engine config (as saved in the user's engines.json).
	engineconfigEntry.search_nodes_special = engineCfg.special;
	engineconfigEntry.limit_by_time = engineCfg.limit_by_time;
	if (Object.prototype.hasOwnProperty.call(engineCfg, "budget")) {
		hubLoad.config.auto_analysis_time_ms = engineCfg.budget;
	}

	let steps = [];
	let limit = 8;

	hub.set_behaviour(behaviour);

	for (let i = 0; i < limit; i++) {
		let running = engine.search_running && engine.search_running.node ? engine.search_running.node.id : null;
		steps.push({
			treeNode: tree.node.id,
			behaviour: hub.behaviour,
			state: engine.search_state,
			running,
		});

		if (!engine.search_running.node) {
			break;
		}

		if (!emitBestmove) {
			break;		// Huge limit: the engine never finishes, so no bestmove ever arrives.
		}

		scanner.emit("line", "bestmove e2e4");
	}

	let goCommands = engineLoad.writes.filter(w => w.startsWith("go"));

	return {steps, engine, goCommands};
}

// ---------------------------------------------------------------------- tests

test("auto_analysis walks the line forward and halts at the end", () => {
	let {steps, goCommands} = runScenario("auto_analysis", 0, {special: 10000, limit_by_time: false});
	let path = steps.map(s => s.treeNode);
	assert.deepEqual(path.slice(0, 4), ["root", "n1", "n2", "n3"]);
	assert.equal(steps[steps.length - 1].behaviour, "halt");
	// Auto analysis uses the per-position time budget (config.auto_analysis_time_ms), not the special node limit.
	assert.ok(goCommands.length > 0);
	assert.ok(goCommands.every(c => c === "go movetime 10000"), `got: ${goCommands.join(" | ")}`);
});

test("back_analysis walks the line backward and halts at the root", () => {
	let {steps, goCommands} = runScenario("back_analysis", 3, {special: 10000, limit_by_time: false});
	let path = steps.map(s => s.treeNode);
	assert.deepEqual(path.slice(0, 4), ["n3", "n2", "n1", "root"]);
	assert.equal(steps[steps.length - 1].behaviour, "halt");
	assert.ok(goCommands.length > 0);
	assert.ok(goCommands.every(c => c === "go movetime 10000"), `got: ${goCommands.join(" | ")}`);
});

test("back_analysis from the root immediately halts (nothing to go back to)", () => {
	let {steps} = runScenario("back_analysis", 0, {special: 10000, limit_by_time: false});
	assert.deepEqual(steps.map(s => s.treeNode), ["root", "root"]);
	assert.equal(steps[steps.length - 1].behaviour, "halt");
});

test("huge special node limit still steps thanks to the time budget", () => {
	// e.g. Reckless in the user's engines.json: search_nodes_special = 1e9.
	// Without the budget the search would never complete; with it, every position
	// is searched for config.auto_analysis_time_ms and the line walks back.
	let {steps, goCommands} = runScenario("back_analysis", 3, {special: 1000000000, limit_by_time: false});
	let path = steps.map(s => s.treeNode);
	assert.deepEqual(path.slice(0, 4), ["n3", "n2", "n1", "root"]);
	assert.equal(steps[steps.length - 1].behaviour, "halt");
	assert.ok(goCommands.every(c => c === "go movetime 10000"), `got: ${goCommands.join(" | ")}`);
});

test("invalid time budget falls back to the special node limit (search never completes)", () => {
	// If config.auto_analysis_time_ms is not a valid number, old behaviour applies:
	// the huge special node limit means the engine never finishes, so no stepping.
	let {steps, goCommands} = runScenario("back_analysis", 3, {special: 1000000000, limit_by_time: false, budget: null}, false);
	assert.equal(steps[steps.length - 1].state, "searching");
	assert.deepEqual(steps.map(s => s.treeNode), ["n3"]);
	assert.ok(goCommands.every(c => c === "go nodes 1000000000"), `got: ${goCommands.join(" | ")}`);
});
