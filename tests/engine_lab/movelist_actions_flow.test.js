"use strict";

// Stress test for the movelist context-menu actions (Delete node / Promote /
// Delete children / etc.) interacting with the undo stack, a running engine,
// and tab state — using the REAL renderer modules (51_node, 60_pgn_utils,
// 68_undo_stack, 71_tree_handler, 72_tree_draw, 90_engine, 95_hub).
//
// Goal: reproduce the reported bug where right-click menu actions
// "sometimes" do nothing (delete/promote of variations).

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const SRC = path.join(__dirname, "../../files/src/renderer");

function loadAll() {
	let processes = [];
	let scanners = [];
	let writes = [];
	let ipcMessages = [];

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

	let movelist = {
		innerHTML: "",
		scrollTop: 0,
		offsetTop: 0,
		offsetHeight: 100,
		offsetWidth: 100,
		style: {},
		addEventListener: () => {},
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
			position_annotations: require("../../files/src/modules/position_annotations"),
		next_node_id: 1,
		live_nodes: Object.create(null),
		performance: {now: () => 0},
		alert: () => {},
		Log: () => {},
		LogBoth: () => {},
		SafeStringHTML: value => value,
		CommaNum: n => n,
		document: {
			getElementById: () => null,
			getElementsByClassName: () => [],
		},
		movelist,
		config: {
			graph_minimum_length: 41,
			allow_stopped_analysis: false,
			suppress_ucinewgame: false,
			searchmoves_buttons: false,
			leelaish_names: ["Lc0", "Ceres"],
			auto_analysis_time_ms: 10000,
		},
		engineconfig: {
			"C:\\fake.exe": {
				args: [],
				options: {MultiPV: 2},
				search_nodes: 1000,
				search_nodes_special: 10000,
				limit_by_time: false,
			},
		},
		engine_display: {name_from_id_line: s => s.slice("id name ".length).trim()},
		enginebox: {innerHTML: ""},
		ipcRenderer: {send: (...args) => ipcMessages.push(args)},
		drag_handler: {cancel_drag: () => {}},
		fenbox: {value: ""},
		forced_lc0_options: {},
		forced_ab_options: {},
		standard_lc0_options: {},
		standard_ab_options: {},
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
		require: modulePath => {
				if (modulePath === "../modules/engine_lab" || modulePath === "./modules/engine_lab") {
				return require("../../files/src/modules/engine_lab");
			}
				if (modulePath === "../modules/movelist_context_menu" || modulePath === "./modules/movelist_context_menu") {
				return require("../../files/src/modules/movelist_context_menu");
			}
			throw new Error(`Unexpected module: ${modulePath}`);
		},
	};

	// A minimal fake board (real boards would drag in 40_position.js).
	function FakeBoard(active = "w") {
		return {
			active,
			halfmove: 0,
			state: [],
			move: () => FakeBoard(active === "w" ? "b" : "w"),
			fen: () => "startpos",
			nice_string: move => String(move),
			next_number_string: () => "1",
			compare: () => false,
		};
	}

	context.FakeBoard = FakeBoard;
	context.build_movelist_context_menu_state = require("../../files/src/modules/movelist_context_menu").build_movelist_context_menu_state;
	context.NewTable = function() {
		return {
			moveinfo: {},
			already_autopopulated: true,
			autopopulate() {},
			get_graph_y: () => 0,
			reset_all() {},
			set_terminal_info() {},
		};
	};

	vm.createContext(context);

	for (let file of ["20_utils.js", "30_point.js", "31_sliders.js", "40_position.js", "41_fen.js", "51_node.js", "60_pgn_utils.js", "68_undo_stack.js", "72_tree_draw.js", "71_tree_handler.js", "90_engine.js", "95_hub.js"]) {
		let source = fs.readFileSync(path.join(SRC, file), "utf8");
		vm.runInContext(source, context);
	}
	vm.runInContext("this.__NewEngine = NewEngine; this.__hub_props = hub_props; this.__NewTreeHandler = NewTreeHandler; this.__NewUndoStack = NewUndoStack;", context);

	return {
		NewEngine: context.__NewEngine,
		hub_props: context.__hub_props,
		NewTreeHandler: context.__NewTreeHandler,
		NewUndoStack: context.__NewUndoStack,
		FakeBoard,
		context,
		processes,
		scanners,
		writes,
		movelist,
		ipcMessages,
	};
}

function makeHub(all, engine, tree) {
	let hub = Object.create(null);
	Object.assign(hub, all.hub_props);

	hub.engine = engine;
	hub.tree = tree || all.NewTreeHandler();
	hub.undo_stack = all.NewUndoStack(hub);

	hub.engine_manager = {handle_event: () => false, mirror_primary_search: () => {}};
	hub.tab_manager = {active: () => ({id: 1}), active_tab_id: 1, count: () => 1, tabs: []};
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
	hub.fenbox = {value: ""};
	hub.info_handler = {engine_cycle: 0, engine_subcycle: 0, must_draw_infobox: () => {}, err_receive: () => {}, receive: () => {}};

	return hub;
}

// Build: root -> n1 -> n2 (main line), plus variation n1 -> n3 -> n4.
function buildVariationTree(all) {
	let tree = all.NewTreeHandler();		// Real root board from LoadFEN.
	tree.make_move("e2e4");		// n1
	tree.make_move("e7e5");		// n2
	// Go back to n1 and play a variation.
	tree.set_node(tree.node.parent);			// n1
	tree.make_move("g8f6");			// n3
	tree.make_move("b1c3");			// n4
	return tree;
}

function menuState(hub) {
	let mod = require("../../files/src/modules/movelist_context_menu");
	return mod.build_movelist_context_menu_state(hub.tree.node);
}

function setupEngine(all, hub) {
	let engine = all.NewEngine({}, {event_sink: hub, ack_to_main: false});
	hub.engine = engine;
	engine.event_sink = hub;
	engine.setup("C:\\fake.exe", []);
	// setup() creates two readline interfaces (stdout, stderr); the stdout one is second-to-last.
	let scanner = all.scanners[all.scanners.length - 2];
	scanner.emit("line", "id name FakeEngine");
	scanner.emit("line", "uciok");
	scanner.emit("line", "readyok");
	return {engine, scanner};
}

// ---------------------------------------------------------------------- tests

test("delete variation node via context menu action, engine running", () => {
	let all = loadAll();
	let tree = buildVariationTree(all);
	let hub = makeHub(all, null, tree);
	let {scanner} = setupEngine(all, hub);

	// Position the user on the variation node n3, engine analysing it.
	let n1 = tree.root.children[0];
	let n3 = n1.children[1];
	tree.set_node(n3);
	hub.set_behaviour("analysis_free");		// engine starts searching n3

	// Sanity: the right-click menu state for n3.
	let state = menuState(hub);
	assert.equal(state.can_delete_node, true, "Delete node should be enabled on a variation node");
	assert.equal(state.can_promote, true, "Promote should be enabled (n3 is not first child)");
	assert.equal(state.can_delete_children, true, "n3 has a child");

	// Simulate menu item "Delete node".
	hub.delete_node();

	// n3 (and its child n4) must be gone: n1 keeps only the main-line child n2,
	// and the user now sits on n1.
	assert.equal(n1.children.length, 1);
	assert.equal(n1.children[0], n1.children[0] && tree.root.children[0].children[0]);
	assert.equal(tree.node, n1);

	// The engine should resume analysing n1 once the old search stops.
	scanner.emit("line", "bestmove e2e4");
	let goCommands = all.writes.filter(w => w.startsWith("go"));
	assert.ok(goCommands.length > 0, "engine should get a go command after delete");
});

function reachableFromRoot(tree, node) {
	let n = node;
	while (n.parent) n = n.parent;
	return n === tree.root;
}

test("delete / promote / undo / redo stress loop with engine running", () => {
	let all = loadAll();
	let tree = buildVariationTree(all);
	let hub = makeHub(all, null, tree);
	setupEngine(all, hub);

	let errors = [];

	for (let i = 0; i < 5; i++) {
		// Ensure the variation exists (the previous iteration's redo deletes it).
		tree.set_node(tree.root.children[0]);			// n1
		if (tree.node.children.length < 2) {
			tree.make_move("g8f6");					// recreate variation n3
		}
		tree.set_node(tree.node.children[1]);			// n3
		try {
			hub.delete_node();
		} catch (err) {
			errors.push(`delete: ${err.message}`);
		}
		try {
			hub.undo();
			// After undo, tree.node must be a live node inside the current tree,
			// otherwise subsequent menu actions silently no-op.
			if (!reachableFromRoot(tree, tree.node)) {
				errors.push(`undo: tree.node not in tree (id ${tree.node.id})`);
			}
		} catch (err) {
			errors.push(`undo: ${err.message}`);
		}
		try {
			hub.redo();
			if (!reachableFromRoot(tree, tree.node)) {
				errors.push(`redo: tree.node not in tree (id ${tree.node.id})`);
			}
		} catch (err) {
			errors.push(`redo: ${err.message}`);
		}
	}

	assert.deepEqual(errors, []);
	// After the final redo the variation is deleted again; the main line is intact.
	assert.equal(tree.root.children[0].children.length, 1, "n1 must have only the main-line child after redo");
	assert.equal(tree.root.children[0].children[0].move, "e7e5");
});

test("delete -> undo -> play a new move -> delete again keeps the tree consistent", () => {
	let all = loadAll();
	let tree = buildVariationTree(all);
	let hub = makeHub(all, null, tree);
	setupEngine(all, hub);

	tree.set_node(tree.root.children[0].children[1]);		// n3
	hub.delete_node();										// variation gone
	hub.undo();												// variation restored (cloned tree)

	// tree.node must be a live node in the restored tree.
	assert.ok(reachableFromRoot(tree, tree.node), "tree.node must be in tree after undo");

	// Play a NEW variation move on the restored tree.
	tree.set_node(tree.root.children[0]);
	tree.make_move("g8f6");			// new variation node
	let n1 = tree.root.children[0];
	assert.equal(n1.children.length, 2);
	tree.set_node(n1.children[1]);
	hub.delete_node();				// delete the new variation
	assert.equal(n1.children.length, 1);
	assert.equal(n1.children[0].move, "e7e5");
});

test("right-click menu state targets the clicked variation node, not the current node", () => {
	let all = loadAll();
	let tree = buildVariationTree(all);
	let hub = makeHub(all, null, tree);

	// User sits on the main line (n2); the menu must reflect the RIGHT-CLICKED
	// variation node n3 when node_from_click resolves it.
	let n3 = tree.root.children[0].children[1];
	tree.set_node(tree.root.children[0].children[0]);		// n2 (current)

	let state = menuState(hub);
	// ...but with node_from_click returning null (e.g. right-click on a bracket
	// or a gap), the menu state is built for the CURRENT node instead of the
	// clicked one — reproduce that failure: current node n2 is first child on
	// the main line, so "Promote line by 1 level" is disabled even though the
	// user's intent was to promote the variation n3.
	assert.equal(state.can_promote, false, "n2 (main line, first child) cannot be promoted");
	assert.equal(state.can_delete_node, true, "n2 can still be deleted");
});

test("right-click off a move span does not open the menu (wrong-node menu)", () => {
	let all = loadAll();
	let tree = buildVariationTree(all);
	let hub = makeHub(all, null, tree);

	let n3 = tree.root.children[0].children[1];
	tree.set_node(n3);

	// Right-click on the current node's span: menu must open for n3.
	let onSpanEvent = {
		preventDefault() {},
		path: [{id: "movelist"}, {id: `node_${n3.id}`}, {id: "html"}],
	};
	hub.show_movelist_context_menu(onSpanEvent);
	let sent = all.ipcMessages.filter(m => m[0] === "show_movelist_context_menu");
	assert.equal(sent.length, 1, "menu should open when a move span is right-clicked");
	assert.equal(sent[0][1].can_delete_node, true);

	// Right-click on a variation bracket / gap (no node_ span in the path):
	// the menu must NOT open — previously it opened for the CURRENT node,
	// showing delete/promote actions for the wrong node (or disabled items).
	all.ipcMessages.length = 0;
	let offSpanEvent = {
		preventDefault() {},
		path: [{id: "movelist"}, {id: "html"}],
	};
	hub.show_movelist_context_menu(offSpanEvent);
	sent = all.ipcMessages.filter(m => m[0] === "show_movelist_context_menu");
	assert.equal(sent.length, 0, "menu must not open when no move span was right-clicked");
});
