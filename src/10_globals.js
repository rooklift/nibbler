"use strict";

// HTML stuff.......................................................
//
// All of this may be redundant since id-havers are in the global
// namespace automatically. But declaring them const has some value.

const boardfriends = document.getElementById("boardfriends");
const boardsquares = document.getElementById("boardsquares");
const canvas = document.getElementById("canvas");
const fenbox = document.getElementById("fenbox");
const graph = document.getElementById("graph");
const graphbox = document.getElementById("graphbox");
const infobox = document.getElementById("infobox");
const movelist = document.getElementById("movelist");
const pgnchooser = document.getElementById("pgnchooser");
const promotiontable = document.getElementById("promotiontable");
const statusbox = document.getElementById("statusbox");

// If require isn't available, we're in a browser:

try {
	require("./modules/empty");
} catch (err) {
	statusbox.innerHTML = `Running Nibbler in a normal browser doesn't work. For the full app, see the
	<a href="https://github.com/rooklift/nibbler/releases">Releases section</a> of the repo.<br><br>

	It has also been observed not to work if your path contains a % character.`;
}

// Requires.........................................................

const background = require("./modules/background");
const child_process = require("child_process");
const clipboard = require("electron").clipboard;
const config_io = require("./modules/config_io");
const custom_uci = require("./modules/custom_uci");
const engineconfig_io = require("./modules/engineconfig_io");
const fs = require("fs");
const images = require("./modules/images");
const ipcRenderer = require("electron").ipcRenderer;
const messages = require("./modules/messages");
const path = require("path");
const readline = require("readline");
const stringify = require("./modules/stringify");
const util = require("util");

// Globals..........................................................

const boardctx = canvas.getContext("2d");
const graphctx = graph.getContext("2d");
const decoder = new util.TextDecoder("utf8");	// https://github.com/electron/electron/issues/18733

let [load_err1, config]       = config_io.load();
let [load_err2, engineconfig] = engineconfig_io.load();

let next_node_id = 1;
let live_nodes = Object.create(null);

// Replace the renderer's built-in alert()..........................

let alert = (msg) => {
	ipcRenderer.send("alert", stringify(msg));
};

// Get the images loading...........................................

if (images.validate_folder(config.override_piece_directory)) {
	images.load_from(config.override_piece_directory);
} else {
	images.load_from(path.join(__dirname, "pieces"));
}

// Debug (see start.js).............................................

let debuggo = Object.create(null);

// Standard options, for either type of engine......................
// The following are sent to all engines unless present in the
// suppressed lists below.

const standard_engine_options = {
	"Contempt": 0,
	"LogLiveStats": true,
	"ScoreType": "centipawn",
	"SmartPruningFactor": 0,
	"UCI_ShowWDL": true,
	"VerboseMoveStats": true,
};

// Options we don't want to send to specific engine types, as a sort of set. LOWERCASE KEYS!

const suppressed_options_lc0 = Object.fromEntries(
	["Contempt", "EvalFile", "Hash", "MultiPV"]
	.map(s => [s.toLowerCase(), true]));

const suppressed_options_ab = Object.fromEntries(
	["Backend", "LogLiveStats", "ScoreType", "SmartPruningFactor", "TempDecayMoves", "Temperature", "VerboseMoveStats", "WeightsFile"]
	.map(s => [s.toLowerCase(), true]));

// Yeah this seemed a good idea at the time.........................

const limit_options = [
	1, 2, 5, 10, 50, 100, 200, 300, 400, 500, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600, 2800, 3000, 3200,
	3400, 3600, 3800, 4000, 4200, 4400, 4600, 4800, 5000, 5500, 6000, 6500, 7000, 7500, 8000, 8500, 9000, 9500, 10000,
	12000, 14000, 16000, 18000, 20000, 22000, 24000, 26000, 28000, 30000, 32000, 34000, 36000, 38000, 40000, 42000, 44000,
	46000, 48000, 50000, 55000, 60000, 65000, 70000, 75000, 80000, 85000, 90000, 95000, 100000, 120000, 140000, 160000,
	180000, 200000, 220000, 240000, 260000, 280000, 300000, 320000, 340000, 360000, 380000, 400000, 420000, 440000, 460000,
	480000, 500000, 550000, 600000, 650000, 700000, 750000, 800000, 850000, 900000, 950000, 1000000, 1200000, 1400000,
	1600000, 1800000, 2000000, 2200000, 2400000, 2600000, 2800000, 3000000, 3200000, 3400000, 3600000, 3800000, 4000000,
	4200000, 4400000, 4600000, 4800000, 5000000, 5500000, 6000000, 6500000, 7000000, 7500000, 8000000, 8500000, 9000000,
	9500000, 10000000, 12000000, 14000000, 16000000, 18000000, 20000000, 25000000, 30000000, 35000000, 40000000, 45000000,
	50000000, 60000000, 70000000, 80000000, 90000000, 100000000, 120000000, 140000000, 160000000, 180000000, 200000000,
	220000000, 240000000, 260000000, 280000000, 300000000, 350000000, 400000000, 450000000, 500000000, 550000000,
	600000000, 650000000, 700000000, 750000000, 800000000, 850000000, 900000000, 950000000, 1000000000
];

limit_options.sort((a, b) => a - b);
