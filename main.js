"use strict";

const alert = require("./modules/alert");
const electron = require("electron");
const fs = require("fs");
const windows = require("./modules/windows");

let config = {};

try {
	if (fs.existsSync("config.json")) {
		config = JSON.parse(fs.readFileSync("config.json", "utf8"));
	} else if (fs.existsSync("config.json.example")) {
		config = JSON.parse(fs.readFileSync("config.json.example", "utf8"));
	}
} catch (err) {
	// pass
}

if (config.width === undefined || config.width <= 0) {
	config.width = 1280;
}

if (config.height === undefined || config.height <= 0) {
	config.height = 800;
}

electron.app.on("ready", () => {
	windows.new("main-window", {width: config.width, height: config.height, page: "nibbler.html"});
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
					role: "quit",
					label: "Quit",
					accelerator: "CommandOrControl+Q"
				},
				{
					role: "toggledevtools"
				}
			]
		},
		{
			label: "Navigation",
			submenu: [
				{
					label: "New Game",
					accelerator: "CommandOrControl+N",
					click: () => {
						windows.send("main-window", "new", null);
					}
				},
				{
					label: "Play Best",
					accelerator: "CommandOrControl+D",
					click: () => {
						windows.send("main-window", "play_best", null);
					}
				},
				{
					label: "Undo",
					accelerator: "CommandOrControl+Z",
					click: () => {
						windows.send("main-window", "undo", null);
					}
				}
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
				}
			]
		}
	];

	const menu = electron.Menu.buildFromTemplate(template);
	electron.Menu.setApplicationMenu(menu);
}
