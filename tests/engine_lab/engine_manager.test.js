"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadManager() {
	let created = [];
	let source = fs.readFileSync(path.join(__dirname, "../../files/src/renderer/91_engine_manager.js"), "utf8");
	let context = {
		engine_lab: require("../../files/src/modules/engine_lab"),
		console,
		Object,
		Array,
		Map,
		Promise,
		setTimeout,
		clearTimeout,
			require: modulePath => {
			if (modulePath === "./modules/engine_lab") return require("../../files/src/modules/engine_lab");
			if (modulePath === "./modules/engine_resource_scheduler") return require("../../files/src/modules/engine_resource_scheduler");
			if (modulePath === "./modules/engine_game_analysis") return require("../../files/src/modules/engine_game_analysis");
			throw new Error(`Unexpected module: ${modulePath}`);
		},
		engineconfig: {
			first: {args: ["--first"], options: {}},
			second: {args: ["--second"], options: {}},
		},
		NewEngine: (hub, options) => {
			let engine = {
				role: options.role,
				event_sink: options.event_sink,
				ack_to_main: options.ack_to_main,
				exe: null,
				setupCalls: [],
				sent: [],
		stopped: [],
		searchRequests: [],
				shutdownCalls: 0,
				ever_received_uciok: false,
				ever_received_readyok: false,
				setup(filepath, args) {
					this.exe = {filepath};
					this.setupCalls.push({filepath, args});
					return true;
				},
				send(line) {
					this.sent.push(line);
				},
				set_search_desired(...args) {
					this.searchRequests.push(args);
					if (args.length === 1) this.stopped.push(args[0]);
				},
				send_ucinewgame() {
					this.sent.push("ucinewgame");
				},
				shutdown() {
					this.shutdownCalls++;
					this.exe = null;
				},
			};
			created.push(engine);
			return engine;
		},
	};
	vm.createContext(context);
	vm.runInContext(`${source}\nthis.__NewEngineManager = NewEngineManager;`, context);
	return {
		NewEngineManager: context.__NewEngineManager,
		created,
		makeEngine: () => context.NewEngine({}, {role: "primary", ack_to_main: true}),
	};
}

function makeHub() {
	return {
		active_tab() {
			return {id: 1};
		},
		find_tab_for_node() {
			return null;
		},
		with_tab(tab, callback) {
			return callback(tab);
		},
	};
}

test("EngineManager creates a primary and one secondary session", () => {
	let harness = loadManager();
	let manager = harness.NewEngineManager(makeHub());
	let primaryEngine = harness.makeEngine();

	manager.attach_primary(primaryEngine, "first");
	let secondaryId = manager.create_session("second", "secondary");

	assert.equal(manager.list_sessions().length, 2);
	assert.equal(manager.primary(), primaryEngine);
	assert.equal(manager.secondary().role, "secondary");
	assert.equal(secondaryId, manager.secondary_session_id());
	assert.equal(manager.secondary().ack_to_main, false);
	assert.throws(() => manager.create_session("second", "secondary"), /maximum of two/);
});

test("EngineManager starts both sessions and handles secondary readiness locally", () => {
	let harness = loadManager();
	let manager = harness.NewEngineManager(makeHub());
	manager.attach_primary(harness.makeEngine(), "first");
	let secondaryId = manager.create_session("second", "secondary");
	let primaryId = manager.primary_session_id();

	assert.equal(manager.start_session(primaryId), true);
	assert.equal(manager.start_session(secondaryId), true);

	let secondary = manager.secondary();
	assert.deepEqual(secondary.setupCalls, [{filepath: "second", args: ["--second"]}]);
	assert.deepEqual(secondary.sent, ["uci"]);

	secondary.event_sink.receive_misc("uciok");
	secondary.event_sink.receive_misc("readyok");
	assert.equal(manager.get_session(secondaryId).lifecycleState, "ready");
	assert.deepEqual(secondary.sent, ["uci", "isready", "ucinewgame"]);
});

test("stopping one session does not shut down the other", () => {
	let harness = loadManager();
	let manager = harness.NewEngineManager(makeHub());
	manager.attach_primary(harness.makeEngine(), "first");
	let secondaryId = manager.create_session("second", "secondary");
	manager.start_session(secondaryId);

	manager.stop_session(secondaryId);

	assert.deepEqual(harness.created[1].stopped, [null]);
	assert.equal(harness.created[1].shutdownCalls, 0);
	assert.equal(harness.created[0].shutdownCalls, 0);
});

test("stop_all shuts down every session and clears the manager", async () => {
	let harness = loadManager();
	let manager = harness.NewEngineManager(makeHub());
	manager.attach_primary(harness.makeEngine(), "first");
	manager.create_session("second", "secondary");

	await manager.stop_all();

	assert.equal(harness.created[0].shutdownCalls, 1);
	assert.equal(harness.created[1].shutdownCalls, 1);
	assert.deepEqual(manager.list_sessions(), []);
	assert.equal(manager.primary(), null);
	assert.equal(manager.secondary(), null);
});

test("EngineManager stores normalized secondary session events", () => {
	let harness = loadManager();
	let manager = harness.NewEngineManager(makeHub());
	manager.attach_primary(harness.makeEngine(), "first");
	let secondaryId = manager.create_session("second", "secondary");
	let secondary = manager.secondary();

	secondary.event_sink.onReady(secondary, {processGeneration: 2, name: "Second"});
	secondary.event_sink.onStateChanged(secondary, {processGeneration: 2, searchState: "searching", searchId: 4});
	secondary.event_sink.onInfo(secondary, {processGeneration: 2, searchId: 4, depth: 10, pv: ["e2e4"]});
	secondary.event_sink.onBestmove(secondary, {processGeneration: 2, searchId: 4, move: "e2e4"});

	let session = manager.get_session(secondaryId);
	assert.equal(session.lifecycleState, "ready");
	assert.equal(session.processGeneration, 2);
	assert.equal(session.name, "Second");
	assert.equal(session.searchState, "searching");
	assert.equal(session.activeSearchId, 4);
	assert.equal(session.lastInfo.depth, 10);
	assert.equal(session.lastBestmove.move, "e2e4");
});

test("EngineManager assigns sessions to tabs independently", () => {
	let harness = loadManager();
	let manager = harness.NewEngineManager(makeHub());
	let primarySession = manager.attach_primary(harness.makeEngine(), "first");
	let secondaryId = manager.create_session("second", "secondary");

	assert.equal(manager.assign_to_tab(primarySession.sessionId, 1), true);
	assert.equal(manager.assign_to_tab(secondaryId, 1), true);
	assert.deepEqual(manager.sessions_for_tab(1).map(session => session.sessionId), [
		primarySession.sessionId,
		secondaryId,
	]);

	assert.equal(manager.assign_to_tab(secondaryId, 2), true);
	assert.deepEqual(manager.sessions_for_tab(1).map(session => session.sessionId), [primarySession.sessionId]);
	assert.deepEqual(manager.sessions_for_tab(2).map(session => session.sessionId), [secondaryId]);
	assert.equal(manager.unassign_from_tab(primarySession.sessionId), true);
	assert.equal(manager.sessions_for_tab(1).length, 0);
});

test("removing a session clears its tab membership", () => {
	let harness = loadManager();
	let tab = {id: 1, engine_session_ids: []};
	let hub = makeHub();
	hub.tab_manager = {find: id => id === tab.id ? tab : null};
	let manager = harness.NewEngineManager(hub);
	let session = manager.attach_primary(harness.makeEngine(), "first");

	manager.assign_to_tab(session.sessionId, tab.id);
	assert.deepEqual(tab.engine_session_ids, [session.sessionId]);
	manager.remove_session(session.sessionId);
	assert.deepEqual(tab.engine_session_ids, []);
});

test("EngineManager starts and stops analysis for all sessions on a tab", () => {
	let harness = loadManager();
	let manager = harness.NewEngineManager(makeHub());
	let primarySession = manager.attach_primary(harness.makeEngine(), "first");
	let secondaryId = manager.create_session("second", "secondary");
	manager.assign_to_tab(primarySession.sessionId, 1);
	manager.assign_to_tab(secondaryId, 1);
	let node = {id: "node-1"};
	let limits = {limit: 1000, limit_by_time: true, searchmoves: ["e2e4"]};
	manager.primary().ever_received_uciok = true;
	manager.primary().ever_received_readyok = true;
	manager.secondary().ever_received_uciok = true;
	manager.secondary().ever_received_readyok = true;

	assert.equal(manager.start_analysis(1, node, limits), true);
	assert.deepEqual(harness.created[0].searchRequests, [[node, 1000, true, ["e2e4"]]]);
	assert.deepEqual(harness.created[1].searchRequests, [[node, 1000, true, ["e2e4"]]]);
	assert.equal(manager.stop_analysis(1), true);
	assert.deepEqual(harness.created[0].stopped, [null]);
	assert.deepEqual(harness.created[1].stopped, [null]);
});

test("EngineManager dispatches pending analysis after readiness", () => {
	let harness = loadManager();
	let manager = harness.NewEngineManager(makeHub());
	let primarySession = manager.attach_primary(harness.makeEngine(), "first");
	let secondaryId = manager.create_session("second", "secondary");
	manager.assign_to_tab(primarySession.sessionId, 1);
	manager.assign_to_tab(secondaryId, 1);
	let node = {id: "node-2"};

	assert.equal(manager.start_analysis(1, node, {limit: 500}), true);
	assert.deepEqual(harness.created[0].searchRequests, []);
	assert.deepEqual(harness.created[1].searchRequests, []);

	harness.created[0].ever_received_uciok = true;
	harness.created[0].ever_received_readyok = true;
	harness.created[1].ever_received_uciok = true;
	harness.created[1].ever_received_readyok = true;
	manager.receive_misc(primarySession, "readyok");
	manager.secondary().event_sink.onReady(manager.secondary(), {processGeneration: 1});

	assert.equal(harness.created[0].searchRequests.length, 1);
	assert.equal(harness.created[1].searchRequests.length, 1);
	assert.equal(harness.created[0].searchRequests[0][0], node);
	assert.equal(harness.created[1].searchRequests[0][0], node);
});

test("EngineManager keeps MultiPV results isolated per session", () => {
	let harness = loadManager();
	let manager = harness.NewEngineManager(makeHub());
	let primarySession = manager.attach_primary(harness.makeEngine(), "first");
	let secondaryId = manager.create_session("second", "secondary");
	manager.assign_to_tab(primarySession.sessionId, 1);
	manager.assign_to_tab(secondaryId, 1);
	let primary = manager.get_session(primarySession.sessionId);
	let secondary = manager.get_session(secondaryId);
	primary.event_sink = manager.make_event_sink(primary);

	primary.event_sink.onStateChanged(primary.engine, {processGeneration: 1, searchState: "searching", searchId: 10});
	secondary.event_sink.onStateChanged(secondary.engine, {processGeneration: 1, searchState: "searching", searchId: 20});
	primary.event_sink.onInfo(primary.engine, {processGeneration: 1, searchId: 10, multipv: 1, depth: 12, pv: ["e2e4"]});
	primary.event_sink.onInfo(primary.engine, {processGeneration: 1, searchId: 9, multipv: 1, depth: 99, pv: ["d4"]});
	secondary.event_sink.onInfo(secondary.engine, {processGeneration: 1, searchId: 20, multipv: 1, depth: 8, pv: ["c4"]});

	let results = manager.get_results(1);
	assert.equal(results[primary.sessionId][0].depth, 12);
	assert.equal(results[primary.sessionId][0].pv[0], "e2e4");
	assert.equal(results[secondary.sessionId][0].pv[0], "c4");
});

test("EngineManager exposes consensus for a tab", () => {
	let harness = loadManager();
	let manager = harness.NewEngineManager(makeHub());
	let primarySession = manager.attach_primary(harness.makeEngine(), "first");
	let secondaryId = manager.create_session("second", "secondary");
	manager.assign_to_tab(primarySession.sessionId, 1);
	manager.assign_to_tab(secondaryId, 1);
	let primary = manager.get_session(primarySession.sessionId);
	let secondary = manager.get_session(secondaryId);
	primary.event_sink = manager.make_event_sink(primary);
	for (let session of [primary, secondary]) {
		session.event_sink.onStateChanged(session.engine, {processGeneration: 1, searchState: "searching", searchId: 1});
		session.event_sink.onInfo(session.engine, {processGeneration: 1, searchId: 1, multipv: 1, pv: ["e2e4"], score: {type: "cp", value: 20}});
	}

	let consensus = manager.get_consensus(1);
	assert.equal(consensus.bestMove, "e2e4");
	assert.equal(consensus.agreement.support, 2);
});

test("EngineManager starts comparison and assigns both sessions to a tab", () => {
	let harness = loadManager();
	let manager = harness.NewEngineManager(makeHub());
	let primarySession = manager.attach_primary(harness.makeEngine(), "first");
	manager.assign_to_tab(primarySession.sessionId, 1);

	let result = manager.start_comparison_for_tab(1, "first", "second");

	assert.equal(result.primarySessionId, primarySession.sessionId);
	assert.equal(manager.secondary_session_id(), result.secondarySessionId);
	assert.deepEqual(manager.sessions_for_tab(1).map(session => session.sessionId), [
		result.primarySessionId,
		result.secondarySessionId,
	]);
	assert.equal(harness.created[1].setupCalls[0].filepath, "second");
});

test("EngineManager stores temporary thread allocations per session", () => {
	let harness = loadManager();
	let manager = harness.NewEngineManager(makeHub(), {total_threads: 8});
	let primarySession = manager.attach_primary(harness.makeEngine(), "first");
	let secondaryId = manager.create_session("second", "secondary");
	manager.assign_to_tab(primarySession.sessionId, 1);
	manager.assign_to_tab(secondaryId, 1);
	manager.get_session(primarySession.sessionId).requestedThreads = 8;
	manager.get_session(secondaryId).requestedThreads = 8;

	let allocations = manager.allocate_resources(1, "balanced");

	assert.deepEqual(allocations, {
		[primarySession.sessionId]: 4,
		[secondaryId]: 4,
	});
	assert.equal(manager.get_session(secondaryId).allocatedThreads, 4);
});

test("EngineManager advances game analysis after all sessions finish a position", () => {
	let harness = loadManager();
	let manager = harness.NewEngineManager(makeHub());
	let primarySession = manager.attach_primary(harness.makeEngine(), "first");
	let secondaryId = manager.create_session("second", "secondary");
	manager.assign_to_tab(primarySession.sessionId, 1);
	manager.assign_to_tab(secondaryId, 1);
	let primary = manager.get_session(primarySession.sessionId);
	let secondary = manager.get_session(secondaryId);
	primary.event_sink = manager.make_event_sink(primary);
	for (let session of [primary, secondary]) {
		session.engine.ever_received_uciok = true;
		session.engine.ever_received_readyok = true;
	}

	assert.equal(manager.start_game_analysis(1, [{positionId: "p1", node: {id: "node-1"}}], {limit: 100}), true);
	for (let session of [primary, secondary]) {
		session.event_sink.onStateChanged(session.engine, {processGeneration: 1, searchState: "searching", searchId: 1});
		session.event_sink.onInfo(session.engine, {processGeneration: 1, searchId: 1, multipv: 1, pv: ["e2e4"], score: {type: "cp", value: 20}});
		session.event_sink.onBestmove(session.engine, {processGeneration: 1, searchId: 1, move: "e2e4"});
	}

	let status = manager.game_analysis_status(1);
	assert.equal(status.done, true);
	assert.equal(status.results.length, 1);
	assert.equal(status.results[0].positionId, "p1");
});
