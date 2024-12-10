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
const rightgridder = document.getElementById("rightgridder");
const infobox = document.getElementById("infobox");
const movelist = document.getElementById("movelist");
const fullbox = document.getElementById("fullbox");
const fullbox_content = document.getElementById("fullbox_content");
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
const querystring = require("querystring");
const readline = require("readline");
const stringify = require("./modules/stringify");
const util = require("util");

// Prior to v32, given a file object from an event (e.g. from dragging the file onto the window)
// we could simply access its path, but afterwards we need to use a helper function...

let webUtils = require("electron").webUtils;
const get_path_for_file = (webUtils && webUtils.getPathForFile) ? webUtils.getPathForFile : file => file.path;

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

// Standard options, for either type of engine......................
// Note that UCI_Chess960 is handled specially by engine.js

const forced_lc0_options = {		// These are sent without checking if they are known by the engine, so it doesn't matter
	"LogLiveStats": true,			// if Leela is hiding them. Nevertheless, the user can still override them in engines.json.
	"MoveOverheadMs": 0,
	"MultiPV": 500,
	"ScoreType": "WDL_mu",
	"SmartPruningFactor": 0,
	"UCI_ShowWDL": true,
	"VerboseMoveStats": true,
};

const standard_lc0_options = {		// These are only sent if known by the engine.
	"ContemptMode": "white_side_analysis",
	"Contempt": 0,
	"WDLCalibrationElo": 0,
	"WDLEvalObjectivity": 0,
};

const forced_ab_options = {};

const standard_ab_options = {
	"Contempt": 0,
	"Move Overhead": 0,
	"UCI_ShowWDL": true,
};

// Yeah this seemed a good idea at the time.........................

const limit_options = [
	1, 2, 5, 10, 20, 50, 100, 125, 160, 200, 250, 320, 400, 500, 640, 800,
	1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400, 8000, 10000, 12500,
	16000, 20000, 25000, 32000, 40000, 50000, 64000, 80000, 100000, 125000,
	160000, 200000, 250000, 320000, 400000, 500000, 640000, 800000, 1000000,
	1250000, 1600000, 2000000, 2500000, 3200000, 4000000, 5000000, 6400000,
	8000000, 10000000, 12500000, 16000000, 20000000, 25000000, 32000000,
	40000000, 50000000, 64000000, 80000000, 100000000, 125000000, 160000000,
	200000000, 250000000, 320000000, 400000000, 500000000, 640000000,
	800000000, 1000000000
];

limit_options.sort((a, b) => a - b);
