"use strict";

const alert = require("./modules/alert");
const debork_json = require("./modules/debork_json");
const electron = require("electron");
const fs = require("fs");
const path = require("path");
const windows = require("./modules/windows");

let config = {};

try {
	let config_filename = path.join(get_main_folder(), "config.json");
	let config_example_filename = path.join(get_main_folder(), "config.example.json");

	if (fs.existsSync(config_filename)) {
		config = JSON.parse(debork_json(fs.readFileSync(config_filename, "utf8")));
	} else if (fs.existsSync(config_example_filename)) {
		config = JSON.parse(debork_json(fs.readFileSync(config_example_filename, "utf8")));
	} else {
		console.log("Main process couldn't find config file. Looked at:");
		console.log("   " + config_filename);
	}
} catch (err) {
	console.log("Main process couldn't parse config file.")
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

electron.ipcMain.on("renderer_ready", () => {

	// Open a file via command line. We must wait until the renderer has properly loaded before we do this.
	// Also some awkwardness around the different ways Nibbler can be started, meaning the number of arguments
	// we get can be different.

	let filename = "";

	if (path.basename(process.argv[0]) === "electron" || path.basename(process.argv[0]) === "electron.exe") {
		if (process.argv.length > 2) {
			filename = process.argv[process.argv.length - 1];
		}
	} else {
		if (process.argv.length > 1) {
			filename = process.argv[process.argv.length - 1];
		}
	}

	if (filename !== "") {
		windows.send("main-window", "call", {
			fn: "open",
			args: [filename]
		});
	}
});

function menu_build() {
	const template = [
		{
			label: "App",
			submenu: [
				{
					label: "About",
					click: () => {
						alert(`Nibbler ${electron.app.getVersion()}, running under Electron ${process.versions.electron}`);
					}
				},
				{
					type: "separator"
				},
				{
					label: "New Game",
					accelerator: "CommandOrControl+N",
					click: () => {
						windows.send("main-window", "call", "new_game");
					}
				},
				{
					type: "separator"
				},
				{
					label: "Open PGN...",
					accelerator: "CommandOrControl+O",
					click: () => {
						let files = electron.dialog.showOpenDialog({
							properties: ["openFile"]
						});
						if (files && files.length > 0) {
							windows.send("main-window", "call", {
								fn: "open",
								args: [files[0]]
							});
						}
					}
				},
				{
					label: "Save PGN...",
					accelerator: "CommandOrControl+S",
					click: () => {
						let file = electron.dialog.showSaveDialog();
						if (file && file.length > 0) {
							windows.send("main-window", "call", {
								fn: "save",
								args: [file]
							});
						}
					}
				},
				{
					label: "Validate PGN...",
					click: () => {
						let files = electron.dialog.showOpenDialog({
							properties: ["openFile"]
						});
						if (files && files.length > 0) {
							windows.send("main-window", "call", {
								fn: "validate_pgn",
								args: [files[0]]
							});
						}
					}
				},
				{
					type: "separator"
				},
				{
					label: "Load PGN from clipboard",
					click: () => {
						windows.send("main-window", "call", {
							fn: "load_pgn_from_string",
							args: [electron.clipboard.readText()]
						});
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
					label: "Play Choice",
					submenu: [
						{
						label: "1st",
						accelerator: "F1",
						click: () => {
							windows.send("main-window", "call", {
								fn: "play_info_index",
								args: [0]
							})}
						},
						{
						label: "2nd",
						accelerator: "F2",
						click: () => {
							windows.send("main-window", "call", {
								fn: "play_info_index",
								args: [1]
							})}
						},
						{
						label: "3rd",
						accelerator: "F3",
						click: () => {
							windows.send("main-window", "call", {
								fn: "play_info_index",
								args: [2]
							})}
						},
						{
						label: "4th",
						accelerator: "F4",
						click: () => {
							windows.send("main-window", "call", {
								fn: "play_info_index",
								args: [3]
							})}
						},
					]
				},
				{
					type: "separator"
				},
				{
					label: "Root",
					accelerator: "Home",
					click: () => {
						windows.send("main-window", "call", "goto_root");
					}
				},
				{
					label: "End",
					accelerator: "End",
					click: () => {
						windows.send("main-window", "call", "goto_end");
					}
				},
				{
					label: "Backward",
					accelerator: "Left",
					click: () => {
						windows.send("main-window", "call", "prev");
					}
				},
				{
					label: "Forward",
					accelerator: "Right",
					click: () => {
						windows.send("main-window", "call", "next");
					}
				},
				{
					type: "separator"
				},
				{
					label: "Return to main line",
					accelerator: "CommandOrControl+R",
					click: () => {
						windows.send("main-window", "call", "return_to_main_line");
					}
				},
				{
					label: "Make this the main line",
					accelerator: "CommandOrControl+M",
					click: () => {
						windows.send("main-window", "call", "promote_to_main_line");
					}
				},
				{
					type: "separator"
				},
				{
					label: "Delete move",
					accelerator: "CommandOrControl+Backspace",
					click: () => {
						windows.send("main-window", "call", "delete_move");
					}
				},
				{
					type: "separator"
				},
				{
					label: "Show PGN games list",
					accelerator: "CommandOrControl+P",
					click: () => {
						windows.send("main-window", "call", "show_pgn_chooser");
					}
				},
				{
					label: "Escape",
					accelerator: "Escape",
					click: () => {
						windows.send("main-window", "call", "escape");
					}
				},
				{
					type: "separator"
				},
				{
					label: "Flip Board",
					accelerator: "CommandOrControl+F",
					click: () => {
						windows.send("main-window", "toggle", "flip");
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
						windows.send("main-window", "call", "go");
					}
				},
				{
					label: "Halt",
					accelerator: "CommandOrControl+H",
					click: () => {
						windows.send("main-window", "call", "halt");
					}
				},
				{
					type: "separator"
				},
				{
					label: "Switch weights file...",
					click: () => {
						let files = electron.dialog.showOpenDialog({
							properties: ["openFile"]
						});
						if (files && files.length > 0) {
							windows.send("main-window", "call", {
								fn: "switch_weights",
								args: [files[0]]
							});
						}
					}
				},
				{
					label: "Reset Lc0 cache",
					click: () => {
						windows.send("main-window", "call", "reset_leela_cache");
					}
				},
				{
					type: "separator"
				},
				{
					label: "Move display",
					submenu: [
						{
							label: "All",
							click: () => {
								windows.send("main-window", "set", {
									key: "node_display_threshold",
									value: 0
								});
							}
						},
						{
							label: "Very many",
							click: () => {
								windows.send("main-window", "set", {
									key: "node_display_threshold",
									value: 0.005
								});
							}
						},
						{
							label: "Many",
							click: () => {
								windows.send("main-window", "set", {
									key: "node_display_threshold",
									value: 0.01
								});
							}
						},
						{
							label: "Some",
							click: () => {
								windows.send("main-window", "set", {
									key: "node_display_threshold",
									value: 0.02
								});
							}
						},
						{
							label: "Few",
							click: () => {
								windows.send("main-window", "set", {
									key: "node_display_threshold",
									value: 0.05
								});
							}
						},
						{
							label: "Very few",
							click: () => {
								windows.send("main-window", "set", {
									key: "node_display_threshold",
									value: 0.1
								});
							}
						},
						{
							type: "separator"
						},
						{
							label: "About this option",
							click: () => {
								about_move_display();
							}
						}
					]
				},
			]
		},
		{
			label: "Dev",
			submenu: [
				{
					role: "toggledevtools"
				},
				{
					label: "Toggle Debug CSS",
					click: () => {
						windows.send("main-window", "call", "toggle_debug_css");
					}
				}
			]
		}
	];

	const menu = electron.Menu.buildFromTemplate(template);
	electron.Menu.setApplicationMenu(menu);
}

function about_move_display() {

	let s = `

Nibbler decides whether to display a move based on how many visits it \
has, compared to the best move. Exactly how many moves will be \
displayed depends on the position; positions with more viable moves \
will display more. Sometimes different settings will display the same \
number of moves. Note that displayed winrates are dubious for moves \
with few visits.`;

	alert(s);
}

function get_main_folder() {

	// Sadly this can't be a module since __dirname will change if it's
	// in the modules folder. So this code is duplicated between the
	// renderer and main process code...


	// Return the dir of this .js file if we're being run from electron.exe

	if (path.basename(process.argv[0]) === "electron" || path.basename(process.argv[0]) === "electron.exe") {
		return __dirname;
	}

	// Return the location of Nibbler.exe

	return path.dirname(process.argv[0]);
}
