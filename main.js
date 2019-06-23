"use strict";

const alert = require("./modules/alert");
const electron = require("electron");
const load_config = require("./modules/load_config");
const messages = require("./modules/messages");
const path = require("path");
const running_as_electron = require("./modules/running_as_electron");
const url = require("url");

let config = load_config();			// Do this first, it's a needed global.
if (config.failure) {				// Do this early, while console.log still works.
	console.log(config.failure);
}

let menu = menu_build();
let win;

electron.app.on("ready", () => {

	win = new electron.BrowserWindow({
		width: config.width,
		height: config.height,
		backgroundColor: "#000000",
		resizable: true,
		show: false,
		useContentSize: true,
		webPreferences: {
			backgroundThrottling: false,
			nodeIntegration: true,
			zoomFactor: 1 / electron.screen.getPrimaryDisplay().scaleFactor
		}
	});

	let pagepath = path.join(__dirname, "nibbler.html");

	win.loadURL(url.format({
		protocol: "file:",
		pathname: pagepath,
		slashes: true
	}));

	win.once("ready-to-show", () => {		// Thankfully, fires even after exception during renderer startup.
		win.show();
		win.focus();
	});

	electron.Menu.setApplicationMenu(menu);
});

electron.app.on("window-all-closed", () => {
	electron.app.quit();
});

electron.ipcMain.once("renderer_ready", () => {

	// Open a file via command line. We must wait until the renderer has properly loaded before we do this.
	// Also some awkwardness around the different ways Nibbler can be started, meaning the number of arguments
	// we get can be different.

	let filename = "";

	if (running_as_electron()) {
		if (process.argv.length > 2) {
			filename = process.argv[process.argv.length - 1];
		}
	} else {
		if (process.argv.length > 1) {
			filename = process.argv[process.argv.length - 1];
		}
	}

	if (filename !== "") {
		win.webContents.send("call", {
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
						win.webContents.send("call", "new_game");
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
							win.webContents.send("call", {
								fn: "open",
								args: [files[0]]
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
							win.webContents.send("call", {
								fn: "validate_pgn",
								args: [files[0]]
							});
						}
					}
				},
				{
					label: "Save this game...",
					accelerator: "CommandOrControl+S",
					click: () => {
						if (config.save_enabled !== true) {		// Note: exact test for true, not just any truthy value
							alert(messages.save_not_enabled);
							return;
						}
						let file = electron.dialog.showSaveDialog();
						if (file && file.length > 0) {
							win.webContents.send("call", {
								fn: "save",
								args: [file]
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
						win.webContents.send("call", {
							fn: "load_pgn_from_string",
							args: [electron.clipboard.readText()]
						});
					}
				},
				{
					label: "Write PGN to clipboard",
					accelerator: "CommandOrControl+K",
					click: () => {
						win.webContents.send("call", "pgn_to_clipboard");
					}
				},
				{
					type: "separator"
				},
					{
					label: "Cut",
					accelerator: "CommandOrControl+X",
					role: "cut",
				},
				{
					label: "Copy",
					accelerator: "CommandOrControl+C",
					role: "copy",
				},
				{
					label: "Paste",
					accelerator: "CommandOrControl+V",
					role: "paste",
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
							win.webContents.send("call", {
								fn: "play_info_index",
								args: [0]
							})}
						},
						{
						label: "2nd",
						accelerator: "F2",
						click: () => {
							win.webContents.send("call", {
								fn: "play_info_index",
								args: [1]
							})}
						},
						{
						label: "3rd",
						accelerator: "F3",
						click: () => {
							win.webContents.send("call", {
								fn: "play_info_index",
								args: [2]
							})}
						},
						{
						label: "4th",
						accelerator: "F4",
						click: () => {
							win.webContents.send("call", {
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
						win.webContents.send("call", "goto_root");
					}
				},
				{
					label: "End",
					accelerator: "End",
					click: () => {
						win.webContents.send("call", "goto_end");
					}
				},
				{
					label: "Backward",
					accelerator: "Left",
					click: () => {
						win.webContents.send("call", "prev");
					}
				},
				{
					label: "Forward",
					accelerator: "Right",
					click: () => {
						win.webContents.send("call", "next");
					}
				},
				{
					type: "separator"
				},
				{
					label: "Return to main line",
					accelerator: "CommandOrControl+R",
					click: () => {
						win.webContents.send("call", "return_to_main_line");
					}
				},
				{
					label: "Make this the main line",
					accelerator: "CommandOrControl+L",
					click: () => {
						win.webContents.send("call", "promote_to_main_line");
					}
				},
				{
					type: "separator"
				},
				{
					label: "Delete move",
					accelerator: "CommandOrControl+Backspace",
					click: () => {
						win.webContents.send("call", "delete_move");
					}
				},
				{
					type: "separator"
				},
				{
					label: "Show PGN games list",
					accelerator: "CommandOrControl+P",
					click: () => {
						win.webContents.send("call", "show_pgn_chooser");
					}
				},
				{
					label: "Escape",
					accelerator: "Escape",
					click: () => {
						win.webContents.send("call", "escape");
					}
				},
				{
					type: "separator"
				},
				{
					label: "Flip Board",
					accelerator: "CommandOrControl+F",
					click: () => {
						win.webContents.send("call", "toggle_flip");
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
						win.webContents.send("call", {
							fn: "set_versus",
							args: ["wb"],
						});
					}
				},
				{
					label: "Halt",
					accelerator: "CommandOrControl+H",
					click: () => {
						win.webContents.send("call", {
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
							win.webContents.send("call", {
								fn: "switch_weights",
								args: [files[0]]
							});
						}
					}
				},
				{
					label: "Reset Lc0 cache",
					click: () => {
						win.webContents.send("call", "reset_leela_cache");
					}
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
								win.webContents.send("set", {
									key: "search_nodes",
									value: "infinite"
								});
								win.webContents.send("call", "reset_leela_cache");
							}
						},
						{
							label: "1,000,000",
							type: "checkbox",
							checked: config.search_nodes === 1000000,
							click: () => {
								set_checks(["Analysis", "Node limit"], 1);
								win.webContents.send("set", {
									key: "search_nodes",
									value: 1000000
								});
								win.webContents.send("call", "reset_leela_cache");
							}
						},
						{
							label: "100,000",
							type: "checkbox",
							checked: config.search_nodes === 100000,
							click: () => {
								set_checks(["Analysis", "Node limit"], 2);
								win.webContents.send("set", {
									key: "search_nodes",
									value: 100000
								});
								win.webContents.send("call", "reset_leela_cache");
							}
						},
						{
							label: "10,000",
							type: "checkbox",
							checked: config.search_nodes === 10000,
							click: () => {
								set_checks(["Analysis", "Node limit"], 3);
								win.webContents.send("set", {
									key: "search_nodes",
									value: 10000
								});
								win.webContents.send("call", "reset_leela_cache");
							}
						},
						{
							label: "1,000",
							type: "checkbox",
							checked: config.search_nodes === 1000,
							click: () => {
								set_checks(["Analysis", "Node limit"], 4);
								win.webContents.send("set", {
									key: "search_nodes",
									value: 1000
								});
								win.webContents.send("call", "reset_leela_cache");
							}
						},
						{
							label: "100",
							type: "checkbox",
							checked: config.search_nodes === 100,
							click: () => {
								set_checks(["Analysis", "Node limit"], 5);
								win.webContents.send("set", {
									key: "search_nodes",
									value: 100
								});
								win.webContents.send("call", "reset_leela_cache");
							}
						},
						{
							label: "2",
							type: "checkbox",
							checked: config.search_nodes === 2,
							click: () => {
								set_checks(["Analysis", "Node limit"], 6);
								win.webContents.send("set", {
									key: "search_nodes",
									value: 2
								});
								win.webContents.send("call", "reset_leela_cache");
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
							accelerator: "F5",
							click: () => {
								set_checks(["Analysis", "Arrowhead type"], 0);
								win.webContents.send("set", {
									key: "arrowhead_type",
									value: 0,
								});
							}
						},
						{
							label: "Node %",
							type: "checkbox",
							checked: config.arrowhead_type === 1,
							accelerator: "F6",
							click: () => {
								set_checks(["Analysis", "Arrowhead type"], 1);
								win.webContents.send("set", {
									key: "arrowhead_type",
									value: 1,
								});
							}
						},
						{
							label: "Policy",
							type: "checkbox",
							checked: config.arrowhead_type === 2,
							accelerator: "F7",
							click: () => {
								set_checks(["Analysis", "Arrowhead type"], 2);
								win.webContents.send("set", {
									key: "arrowhead_type",
									value: 2,
								});
							}
						},
						{
							label: "MultiPV rank",
							type: "checkbox",
							checked: config.arrowhead_type === 3,
							accelerator: "F8",
							click: () => {
								set_checks(["Analysis", "Arrowhead type"], 3);
								win.webContents.send("set", {
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
							label: "All moves",
							type: "checkbox",
							checked: config.uncertainty_cutoff === 999,				// Semi-special value we use
							click: () => {
								set_checks(["Analysis", "Moves to show"], 0);
								win.webContents.send("set", {
									key: "uncertainty_cutoff",
									value: 999
								});
							}
						},
						{
							label: "U < 0.2",
							type: "checkbox",
							checked: config.uncertainty_cutoff === 0.2,
							click: () => {
								set_checks(["Analysis", "Moves to show"], 1);
								win.webContents.send("set", {
									key: "uncertainty_cutoff",
									value: 0.2
								});
							}
						},
						{
							label: "U < 0.175",
							type: "checkbox",
							checked: config.uncertainty_cutoff === 0.175,
							click: () => {
								set_checks(["Analysis", "Moves to show"], 2);
								win.webContents.send("set", {
									key: "uncertainty_cutoff",
									value: 0.175
								});
							}
						},
						{
							label: "U < 0.15",
							type: "checkbox",
							checked: config.uncertainty_cutoff === 0.15,
							click: () => {
								set_checks(["Analysis", "Moves to show"], 3);
								win.webContents.send("set", {
									key: "uncertainty_cutoff",
									value: 0.15
								});
							}
						},
						{
							label: "U < 0.125",
							type: "checkbox",
							checked: config.uncertainty_cutoff === 0.125,
							click: () => {
								set_checks(["Analysis", "Moves to show"], 4);
								win.webContents.send("set", {
									key: "uncertainty_cutoff",
									value: 0.125
								});
							}
						},
						{
							label: "U < 0.1",
							type: "checkbox",
							checked: config.uncertainty_cutoff === 0.1,
							click: () => {
								set_checks(["Analysis", "Moves to show"], 5);
								win.webContents.send("set", {
									key: "uncertainty_cutoff",
									value: 0.1
								});
							}
						},{
							label: "U < 0.075",
							type: "checkbox",
							checked: config.uncertainty_cutoff === 0.075,
							click: () => {
								set_checks(["Analysis", "Moves to show"], 6);
								win.webContents.send("set", {
									key: "uncertainty_cutoff",
									value: 0.075
								});
							}
						},
						{
							label: "U < 0.05",
							type: "checkbox",
							checked: config.uncertainty_cutoff === 0.05,
							click: () => {
								set_checks(["Analysis", "Moves to show"], 7);
								win.webContents.send("set", {
									key: "uncertainty_cutoff",
									value: 0.05
								});
							}
						},
						{
							label: "U < 0.025",
							type: "checkbox",
							checked: config.uncertainty_cutoff === 0.025,
							click: () => {
								set_checks(["Analysis", "Moves to show"], 8);
								win.webContents.send("set", {
									key: "uncertainty_cutoff",
									value: 0.025
								});
							}
						},
						{
							label: "Best move only",
							type: "checkbox",
							checked: config.uncertainty_cutoff === -999,				// Semi-special value we use
							click: () => {
								set_checks(["Analysis", "Moves to show"], 9);
								win.webContents.send("set", {
									key: "uncertainty_cutoff",
									value: -999
								});
							}
						},
						{
							type: "separator"
						},
						{
							label: "About this option",
							click: () => {
								alert(messages.about_move_display);
							}
						}
					]
				},
				{
					type: "separator"
				},
				{
					label: "Infobox stats",
					submenu: [
						{
							label: "Show N",
							type: "checkbox",
							checked: config.show_n,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["show_n"],
								});
							}
						},
						{
							label: "Show P",
							type: "checkbox",
							checked: config.show_p,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["show_p"],
								});
							}
						},
						{
							label: "Show U",
							type: "checkbox",
							checked: config.show_u,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["show_u"],
								});
							}
						},
					]
				},
				{
					type: "separator"
				},
				{
					label: "Serious Analysis Mode",
					type: "checkbox",
					checked: config.serious_analysis_mode,
					click: () => {
						win.webContents.send("call", {
							fn: "toggle",
							args: ["serious_analysis_mode"],
						});
					}
				},
				{
					label: "About Serious Analysis Mode",
					click: () => {
						alert(messages.about_serious_analysis);
					}
				}
			]
		},
		{
			label: "Versus",
			submenu: [
				{
					label: "Leela plays White",
					click: () => {
						win.webContents.send("call", {
							fn: "set_versus",
							args: ["w"],
						});
					}
				},
				{
					label: "Leela plays Black",
					click: () => {
						win.webContents.send("call", {
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
						alert(messages.about_versus_mode);
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
						win.webContents.send("call", "toggle_debug_css");
					}
				}
			]
		}
	];

	return electron.Menu.buildFromTemplate(template);
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
