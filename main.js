"use strict";

const alert = require("./modules/alert");
const electron = require("electron");
const windows = require("./modules/windows");

electron.app.on("ready", () => {
	windows.new("main-window", {width: 1200, height: 720, page: "nibbler.html"});
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
					label: "Stop",
					click: () => {
						windows.send("main-window", "stop", null);
					}
				}
			]
		}
	];

	const menu = electron.Menu.buildFromTemplate(template);
	electron.Menu.setApplicationMenu(menu);
}
