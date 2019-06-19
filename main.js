"use strict";

const alert = require("./modules/alert");
const debork_json = require("./modules/debork_json");
const electron = require("electron");
const fs = require("fs");
const path = require("path");
const windows = require("./modules/windows");

let menu;
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

	if (path.basename(process.argv[0]).toLowerCase() === "electron" ||
		path.basename(process.argv[0]).toLowerCase() === "electron framework" ||
		path.basename(process.argv[0]).toLowerCase() === "electron helper" ||
		path.basename(process.argv[0]).toLowerCase() === "electron.exe") {

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
						windows.send("main-window", "call", "toggle_flip");
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
						windows.send("main-window", "call", {
							fn: "set_versus",
							args: ["wb"],
						});
					}
				},
				{
					label: "Halt",
					accelerator: "CommandOrControl+H",
					click: () => {
						windows.send("main-window", "call", {
							fn: "set_versus",
							args: [""],
						});
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
					label: "CPuct",
					submenu: [
					{
							label: "20",
							type: "checkbox",
							checked: config.options.CPuct === 20,
							click: () => {
								set_checks(["Analysis", "CPuct"], 0);
								windows.send("main-window", "call", {
									fn: "set_cpuct",
									args: [20],
								});
							}
						},
						{
							label: "12",
							type: "checkbox",
							checked: config.options.CPuct === 12,
							click: () => {
								set_checks(["Analysis", "CPuct"], 1);
								windows.send("main-window", "call", {
									fn: "set_cpuct",
									args: [12],
								});
							}
						},
						{
							label: "8",
							type: "checkbox",
							checked: config.options.CPuct === 8,
							click: () => {
								set_checks(["Analysis", "CPuct"], 2);
								windows.send("main-window", "call", {
									fn: "set_cpuct",
									args: [8],
								});
							}
						},
						{
							label: "5",
							type: "checkbox",
							checked: config.options.CPuct === 5,
							click: () => {
								set_checks(["Analysis", "CPuct"], 3);
								windows.send("main-window", "call", {
									fn: "set_cpuct",
									args: [5],
								});
							}
						},
						{
							label: "3.4 (Default)",
							type: "checkbox",
							checked: config.options.CPuct === 3.4,
							click: () => {
								set_checks(["Analysis", "CPuct"], 4);
								windows.send("main-window", "call", {
									fn: "set_cpuct",
									args: [3.4],
								});
							}
						},
					]
				},
				{
					label: "Node limit",
					submenu: [
						{
							label: "Infinite",
							type: "checkbox",
							checked: config.search_nodes === "infinite",
							click: () => {
								set_checks(["Analysis", "Node limit"], 0);
								windows.send("main-window", "set", {
									key: "search_nodes",
									value: "infinite"
								});
								windows.send("main-window", "call", "reset_leela_cache");
							}
						},
						{
							label: "1,000,000",
							type: "checkbox",
							checked: config.search_nodes === 1000000,
							click: () => {
								set_checks(["Analysis", "Node limit"], 1);
								windows.send("main-window", "set", {
									key: "search_nodes",
									value: 1000000
								});
								windows.send("main-window", "call", "reset_leela_cache");
							}
						},
						{
							label: "100,000",
							type: "checkbox",
							checked: config.search_nodes === 100000,
							click: () => {
								set_checks(["Analysis", "Node limit"], 2);
								windows.send("main-window", "set", {
									key: "search_nodes",
									value: 100000
								});
								windows.send("main-window", "call", "reset_leela_cache");
							}
						},
						{
							label: "10,000",
							type: "checkbox",
							checked: config.search_nodes === 10000,
							click: () => {
								set_checks(["Analysis", "Node limit"], 3);
								windows.send("main-window", "set", {
									key: "search_nodes",
									value: 10000
								});
								windows.send("main-window", "call", "reset_leela_cache");
							}
						},
						{
							label: "1,000",
							type: "checkbox",
							checked: config.search_nodes === 1000,
							click: () => {
								set_checks(["Analysis", "Node limit"], 4);
								windows.send("main-window", "set", {
									key: "search_nodes",
									value: 1000
								});
								windows.send("main-window", "call", "reset_leela_cache");
							}
						},
						{
							label: "100",
							type: "checkbox",
							checked: config.search_nodes === 100,
							click: () => {
								set_checks(["Analysis", "Node limit"], 5);
								windows.send("main-window", "set", {
									key: "search_nodes",
									value: 100
								});
								windows.send("main-window", "call", "reset_leela_cache");
							}
						},
						{
							label: "2",
							type: "checkbox",
							checked: config.search_nodes === 2,
							click: () => {
								set_checks(["Analysis", "Node limit"], 6);
								windows.send("main-window", "set", {
									key: "search_nodes",
									value: 2
								});
								windows.send("main-window", "call", "reset_leela_cache");
							}
						},
					]
				},
				{
					type: "separator"
				},
				{
					label: "Arrowhead type",
					submenu: [
						{
							label: "Winrate",
							type: "checkbox",
							checked: config.arrowhead_type === 0,
							click: () => {
								set_checks(["Analysis", "Arrowhead type"], 0);
								windows.send("main-window", "set", {
									key: "arrowhead_type",
									value: 0,
								});
							}
						},
						{
							label: "Node %",
							type: "checkbox",
							checked: config.arrowhead_type === 1,
							click: () => {
								set_checks(["Analysis", "Arrowhead type"], 1);
								windows.send("main-window", "set", {
									key: "arrowhead_type",
									value: 1,
								});
							}
						},
						{
							label: "Policy",
							type: "checkbox",
							checked: config.arrowhead_type === 2,
							click: () => {
								set_checks(["Analysis", "Arrowhead type"], 2);
								windows.send("main-window", "set", {
									key: "arrowhead_type",
									value: 2,
								});
							}
						},
						{
							label: "MultiPV rank",
							type: "checkbox",
							checked: config.arrowhead_type === 3,
							click: () => {
								set_checks(["Analysis", "Arrowhead type"], 3);
								windows.send("main-window", "set", {
									key: "arrowhead_type",
									value: 3,
								});
							}
						},
					]
				},
				{
					label: "Moves to show",
					submenu: [
						{
							label: "All",
							type: "checkbox",
							checked: config.node_display_threshold === 0,
							click: () => {
								set_checks(["Analysis", "Moves to show"], 0);
								windows.send("main-window", "set", {
									key: "node_display_threshold",
									value: 0
								});
							}
						},
						{
							label: "Very many",
							type: "checkbox",
							checked: config.node_display_threshold === 0.005,
							click: () => {
								set_checks(["Analysis", "Moves to show"], 1);
								windows.send("main-window", "set", {
									key: "node_display_threshold",
									value: 0.005
								});
							}
						},
						{
							label: "Many",
							type: "checkbox",
							checked: config.node_display_threshold === 0.01,
							click: () => {
								set_checks(["Analysis", "Moves to show"], 2);
								windows.send("main-window", "set", {
									key: "node_display_threshold",
									value: 0.01
								});
							}
						},
						{
							label: "Some",
							type: "checkbox",
							checked: config.node_display_threshold === 0.02,
							click: () => {
								set_checks(["Analysis", "Moves to show"], 3);
								windows.send("main-window", "set", {
									key: "node_display_threshold",
									value: 0.02
								});
							}
						},
						{
							label: "Few",
							type: "checkbox",
							checked: config.node_display_threshold === 0.05,
							click: () => {
								set_checks(["Analysis", "Moves to show"], 4);
								windows.send("main-window", "set", {
									key: "node_display_threshold",
									value: 0.05
								});
							}
						},
						{
							label: "Very few",
							type: "checkbox",
							checked: config.node_display_threshold === 0.1,
							click: () => {
								set_checks(["Analysis", "Moves to show"], 5);
								windows.send("main-window", "set", {
									key: "node_display_threshold",
									value: 0.1
								});
							}
						},
						{
							label: "Best move only",
							type: "checkbox",
							checked: config.node_display_threshold === 1,
							click: () => {
								set_checks(["Analysis", "Moves to show"], 6);
								windows.send("main-window", "set", {
									key: "node_display_threshold",
									value: 1
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
			label: "Versus",
			submenu: [
				{
					label: "Leela plays White",
					click: () => {
						windows.send("main-window", "call", {
							fn: "set_versus",
							args: ["w"],
						});
					}
				},
				{
					label: "Leela plays Black",
					click: () => {
						windows.send("main-window", "call", {
							fn: "set_versus",
							args: ["b"],
						});
					}
				},
				{
					type: "separator"
				},
				{
					label: "About Versus Mode",
					click: () => {
						about_versus_mode();
					}
				}
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

	menu = electron.Menu.buildFromTemplate(template);
	electron.Menu.setApplicationMenu(menu);
}

function get_main_folder() {

	// Sadly this can't be a module since __dirname will change if it's
	// in the modules folder. So this code is duplicated between the
	// renderer and main process code...


	// Return the dir of this .js file if we're being run from electron.exe

	if (path.basename(process.argv[0]).toLowerCase() === "electron" ||
		path.basename(process.argv[0]).toLowerCase() === "electron framework" ||
		path.basename(process.argv[0]).toLowerCase() === "electron helper" ||
		path.basename(process.argv[0]).toLowerCase() === "electron.exe") {
		return __dirname;
	}

	// Return the location of Nibbler.exe

	return path.dirname(process.argv[0]);
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

function about_versus_mode() {

	let s = `

Versus Mode causes Leela to evaluate one side of the position only. \
You must still manually decide which of Leela's suggestions to play. \
You can exit Versus Mode with the Go or Halt commands in the Analysis \
menu.`;

	alert(s);
}

function get_submenu_items(menupath) {

	let o = menu.items;

	for (let p of menupath) {
		for (let item of o) {
			if (item.label === p) {
				o = item.submenu.items;
				break;
			}
		}
	}

	return o;
}

function set_checks(menupath, except) {

	// Since I don't know precisely how the menu works behind the scenes,
	// give a little time for the original click to go through first.

	setTimeout(() => {
		let items = get_submenu_items(menupath);
		for (let n = 0; n < items.length; n++) {
			if (items[n].checked !== undefined) {
				items[n].checked = n === except;
			}
		}
	}, 50);
}
