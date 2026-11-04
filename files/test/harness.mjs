import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "..", "src");
const renderer = path.join(src, "renderer");

const LOAD_ORDER = [
	"20_utils.js",
	"30_point.js",
	"31_sliders.js",
	"40_position.js",
	"41_fen.js",
	"50_table.js",
	"51_node.js",
	"60_pgn_utils.js",
	"61_pgn_parse.js",
	"71_tree_handler.js",
	"72_tree_draw.js",
	"90_engine.js",
];

export function make_context() {
	const config = {
		graph_minimum_length: 0,
		ev_pov: false,
		cp_pov: false,
		wdl_pov: false,
		pgn_ev: false,
		pgn_cp: false,
		pgn_n: false,
		pgn_n_abs: false,
		pgn_of_n: false,
		pgn_depth: false,
		pgn_wdl: false,
		pgn_p: false,
		pgn_m: false,
		pgn_v: false,
		pgn_q: false,
		pgn_u: false,
		pgn_s: false,
		searchmoves_buttons: false,
		log_positions: false,
	};

	const context = vm.createContext({
		console,
		Buffer,
		TextDecoder,
		TextEncoder,
		decoder: new TextDecoder(),
		config,
		next_node_id: 1,
		live_nodes: Object.create(null),
		alert: () => {},
		Log: () => {},
		document: {
			getElementById: () => null,
			querySelector: () => null,
			querySelectorAll: () => [],
			createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} }),
		},
	});

	for (const f of LOAD_ORDER) {
		const filename = path.join(renderer, f);
		vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename });
	}
	return context;
}

export function run(context, code) {
	return vm.runInContext(code, context);
}

export function start_position(context, fen) {
	return run(context, `LoadFEN(${JSON.stringify(fen)})`);
}
