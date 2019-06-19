"use strict";

// Requires.........................................................

const alert = require("./modules/alert");
const assign_without_overwrite = require("./modules/utils").assign_without_overwrite;
const child_process = require("child_process");
const debork_json = require("./modules/debork_json");
const fs = require("fs");
const ipcRenderer = require("electron").ipcRenderer;
const path = require("path");
const readline = require("readline");
const util = require("util");

// HTML stuff.......................................................
//
// All of this may be redundant since id-havers are in the global
// namespace automatically. But declaring them const has some value.

const boardfriends = document.getElementById("boardfriends");
const boardsquares = document.getElementById("boardsquares");
const canvas = document.getElementById("canvas");
const fenbox = document.getElementById("fenbox");
const infobox = document.getElementById("infobox");
const movelist = document.getElementById("movelist");
const pgnchooser = document.getElementById("pgnchooser");

// Globals..........................................................

const context = canvas.getContext("2d");
const decoder = new util.TextDecoder("utf8");

let config = {};
let total_tree_changes = 0;
