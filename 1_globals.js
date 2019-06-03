"use strict";

// Requires.........................................................

const alert = require("./modules/alert");
const assign_without_overwrite = require("./modules/utils").assign_without_overwrite;
const child_process = require("child_process");
const fs = require('fs');
const ipcRenderer = require("electron").ipcRenderer;
const readline = require("readline");

// HTML stuff.......................................................

const canvas = document.getElementById("canvas");
const fenbox = document.getElementById("fenbox");
const infobox = document.getElementById("infobox");
const mainline = document.getElementById("mainline");
const pgnchooser = document.getElementById("pgnchooser");

const context = canvas.getContext("2d");

const light = "#dadada";
const dark = "#b4b4b4";
const act = "#cc9966";

// Global variables.................................................

let config = {};
let exe = null;
let scanner = null;
let err_scanner = null;
let readyok_required = false;

let __decoder = new TextDecoder("utf-8");

let total_moves_made = 0;		// For debugging / info
let total_positions_made = 0;	// For debugging / info
