"use strict";

const alert = require("./modules/alert");
const electron = require("electron");
const fs = require("fs");
const path = require("path");
const windows = require("./modules/windows");

let config = {};

try {
	let cj  = path.join(__dirname, "config.json");
	let cje = path.join(__dirname, "config.json.example");

	if (fs.existsSync(cj)) {
		config = JSON.parse(fs.readFileSync(cj, "utf8"));
	} else if (fs.existsSync(cje)) {
		config = JSON.parse(fs.readFileSync(cje, "utf8"));
		config.warn_filename = true;
	}
} catch (err) {
	// pass
}

if (config.width === undefined || config.width <= 0) {
	config.width = 1280;
}

if (config.height === undefined || config.height <= 0) {
	config.height = 840;
}

electron.app.on("ready", () => {
	windows.new("main-window", {width: config.width, height: config.height, page: path.join(__dirname, "nibbler.html")});
	menu_build();
});

electron.app.on("window-all-closed", () => {
	electron.app.quit();
});

function menu_build() {
	const template = [
		{
			label: "App",
			submenu: [
				{
					label: "About",
					click: () => {
						alert("Nibbler, running under Electron " + process.versions.electron);
					}
				},
				{
					role: "toggledevtools"
				},
				{
					type: "separator"
				},
				{
					label: "New Game",
					accelerator: "CommandOrControl+N",
					click: () => {
						windows.send("main-window", "new", null);
					}
				},
				{
					label: "Open...",
					accelerator: "CommandOrControl+O",
					click: () => {
						let files = electron.dialog.showOpenDialog({
							properties: ["openFile"]
						});
						if (files && files.length > 0) {
							windows.send("main-window", "open", files[0]);
						}
					}
				},
				{
					type: "separator"
				},
				{
					role: "quit",
					label: "Quit",
					accelerator: "CommandOrControl+Q"
				},
			]
		},
		{
			label: "Navigation",
			submenu: [
				{
					label: "Play Best",
					accelerator: "CommandOrControl+D",
					click: () => {
						windows.send("main-window", "play_best", null);
					}
				},
				{
					type: "separator"
				},
				{
					label: "Backward",
					accelerator: "Left",
					click: () => {
						windows.send("main-window", "prev", null);
					}
				},
				{
					label: "Forward in PGN",
					accelerator: "Right",
					click: () => {
						windows.send("main-window", "next", null);
					}
				},
				{
					type: "separator"
				},
				{
					label: "Root",
					accelerator: "Home",
					click: () => {
						windows.send("main-window", "root", null);
					}
				},
				{
					label: "End of PGN",
					accelerator: "End",
					click: () => {
						windows.send("main-window", "pgn_end", null);
					}
				},
			]
		},
		{
			label: "Analysis",
			submenu: [
				{
					label: "Go",
					accelerator: "CommandOrControl+G",
					click: () => {
						windows.send("main-window", "go", null);
					}
				},
				{
					label: "Halt",
					accelerator: "CommandOrControl+H",
					click: () => {
						windows.send("main-window", "halt", null);
					}
				},
			]
		}
	];

	const menu = electron.Menu.buildFromTemplate(template);
	electron.Menu.setApplicationMenu(menu);
}
