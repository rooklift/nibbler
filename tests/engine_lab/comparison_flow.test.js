"use strict";

// End-to-end check of the engine comparison: real NewEngine (with fake processes), real
// EngineManager, real comparison view and the hub's own set_engine_search() taken from
// 95_hub.js. Covers the path that unit tests with mocked engines cannot see: the hub asks
// the primary engine to search, and the secondary engine must receive the same "go".

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const SRC = path.join(__dirname, "../../files/src");
const PRIMARY = "C:\\engines\\first.exe";
const SECONDARY = "C:\\engines\\second.exe";

function read(relative) {
	return fs.readFileSync(path.join(SRC, relative), "utf8");
}

function extract(source, pattern, what) {
	let match = source.match(pattern);
	if (!match) throw new Error(`Could not find ${what}`);
	return match[1];
}

class FakeProcess {
	constructor(filepath) {
		this.filepath = filepath;
		this.written = [];
		this.stdin = {write: chunk => {
			if (chunk !== "\n") this.written.push(chunk);
		}};
		this.stdout = {};
		this.stderr = {};
		this.listeners = Object.create(null);
	}

	on(event, callback) {
		(this.listeners[event] ||= []).push(callback);
		return this;
	}

	once(event, callback) {
		return this.on(event, callback);
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

// Just enough of the #enginebox element for the view: counts full rebuilds and live writes.

class FakeEnginebox {
	constructor() {
		this.html = "";
		this.rebuilds = 0;
		this.live = null;
	}

	set innerHTML(value) {
		this.html = value;
		this.rebuilds++;
		this.live = value.includes("engine-lab-live") ? {innerHTML: "", writes: 0} : null;
		if (this.live) {
			let live = this.live;
			let stored = "";
			Object.defineProperty(live, "innerHTML", {
				get: () => stored,
				set: v => { stored = v; live.writes++; },
			});
		}
	}

	get innerHTML() {
		return this.html;
	}

	querySelector(selector) {
		return selector === ".engine-lab-live" ? this.live : null;
	}

	text() {
		return this.html + (this.live ? this.live.innerHTML : "");
	}
}

function makeNode(id) {
	return {
		id,
		destroyed: false,
		searchmoves: [],
		terminal_reason: () => null,
		validate_searchmoves: moves => (Array.isArray(moves) ? moves.slice() : []),
		get_root() {
			return this;
		},
		board: {fen: () => `fen-${id}`},
		history_old_format: () => [],
		history: () => [],
	};
}

function setup(options = {}) {
	let processes = [];
	let scanners = [];
	let enginebox = new FakeEnginebox();
	let tab = {id: 1, comparison_mode: true};

	let context = {
		console, Object, Array, Map, Set, Number, String, Math, JSON, Date, Error,
		performance: {now: () => 0},
		alert: () => {},
		Log: () => {},
		LogBoth: () => {},
		SafeStringHTML: value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
		path: {basename: value => path.win32.basename(value), dirname: value => path.win32.dirname(value)},
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
		ipcRenderer: {send: () => {}},
		require: modulePath => {
			let modules = {
				"./modules/engine_lab": "modules/engine_lab",
				"./modules/engine_resource_scheduler": "modules/engine_resource_scheduler",
				"./modules/engine_game_analysis": "modules/engine_game_analysis",
			};
			if (!modules[modulePath]) throw new Error(`Unexpected module: ${modulePath}`);
			return require(path.join(SRC, modules[modulePath]));
		},
		config: {searchmoves_buttons: false, log_positions: false, log_info_lines: false, leelaish_names: ["Lc0", "Leela", "Ceres"]},
		engineconfig: {
			[PRIMARY]: {args: [], options: {}},
			[SECONDARY]: {args: [], options: options.secondary_options || {}},
		},
		enginebox,
	};
	vm.createContext(context);

	let hub_source = read("renderer/95_hub.js");
	let utils_source = read("renderer/20_utils.js");
	vm.runInContext(extract(utils_source, /(function CompareArrays\(a, b\) \{[\s\S]*?\n\})/, "CompareArrays"), context);
	vm.runInContext(extract(read("renderer/10_globals.js"),
		/(const forced_lc0_options = \{[\s\S]*?\nconst standard_ab_options = \{[\s\S]*?\n\};)/, "engine option tables"), context);
	vm.runInContext(read("renderer/90_engine.js"), context);
	vm.runInContext(read("renderer/91_engine_manager.js"), context);
	vm.runInContext(read("renderer/96_engine_lab.js"), context);

	// The hub is the primary engine's event sink. Only the parts the engine and manager use are
	// stubbed; set_engine_search() is the hub's real implementation.

	let hub = {
		tab_manager: null,
		active_tab: () => tab,
		find_tab_for_node: () => tab,
		with_tab: (t, fn) => fn(t),
		info_handler: {engine_cycle: 0, engine_subcycle: 0, receive() {}, err_receive() {}},
		receive_misc(line) {
			if (line.startsWith("uciok")) {
				this.engine_send_all_options();
				this.engine.send("isready");
			}
		},
		receive_bestmove() {},
		err_receive() {},
	};
	for (let name of ["onReady", "onInfo", "onBestmove", "onError", "onExit", "onStateChanged"]) {
		hub[name] = function(engine, event) {
			this.engine_manager.handle_event(name, engine, event);
		};
	}
	hub.set_engine_search = vm.runInContext(
		"(" + extract(hub_source, /set_engine_search: (function\([^)]*\) \{[\s\S]*?\n\t\}),/, "hub.set_engine_search") + ")",
		context);
	hub.engine_send_all_options = vm.runInContext(
		"(" + extract(hub_source, /engine_send_all_options: (function\([^)]*\) \{[\s\S]*?\n\t\}),/, "hub.engine_send_all_options") + ")",
		context);

	hub.engine_manager = context.NewEngineManager(hub);
	hub.engine = context.NewEngine(hub);
	assert.equal(hub.engine.setup(PRIMARY, []), true);
	hub.engine_manager.attach_primary(hub.engine, PRIMARY);
	let view = context.NewEngineLabView(hub);

	let primary_out = scanners[0];
	primary_out.emit("line", "id name First");
	primary_out.emit("line", "uciok");
	primary_out.emit("line", "readyok");

	return {hub, view, enginebox, processes, scanners, primary_out};
}

function start_secondary(env, name = "Second", option_lines = []) {
	let result = env.hub.engine_manager.start_comparison_for_tab(1, PRIMARY, SECONDARY);
	assert.ok(result, "comparison should start");
	let secondary_out = env.scanners[2];		// Each engine creates a stdout and a stderr scanner.
	secondary_out.emit("line", `id name ${name}`);
	for (let line of option_lines) secondary_out.emit("line", line);
	secondary_out.emit("line", "uciok");
	secondary_out.emit("line", "readyok");
	return secondary_out;
}

test("hub routes every primary search through set_engine_search()", () => {
	let hub_source = read("renderer/95_hub.js");
	let body = extract(hub_source, /set_engine_search: (function\([^)]*\) \{[\s\S]*?\n\t\}),/, "hub.set_engine_search");
	let outside = hub_source.replace(body, "");
	assert.doesNotMatch(outside, /this\.engine\.set_search_desired\(/,
		"a direct primary search call would bypass the comparison engine");
	assert.match(body, /this\.engine_manager\.mirror_primary_search\(/);
});

test("secondary engine receives the primary's search, after ucinewgame", () => {
	let env = setup();
	let node = makeNode("a");
	env.hub.set_engine_search(node, null, false, []);
	assert.deepEqual(env.processes[0].written.slice(-2), ["position fen fen-a", "go infinite"]);

	start_secondary(env);
	let sent = env.processes[1].written;
	assert.deepEqual(sent, ["uci", "isready", "ucinewgame", "position fen fen-a", "go infinite"]);
});

test("halting and moving are mirrored on the secondary engine", () => {
	let env = setup();
	env.hub.set_engine_search(makeNode("a"), null, false, []);
	let secondary_out = start_secondary(env);

	env.hub.set_engine_search(makeNode("b"), 1000, false, []);
	assert.equal(env.processes[0].written.at(-1), "stop");
	assert.equal(env.processes[1].written.at(-1), "stop");

	env.primary_out.emit("line", "bestmove e2e4");
	secondary_out.emit("line", "bestmove e2e4");
	assert.deepEqual(env.processes[0].written.slice(-2), ["position fen fen-b", "go nodes 1000"]);
	assert.deepEqual(env.processes[1].written.slice(-2), ["position fen fen-b", "go nodes 1000"]);

	env.hub.set_engine_search(null);
	assert.equal(env.processes[0].written.at(-1), "stop");
	assert.equal(env.processes[1].written.at(-1), "stop");
});

test("comparison panel shows best lines live and reports partial agreement", () => {
	let env = setup();
	env.hub.set_engine_search(makeNode("a"), null, false, []);
	let secondary_out = start_secondary(env);

	// Primary sends MultiPV 2: the second line arrives last but must not replace the best line.
	env.primary_out.emit("line", "info depth 10 multipv 1 score cp 20 nodes 1000 nps 100 pv e2e4 e7e5");
	env.primary_out.emit("line", "info depth 10 multipv 2 score cp 10 nodes 1000 nps 100 pv d2d4 d7d5");
	env.view.draw();

	let text = env.enginebox.text();
	assert.match(text, /Engine comparison/);
	assert.match(text, /e2e4 e7e5/);
	assert.doesNotMatch(text, /engine-lab-card-pv">d2d4/, "card must show multipv 1, not the last line received");
	assert.match(text, /Consensus: partial \(1\/2 engines reporting\)/);
	let rebuilds = env.enginebox.rebuilds;

	secondary_out.emit("line", "info depth 12 multipv 1 score cp 25 nodes 500 nps 50 pv e2e4 c7c5");
	env.view.draw();
	text = env.enginebox.text();
	assert.match(text, /depth 12/);
	assert.match(text, /Consensus: high/);
	assert.match(text, /Support: 2\/2/);
	assert.equal(env.enginebox.rebuilds, rebuilds, "controls (engine <select>) must not be rebuilt on live updates");

	let writes = env.enginebox.live.writes;
	env.view.draw();
	assert.equal(env.enginebox.live.writes, writes, "unchanged results must not rewrite the DOM");
});

test("second engine gets its own saved options before isready", () => {
	let env = setup({secondary_options: {Hash: 256, Threads: 4}});
	start_secondary(env, "Stockfish 19", [
		"option name Threads type spin default 1 min 1 max 1024",
		"option name Hash type spin default 16 min 1 max 33554432",
		"option name UCI_ShowWDL type check default false",
	]);
	let sent = env.processes[1].written;
	let at = line => sent.indexOf(line);

	assert.ok(at("setoption name UCI_ShowWDL value true") > 0, "standard A/B option known by the engine");
	assert.ok(at("setoption name Threads value 4") > 0, "user's Threads for this engine");
	assert.ok(at("setoption name Hash value 256") > at("setoption name Threads value 4"), "Hash after Threads");
	assert.ok(at("isready") > at("setoption name Hash value 256"), "options before isready");
	assert.equal(env.hub.engine_manager.secondary().leelaish, false);
	assert.ok(!env.processes[0].written.includes("setoption name Hash value 256"), "primary must not receive the secondary's options");
});

test("an Lc0 second engine gets the Lc0 option set", () => {
	let env = setup({secondary_options: {WeightsFile: "C:\nets\big.pb.gz"}});
	start_secondary(env, "Lc0 v0.31.2");
	let sent = env.processes[1].written;

	assert.equal(env.hub.engine_manager.secondary().leelaish, true);
	assert.ok(sent.includes("setoption name MultiPV value 500"), "forced Lc0 options are sent");
	assert.ok(sent.includes("setoption name WeightsFile value C:\nets\big.pb.gz"));
	assert.ok(sent.indexOf("isready") > sent.indexOf("setoption name WeightsFile value C:\nets\big.pb.gz"));
});
