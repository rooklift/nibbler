"use strict";

const alert = require("./modules/alert");
const assign_without_overwrite = require("./modules/utils").assign_without_overwrite;
const child_process = require("child_process");
const fs = require('fs');
const ipcRenderer = require("electron").ipcRenderer;
const readline = require("readline");

const fenbox = document.getElementById("fenbox");
const canvas = document.getElementById("canvas");
const infobox = document.getElementById("infobox");
const mainline = document.getElementById("mainline");
const context = canvas.getContext("2d");

const light = "#dadada";
const dark = "#b4b4b4";
const act = "#cc9966";

const log_to_engine = true;
const log_engine_stderr = true;
const log_engine_stdout = false;
