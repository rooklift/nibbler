"use strict";

const electron = require("electron");

// The docs are a bit vague but it seems there's a limited timeframe
// in which command line flags can be passed, so do this ASAP...

electron.app.commandLine.appendSwitch("js-flags", "--expose_gc");

// Other requires...

const config_io = require("./modules/config_io");
const custom_uci = require("./modules/custom_uci");
const messages = require("./modules/messages");
const path = require("path");
const running_as_electron = require("./modules/running_as_electron");
const stringify = require("./modules/stringify");
const url = require("url");

// We want sync save and open dialogs. In Electron 5 we could get these by calling
// showSaveDialog or showOpenDialog without a callback, but in Electron 6 this no
// longer works and we must call new functions. So find out if they exist...

const save_dialog = electron.dialog.showSaveDialogSync || electron.dialog.showSaveDialog;
const open_dialog = electron.dialog.showOpenDialogSync || electron.dialog.showOpenDialog;

// Create an alert() function...

let alert = (msg) => {
	electron.dialog.showMessageBox({message: stringify(msg), title: "Alert", buttons: ["OK"]}, () => {});
	// Providing a callback makes the window not block the process.
};

// Note that as the user adjusts menu items, our copy of the config will become
// out of date. The renderer is responsible for having an up-to-date copy.

let config = config_io.load();		// Do this early, it's a needed global.

let win;
let menu = menu_build();
let menu_is_set = false;

let loaded_engine = null;
let loaded_weights = null;

// Avoid a theoretical race by checking whether the ready event has already occurred,
// otherwise set an event listener for it...

if (electron.app.isReady()) {
	startup();
} else {
	electron.app.once("ready", () => {
		startup();
	});
}

// ----------------------------------------------------------------------------------

function startup() {

	win = new electron.BrowserWindow({
		width: config.width,
		height: config.height,
		backgroundColor: "#000000",
		resizable: true,
		show: false,
		useContentSize: true,
		webPreferences: {
			backgroundThrottling: false,
			contextIsolation: false,
			nodeIntegration: true,
			spellcheck: false,
			zoomFactor: 1 / electron.screen.getPrimaryDisplay().scaleFactor		// Unreliable, see https://github.com/electron/electron/issues/10572
		}
	});

	win.once("ready-to-show", () => {
		try {
			win.webContents.setZoomFactor(1 / electron.screen.getPrimaryDisplay().scaleFactor);	// This seems to work, note issue 10572 above.
		} catch (err) {
			win.webContents.zoomFactor = 1 / electron.screen.getPrimaryDisplay().scaleFactor;	// The method above "will be removed" in future.
		}
		win.show();
		win.focus();
	});

	win.webContents.once("crashed", () => {
		alert(messages.renderer_crash);
	});

	win.webContents.once("unresponsive", () => {
		alert(messages.renderer_hang);
	});

	electron.app.on("window-all-closed", () => {
		electron.app.quit();
	});

	electron.ipcMain.once("renderer_ready", () => {

		// Open a file via command line. We must wait until the renderer has properly loaded before we do this.
		// While it might seem like we could do this after "ready-to-show" I'm not 100% sure that the renderer
		// will have fully loaded when that fires.

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

	electron.ipcMain.on("alert", (event, msg) => {
		alert(msg);
	});

	electron.ipcMain.on("set_title", (event, msg) => {
		win.setTitle(msg);
	});

	electron.ipcMain.on("ack_engine_start", (event, msg) => {
		loaded_engine = msg;
	});

	electron.ipcMain.on("ack_logfile", (event, msg) => {
		set_one_check(msg ? true : false, "Dev", "Use logfile...");
	});

	electron.ipcMain.on("ack_book", (event, msg) => {
		set_one_check(msg ? true : false, "Play", "Use PGN book...");
	});

	electron.ipcMain.on("ack_node_limit", (event, msg) => {
		set_checks("Engine", "Node limit - normal", msg);
	});

	electron.ipcMain.on("ack_special_node_limit", (event, msg) => {
		set_checks("Engine", "Node limit - auto-eval / play", msg);
	});

	electron.ipcMain.on("ack_setoption", (event, msg) => {

		// These are received whenever the renderer actually sends a setoption UCI command.
		// But we also sometimes query some option and get a response indicating what the
		// last value we sent was, or "" if not applicable.

		// Expect msg.key to be a lowercase string
		// Expect msg.val to be a string, possibly "" (can use the fact that "" is false-ish)

		switch (msg.key) {

		case "weightsfile":
			loaded_weights = msg.val;
			break;

		case "syzygypath":
			set_one_check(msg.val ? true : false, "Engine", "Syzygy", "Choose folder...");
			break;

		case "backend":
			set_checks("Engine", "Backend", msg.val);
			break;

		case "threads":
			set_checks("Engine", "Threads", msg.val);
			break;

		case "temperature":			// Sketchy because there are equivalent representations.
			if (msg.val === "0" || msg.val === "0.0") {
				set_checks("Play", "Temperature", "0");
			} else if (msg.val === "1" || msg.val === "1.0") {
				set_checks("Play", "Temperature", "1.0");
			} else {
				set_checks("Play", "Temperature", msg.val);
			}
			break;

		case "tempdecaymoves":		// Not so sketchy because it should be a string of an integer.
			set_checks("Play", "TempDecayMoves", msg.val === "0" ? "Infinite" : msg.val);
			break;
		}
	});

	electron.Menu.setApplicationMenu(menu);
	menu_is_set = true;

	// Actually load the page last, I guess, so the event handlers above are already set up.
	// Send some needed info as a query.

	let query = {};
	query.user_data_path = electron.app.getPath("userData");

	win.loadFile(
		path.join(__dirname, "nibbler.html"),
		{query: query}
	);
}

// About the menu, remember that the renderer has a "queue" system (not really a queue, it drops all but 1
// item) for calls, so only 1 "call" message can be sent at a time. The "set" message, however, is OK.

function menu_build() {

	const million = 1000000;

	let scriptlist_in_menu = [];

	let template = [
		{
			label: "File",
			submenu: [
				{
					label: "About",
					click: () => {
						let s = `Nibbler ${electron.app.getVersion()} in Electron ${process.versions.electron}\n\n`;
						s += `Engine: ${loaded_engine}\nWeights: ${loaded_weights || "<auto>"}`;
						alert(s);
					}
				},
				{
					type: "separator"
				},
				{
					label: "New game",
					accelerator: "CommandOrControl+N",
					click: () => {
						win.webContents.send("call", "new_game");
					}
				},
				{
					label: "New 960 game",
					accelerator: "CommandOrControl+Shift+N",
					click: () => {
						win.webContents.send("call", "new_960");
					}
				},
				{
					type: "separator"
				},
				{
					label: "Open PGN...",
					accelerator: "CommandOrControl+O",
					click: () => {
						let files = open_dialog({
							defaultPath: config.pgn_dialog_folder,
							properties: ["openFile"]
						});
						if (Array.isArray(files) && files.length > 0) {
							let file = files[0];
							win.webContents.send("call", {
								fn: "open",
								args: [file]
							});
							// Save the dir as the new default dir, in both processes.
							config.pgn_dialog_folder = path.dirname(file);
							win.webContents.send("set", {
								key: "pgn_dialog_folder",
								value: path.dirname(file)
							});
						}
					}
				},
				{
					label: "Validate PGN...",
					click: () => {
						let files = open_dialog({
							defaultPath: config.pgn_dialog_folder,
							properties: ["openFile"]
						});
						if (Array.isArray(files) && files.length > 0) {
							let file = files[0];
							win.webContents.send("call", {
								fn: "validate_pgn",
								args: [file]
							});
							// Save the dir as the new default dir, in both processes.
							config.pgn_dialog_folder = path.dirname(file);
							win.webContents.send("set", {
								key: "pgn_dialog_folder",
								value: path.dirname(file)
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
					label: "Load FEN from clipboard",
					click: () => {
						win.webContents.send("call", {
							fn: "load_fen",
							args: [electron.clipboard.readText()]
						});
					}
				},
				{
					type: "separator"
				},
				{
					label: "Save this game...",
					accelerator: "CommandOrControl+S",
					click: () => {
						if (config.save_enabled !== true) {		// Note: exact test for true, not just any truthy value
							alert(messages.save_not_enabled);
							return;
						}
						let file = save_dialog({defaultPath: config.pgn_dialog_folder});
						if (typeof file === "string" && file.length > 0) {
							win.webContents.send("call", {
								fn: "save",
								args: [file]
							});
							// Save the dir as the new default dir, in both processes.
							config.pgn_dialog_folder = path.dirname(file);
							win.webContents.send("set", {
								key: "pgn_dialog_folder",
								value: path.dirname(file)
							});
						}
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
					label: "PGN saved statistics",
					submenu: [
						{
							label: "EV",
							type: "checkbox",
							checked: config.pgn_ev,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["pgn_ev"],
								});
							}
						},
						{
							label: "Centipawns",
							type: "checkbox",
							checked: config.pgn_cp,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["pgn_cp"],
								});
							}
						},
						{
							type: "separator"
						},
						{
							label: "N (%)",
							type: "checkbox",
							checked: config.pgn_n,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["pgn_n"],
								});
							}
						},
						{
							label: "N (absolute)",
							type: "checkbox",
							checked: config.pgn_n_abs,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["pgn_n_abs"],
								});
							}
						},
						{
							label: "...out of total",
							type: "checkbox",
							checked: config.pgn_of_n,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["pgn_of_n"],
								});
							}
						},
						{
							label: "Depth (A/B only)",
							type: "checkbox",
							checked: config.pgn_depth,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["pgn_depth"],
								});
							}
						},
						{
							type: "separator"
						},
						{
							label: "P",
							type: "checkbox",
							checked: config.pgn_p,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["pgn_p"],
								});
							}
						},
						{
							label: "V",
							type: "checkbox",
							checked: config.pgn_v,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["pgn_v"],
								});
							}
						},
						{
							type: "separator"
						},
						{
							label: "Q",
							type: "checkbox",
							checked: config.pgn_q,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["pgn_q"],
								});
							}
						},
						{
							label: "U",
							type: "checkbox",
							checked: config.pgn_u,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["pgn_u"],
								});
							}
						},
						{
							label: "S",
							type: "checkbox",
							checked: config.pgn_s,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["pgn_s"],
								});
							}
						},
						{
							type: "separator"
						},
						{
							label: "M",
							type: "checkbox",
							checked: config.pgn_m,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["pgn_m"],
								});
							}
						},
						{
							label: "WDL",
							type: "checkbox",
							checked: config.pgn_wdl,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["pgn_wdl"],
								});
							}
						},
					]
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
					label: "Quit",
					accelerator: "CommandOrControl+Q",
					role: "quit"
				},
			]
		},
		{
			label: "Tree",
			submenu: [
				{
					label: "Play choice",
					submenu: [
						{
							label: "1st",
							accelerator: "F1",
							click: () => {
								win.webContents.send("call", {
									fn: "play_info_index",
									args: [0]
								});
							}
						},
						{
							label: "2nd",
							accelerator: "F2",
							click: () => {
								win.webContents.send("call", {
									fn: "play_info_index",
									args: [1]
								});
							}
						},
						{
							label: "3rd",
							accelerator: "F3",
							click: () => {
								win.webContents.send("call", {
									fn: "play_info_index",
									args: [2]
								});
							}
						},
						{
							label: "4th",
							accelerator: "F4",
							click: () => {
								win.webContents.send("call", {
									fn: "play_info_index",
									args: [3]
								});
							}
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
					label: "Previous sibling",
					accelerator: "Up",
					click: () => {
						win.webContents.send("call", "previous_sibling");
					}
				},
				{
					label: "Next sibling",
					accelerator: "Down",
					click: () => {
						win.webContents.send("call", "next_sibling");
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
					label: "Promote line to main line",
					accelerator: "CommandOrControl+L",
					click: () => {
						win.webContents.send("call", "promote_to_main_line");
					}
				},
				{
					label: "Promote line by 1 level",
					accelerator: "CommandOrControl+Up",
					click: () => {
						win.webContents.send("call", "promote");
					}
				},
				{
					type: "separator"
				},
				{
					label: "Delete node",
					accelerator: "CommandOrControl+Backspace",
					click: () => {
						win.webContents.send("call", "delete_node");
					}
				},
				{
					label: "Delete children",
					click: () => {
						win.webContents.send("call", "delete_children");
					}
				},
				{
					label: "Delete siblings",
					click: () => {
						win.webContents.send("call", "delete_siblings");
					}
				},
				{
					type: "separator"
				},
				{
					label: "Delete ALL other lines",
					click: () => {
						win.webContents.send("call", "delete_other_lines");
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
							fn: "set_behaviour",
							args: ["analysis_free"],
						});
					}
				},
				{
					label: "Go and lock engine",
					accelerator: "CommandOrControl+Shift+G",
					click: () => {
						win.webContents.send("call", "go_and_lock");
					}
				},
				{
					label: "Return to locked position",
					click: () => {
						win.webContents.send("call", "return_to_lock");
					}
				},
				{
					type: "separator"
				},
				{
					label: "Halt",
					accelerator: "CommandOrControl+H",
					click: () => {
						win.webContents.send("call", {
							fn: "set_behaviour",
							args: ["halt"],
						});
					}
				},
				{
					type: "separator"
				},
				{
					label: "Auto-evaluate whole line",
					accelerator: "F12",
					click: () => {
						win.webContents.send("call", {
							fn: "set_behaviour",
							args: ["auto_analysis"]
						});
					}
				},
				{
					type: "separator"
				},
				{
					label: "Show focus (searchmoves) buttons",
					type: "checkbox",
					checked: config.searchmoves_buttons,
					click: () => {
						win.webContents.send("call", {
							fn: "toggle",
							args: ["searchmoves_buttons"],
						});
					}
				},
				{
					label: "Clear focus",
					click: () => {
						win.webContents.send("call", "clear_searchmoves");
					}
				},
				{
					label: "Invert focus",
					accelerator: "CommandOrControl+I",
					click: () => {
						win.webContents.send("call", "invert_searchmoves");
					}
				},
				{
					type: "separator"
				},
				{
					label: "Score winrates from white POV",
					type: "checkbox",
					checked: config.ev_white_pov,
					click: () => {
						win.webContents.send("call", {
							fn: "toggle",
							args: ["ev_white_pov"],
						});
					}
				},
				{
					label: "Score CP values from white POV",
					type: "checkbox",
					checked: config.cp_white_pov,
					click: () => {
						win.webContents.send("call", {
							fn: "toggle",
							args: ["cp_white_pov"],
						});
					}
				},
				{
					label: "Show WDL from white POV",
					type: "checkbox",
					checked: config.wdl_white_pov,
					click: () => {
						win.webContents.send("call", {
							fn: "toggle",
							args: ["wdl_white_pov"],
						});
					}
				},
				{
					type: "separator"
				},
				{
					label: "PV clicks add to tree instead of moving",
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
					type: "separator"
				},
				{
					label: "Write infobox to clipboard",
					click: () => {
						win.webContents.send("call", "infobox_to_clipboard");
					}
				},
				{
					type: "separator"
				},
				{
					label: "Forget all analysis",
					accelerator: "CommandOrControl+.",
					click: () => {
						win.webContents.send("call", "forget_analysis");
					}
				},
			]
		},
		{
			label: "Display",
			submenu: [
				{
					label: "Flip board",
					accelerator: "CommandOrControl+F",
					click: () => {
						win.webContents.send("call", {
							fn: "toggle",
							args: ["flip"],
						});
					}
				},
				{
					type: "separator"
				},
				{
					label: "Arrows",
					type: "checkbox",
					checked: config.arrows_enabled,
					click: () => {
						win.webContents.send("call", {
							fn: "toggle",
							args: ["arrows_enabled"],
						});
					}
				},
				{
					label: "...with piece-click spotlight",
					type: "checkbox",
					checked: config.click_spotlight,
					click: () => {
						win.webContents.send("call", {
							fn: "toggle",
							args: ["click_spotlight"],
						});
					}
				},
				{
					label: "...always show actual move (if known)",
					type: "checkbox",
					checked: config.next_move_arrow,
					click: () => {
						win.webContents.send("call", {
							fn: "toggle",
							args: ["next_move_arrow"],
						});
					}
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
								set_checks("Display", "Arrowhead type", "Winrate");
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
								set_checks("Display", "Arrowhead type", "Node %");
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
								set_checks("Display", "Arrowhead type", "Policy");
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
								set_checks("Display", "Arrowhead type", "MultiPV rank");
								win.webContents.send("set", {
									key: "arrowhead_type",
									value: 3,
								});
							}
						},
						{
							label: "Moves Left Head",
							type: "checkbox",
							checked: config.arrowhead_type === 4,
							click: () => {
								set_checks("Display", "Arrowhead type", "Moves Left Head");
								win.webContents.send("set", {
									key: "arrowhead_type",
									value: 4,
								});
							}
						},
					]
				},
				{
					label: "Arrow filter",
					submenu: [
						{
							label: "All moves",
							type: "checkbox",
							checked: config.arrow_filter_type === "all",
							click: () => {
								set_checks("Display", "Arrow filter", "All moves");
								win.webContents.send("call", {
									fn: "set_arrow_filter",
									args: ["all", 0],
								});
							}
						},
						{
							label: "Top move",
							type: "checkbox",
							checked: config.arrow_filter_type === "top",
							click: () => {
								set_checks("Display", "Arrow filter", "Top move");
								win.webContents.send("call", {
									fn: "set_arrow_filter",
									args: ["top", 0],
								});
							}
						},
						{
							type: "separator"
						},
						{
							label: "N > 0.5%",
							type: "checkbox",
							checked: config.arrow_filter_type === "N" && config.arrow_filter_value === 0.005,
							click: () => {
								set_checks("Display", "Arrow filter", "N > 0.5%");
								win.webContents.send("call", {
									fn: "set_arrow_filter",
									args: ["N", 0.005],
								});
							}
						},
						{
							label: "N > 1%",
							type: "checkbox",
							checked: config.arrow_filter_type === "N" && config.arrow_filter_value === 0.01,
							click: () => {
								set_checks("Display", "Arrow filter", "N > 1%");
								win.webContents.send("call", {
									fn: "set_arrow_filter",
									args: ["N", 0.01],
								});
							}
						},
						{
							label: "N > 2%",
							type: "checkbox",
							checked: config.arrow_filter_type === "N" && config.arrow_filter_value === 0.02,
							click: () => {
								set_checks("Display", "Arrow filter", "N > 2%");
								win.webContents.send("call", {
									fn: "set_arrow_filter",
									args: ["N", 0.02],
								});
							}
						},
						{
							label: "N > 3%",
							type: "checkbox",
							checked: config.arrow_filter_type === "N" && config.arrow_filter_value === 0.03,
							click: () => {
								set_checks("Display", "Arrow filter", "N > 3%");
								win.webContents.send("call", {
									fn: "set_arrow_filter",
									args: ["N", 0.03],
								});
							}
						},
						{
							label: "N > 4%",
							type: "checkbox",
							checked: config.arrow_filter_type === "N" && config.arrow_filter_value === 0.04,
							click: () => {
								set_checks("Display", "Arrow filter", "N > 4%");
								win.webContents.send("call", {
									fn: "set_arrow_filter",
									args: ["N", 0.04],
								});
							}
						},
						{
							label: "N > 5%",
							type: "checkbox",
							checked: config.arrow_filter_type === "N" && config.arrow_filter_value === 0.05,
							click: () => {
								set_checks("Display", "Arrow filter", "N > 5%");
								win.webContents.send("call", {
									fn: "set_arrow_filter",
									args: ["N", 0.05],
								});
							}
						},
						{
							label: "N > 10%",
							type: "checkbox",
							checked: config.arrow_filter_type === "N" && config.arrow_filter_value === 0.1,
							click: () => {
								set_checks("Display", "Arrow filter", "N > 10%");
								win.webContents.send("call", {
									fn: "set_arrow_filter",
									args: ["N", 0.1],
								});
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
							label: "Centipawns",
							type: "checkbox",
							checked: config.show_cp,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["show_cp"],
								});
							}
						},
						{
							type: "separator"
						},
						{
							label: "N - nodes (%)",
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
							label: "N - nodes (absolute)",
							type: "checkbox",
							checked: config.show_n_abs,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["show_n_abs"],
								});
							}
						},
						{
							label: "Depth (A/B only)",
							type: "checkbox",
							checked: config.show_depth,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["show_depth"],
								});
							}
						},
						{
							type: "separator"
						},
						{
							label: "P - policy",
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
							label: "V - static evaluation",
							type: "checkbox",
							checked: config.show_v,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["show_v"],
								});
							}
						},
						{
							type: "separator"
						},
						{
							label: "Q - evaluation",
							type: "checkbox",
							checked: config.show_q,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["show_q"],
								});
							}
						},
						{
							label: "U - uncertainty",
							type: "checkbox",
							checked: config.show_u,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["show_u"],
								});
							}
						},
						{
							label: "S - search priority",
							type: "checkbox",
							checked: config.show_s,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["show_s"],
								});
							}
						},
						{
							type: "separator"
						},
						{
							label: "M - moves left",
							type: "checkbox",
							checked: config.show_m,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["show_m"],
								});
							}
						},
						{
							label: "WDL - win / draw / loss",
							type: "checkbox",
							checked: config.show_wdl,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["show_wdl"],
								});
							}
						},
						{
							type: "separator"
						},
						{
							label: "Linebreak before stats",
							type: "checkbox",
							checked: config.infobox_stats_newline,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["infobox_stats_newline"],
								});
							}
						}
					]
				},
				{
					label: "PV move numbers",
					type: "checkbox",
					checked: config.infobox_pv_move_numbers,
					click: () => {
						win.webContents.send("call", {
							fn: "toggle",
							args: ["infobox_pv_move_numbers"],
						});
					}
				},
				{
					type: "separator"
				},
				{
					label: "Draw PV on mouseover",
					accelerator: "CommandOrControl+D",
					type: "checkbox",
					checked: config.hover_draw,
					click: () => {
						win.webContents.send("call", {
							fn: "toggle",
							args: ["hover_draw"],
						});
					}
				},
				{
					label: "Draw PV method",
					submenu: [
						{
							label: "Animate",
							type: "checkbox",
							checked: config.hover_method === 0,
							click: () => {
								set_checks("Display", "Draw PV method", "Animate");
								win.webContents.send("set", {
									key: "hover_method",
									value: 0
								});
							}
						},
						{
							label: "Single move",
							type: "checkbox",
							checked: config.hover_method === 1,
							click: () => {
								set_checks("Display", "Draw PV method", "Single move");
								win.webContents.send("set", {
									key: "hover_method",
									value: 1
								});
							}
						},
						{
							label: "Final position",
							type: "checkbox",
							checked: config.hover_method === 2,
							click: () => {
								set_checks("Display", "Draw PV method", "Final position");
								win.webContents.send("set", {
									key: "hover_method",
									value: 2
								});
							}
						},
					]
				},
				{
					type: "separator"
				},
				{
					label: "Pieces",
					submenu: [
						{
							label: "Choose pieces folder...",
							click: () => {
								let folders = open_dialog({
									defaultPath: config.pieces_dialog_folder,
									properties: ["openDirectory"]
								});
								if (Array.isArray(folders) && folders.length > 0) {
									let folder = folders[0];
									win.webContents.send("call", {
										fn: "change_piece_set",
										args: [folder]
									});
									// Save the dir as the new default dir, in both processes.
									config.pieces_dialog_folder = path.dirname(folder);
									win.webContents.send("set", {
										key: "pieces_dialog_folder",
										value: path.dirname(folder)
									});
								}
							}
						},
						{
							label: "Default",
							click: () => {
								win.webContents.send("call", {
									fn: "change_piece_set",
									args: [null]
								});
							}
						},
						{
							type: "separator"
						},
						{
							label: "About custom pieces",
							click: () => {
								alert(messages.about_custom_pieces);
							}
						}
					]
				},
				{
					label: "Background",
					submenu: [
						{
							label: "Choose background image...",
							click: () => {
								let files = open_dialog({
									defaultPath: config.background_dialog_folder,
									properties: ["openFile"]
								});
								if (Array.isArray(files) && files.length > 0) {
									let file = files[0];
									win.webContents.send("call", {
										fn: "change_background",
										args: [file]
									});
									// Save the dir as the new default dir, in both processes.
									config.background_dialog_folder = path.dirname(file);
									win.webContents.send("set", {
										key: "background_dialog_folder",
										value: path.dirname(file)
									});
								}
							}
						},
						{
							label: "Default",
							click: () => {
								win.webContents.send("call", {
									fn: "change_background",
									args: [null]
								});
							}
						},
					]
				}
			]
		},
		{
			label: "Sizes",
			submenu: [
				{
					label: "Infobox font",
					submenu: [
						{
							label: "32",
							type: "checkbox",
							checked: config.info_font_size === 32,
							click: () => {
								set_checks("Sizes", "Infobox font", "32");
								win.webContents.send("call", {
									fn: "set_info_font_size",
									args: [32],
								});
							}
						},
						{
							label: "28",
							type: "checkbox",
							checked: config.info_font_size === 28,
							click: () => {
								set_checks("Sizes", "Infobox font", "28");
								win.webContents.send("call", {
									fn: "set_info_font_size",
									args: [28],
								});
							}
						},
						{
							label: "24",
							type: "checkbox",
							checked: config.info_font_size === 24,
							click: () => {
								set_checks("Sizes", "Infobox font", "24");
								win.webContents.send("call", {
									fn: "set_info_font_size",
									args: [24],
								});
							}
						},
						{
							label: "20",
							type: "checkbox",
							checked: config.info_font_size === 20,
							click: () => {
								set_checks("Sizes", "Infobox font", "20");
								win.webContents.send("call", {
									fn: "set_info_font_size",
									args: [20],
								});
							}
						},
						{
							label: "18",
							type: "checkbox",
							checked: config.info_font_size === 18,
							click: () => {
								set_checks("Sizes", "Infobox font", "18");
								win.webContents.send("call", {
									fn: "set_info_font_size",
									args: [18],
								});
							}
						},
						{
							label: "16",
							type: "checkbox",
							checked: config.info_font_size === 16,
							click: () => {
								set_checks("Sizes", "Infobox font", "16");
								win.webContents.send("call", {
									fn: "set_info_font_size",
									args: [16],
								});
							}
						},
					]
				},
				{
					label: "Move history font",
					submenu: [
						{
							label: "32",
							type: "checkbox",
							checked: config.pgn_font_size === 32,
							click: () => {
								set_checks("Sizes", "Move history font", "32");
								win.webContents.send("call", {
									fn: "set_pgn_font_size",
									args: [32],
								});
							}
						},
						{
							label: "28",
							type: "checkbox",
							checked: config.pgn_font_size === 28,
							click: () => {
								set_checks("Sizes", "Move history font", "28");
								win.webContents.send("call", {
									fn: "set_pgn_font_size",
									args: [28],
								});
							}
						},
						{
							label: "24",
							type: "checkbox",
							checked: config.pgn_font_size === 24,
							click: () => {
								set_checks("Sizes", "Move history font", "24");
								win.webContents.send("call", {
									fn: "set_pgn_font_size",
									args: [24],
								});
							}
						},
						{
							label: "20",
							type: "checkbox",
							checked: config.pgn_font_size === 20,
							click: () => {
								set_checks("Sizes", "Move history font", "20");
								win.webContents.send("call", {
									fn: "set_pgn_font_size",
									args: [20],
								});
							}
						},
						{
							label: "18",
							type: "checkbox",
							checked: config.pgn_font_size === 18,
							click: () => {
								set_checks("Sizes", "Move history font", "18");
								win.webContents.send("call", {
									fn: "set_pgn_font_size",
									args: [18],
								});
							}
						},
						{
							label: "16",
							type: "checkbox",
							checked: config.pgn_font_size === 16,
							click: () => {
								set_checks("Sizes", "Move history font", "16");
								win.webContents.send("call", {
									fn: "set_pgn_font_size",
									args: [16],
								});
							}
						},
					]
				},
				{
					type: "separator"
				},
				{
					label: "Board",
					submenu: [
						{
							label: "1280",
							type: "checkbox",
							checked: config.board_size === 1280,
							click: () => {
								set_checks("Sizes", "Board", "1280");
								win.webContents.send("call", {
									fn: "set_board_size",
									args: [1280],
								});
							}
						},
						{
							label: "1120",
							type: "checkbox",
							checked: config.board_size === 1120,
							click: () => {
								set_checks("Sizes", "Board", "1120");
								win.webContents.send("call", {
									fn: "set_board_size",
									args: [1120],
								});
							}
						},
						{
							label: "960",
							type: "checkbox",
							checked: config.board_size === 960,
							click: () => {
								set_checks("Sizes", "Board", "960");
								win.webContents.send("call", {
									fn: "set_board_size",
									args: [960],
								});
							}
						},
						{
							label: "800",
							type: "checkbox",
							checked: config.board_size === 800,
							click: () => {
								set_checks("Sizes", "Board", "800");
								win.webContents.send("call", {
									fn: "set_board_size",
									args: [800],
								});
							}
						},
						{
							label: "640",
							type: "checkbox",
							checked: config.board_size === 640,
							click: () => {
								set_checks("Sizes", "Board", "640");
								win.webContents.send("call", {
									fn: "set_board_size",
									args: [640],
								});
							}
						},
						{
							label: "576",
							type: "checkbox",
							checked: config.board_size === 576,
							click: () => {
								set_checks("Sizes", "Board", "576");
								win.webContents.send("call", {
									fn: "set_board_size",
									args: [576],
								});
							}
						},
						{
							label: "512",
							type: "checkbox",
							checked: config.board_size === 512,
							click: () => {
								set_checks("Sizes", "Board", "512");
								win.webContents.send("call", {
									fn: "set_board_size",
									args: [512],
								});
							}
						},
						{
							label: "480",
							type: "checkbox",
							checked: config.board_size === 480,
							click: () => {
								set_checks("Sizes", "Board", "480");
								win.webContents.send("call", {
									fn: "set_board_size",
									args: [480],
								});
							}
						},
						{
							label: "448",
							type: "checkbox",
							checked: config.board_size === 448,
							click: () => {
								set_checks("Sizes", "Board", "448");
								win.webContents.send("call", {
									fn: "set_board_size",
									args: [448],
								});
							}
						},
						{
							label: "416",
							type: "checkbox",
							checked: config.board_size === 416,
							click: () => {
								set_checks("Sizes", "Board", "416");
								win.webContents.send("call", {
									fn: "set_board_size",
									args: [416],
								});
							}
						},
					]
				},
				{
					label: "Arrows",
					submenu: [
						{
							label: "Giant",
							click: () => {
								win.webContents.send("call", "giant_arrows");
							}
						},
						{
							label: "Large",
							click: () => {
								win.webContents.send("call", "large_arrows");
							}
						},
						{
							label: "Medium",
							click: () => {
								win.webContents.send("call", "medium_arrows");
							}
						},
						{
							label: "Small",
							click: () => {
								win.webContents.send("call", "small_arrows");
							}
						},
					]
				},
				{
					type: "separator"
				},
				{
					label: "Graph",
					submenu: [
						{
							label: "192",
							type: "checkbox",
							checked: config.graph_height === 192,
							click: () => {
								set_checks("Sizes", "Graph", "192");
								win.webContents.send("call", {
									fn: "set_graph_height",
									args: [192],
								});
							}
						},
						{
							label: "160",
							type: "checkbox",
							checked: config.graph_height === 160,
							click: () => {
								set_checks("Sizes", "Graph", "160");
								win.webContents.send("call", {
									fn: "set_graph_height",
									args: [160],
								});
							}
						},
						{
							label: "128",
							type: "checkbox",
							checked: config.graph_height === 128,
							click: () => {
								set_checks("Sizes", "Graph", "128");
								win.webContents.send("call", {
									fn: "set_graph_height",
									args: [128],
								});
							}
						},
						{
							label: "96",
							type: "checkbox",
							checked: config.graph_height === 96,
							click: () => {
								set_checks("Sizes", "Graph", "96");
								win.webContents.send("call", {
									fn: "set_graph_height",
									args: [96],
								});
							}
						},
						{
							label: "64",
							type: "checkbox",
							checked: config.graph_height === 64,
							click: () => {
								set_checks("Sizes", "Graph", "64");
								win.webContents.send("call", {
									fn: "set_graph_height",
									args: [64],
								});
							}
						},
						{
							label: "48",
							type: "checkbox",
							checked: config.graph_height === 48,
							click: () => {
								set_checks("Sizes", "Graph", "48");
								win.webContents.send("call", {
									fn: "set_graph_height",
									args: [48],
								});
							}
						},
						{
							label: "32",
							type: "checkbox",
							checked: config.graph_height === 32,
							click: () => {
								set_checks("Sizes", "Graph", "32");
								win.webContents.send("call", {
									fn: "set_graph_height",
									args: [32],
								});
							}
						},
						{
							label: "0",
							type: "checkbox",
							checked: config.graph_height === 0,
							click: () => {
								set_checks("Sizes", "Graph", "0");
								win.webContents.send("call", {
									fn: "set_graph_height",
									args: [0],
								});
							}
						},
					]
				},
				{
					label: "Graph lines",
					submenu: [
						{
							label: "8",
							type: "checkbox",
							checked: config.graph_line_width === 8,
							click: () => {
								set_checks("Sizes", "Graph lines", "8");
								win.webContents.send("set", {
									key: "graph_line_width",
									value: 8,
								});
							}
						},
						{
							label: "7",
							type: "checkbox",
							checked: config.graph_line_width === 7,
							click: () => {
								set_checks("Sizes", "Graph lines", "7");
								win.webContents.send("set", {
									key: "graph_line_width",
									value: 7,
								});
							}
						},
						{
							label: "6",
							type: "checkbox",
							checked: config.graph_line_width === 6,
							click: () => {
								set_checks("Sizes", "Graph lines", "6");
								win.webContents.send("set", {
									key: "graph_line_width",
									value: 6,
								});
							}
						},
						{
							label: "5",
							type: "checkbox",
							checked: config.graph_line_width === 5,
							click: () => {
								set_checks("Sizes", "Graph lines", "5");
								win.webContents.send("set", {
									key: "graph_line_width",
									value: 5,
								});
							}
						},
						{
							label: "4",
							type: "checkbox",
							checked: config.graph_line_width === 4,
							click: () => {
								set_checks("Sizes", "Graph lines", "4");
								win.webContents.send("set", {
									key: "graph_line_width",
									value: 4,
								});
							}
						},
						{
							label: "3",
							type: "checkbox",
							checked: config.graph_line_width === 3,
							click: () => {
								set_checks("Sizes", "Graph lines", "3");
								win.webContents.send("set", {
									key: "graph_line_width",
									value: 3,
								});
							}
						},
						{
							label: "2",
							type: "checkbox",
							checked: config.graph_line_width === 2,
							click: () => {
								set_checks("Sizes", "Graph lines", "2");
								win.webContents.send("set", {
									key: "graph_line_width",
									value: 2,
								});
							}
						},
					]
				},
				{
					type: "separator"
				},
				{
					label: "Save window size",
					click: () => {
						win.webContents.send("call", "save_window_size");
					}
				},
				{
					type: "separator"
				},
				{
					label: "I want other size options!",
					click: () => {
						alert(messages.about_sizes);
					}
				},
			]
		},
		{
			label: "Engine",
			submenu: [
				{
					label: "Choose engine...",
					click: () => {
						let files = open_dialog({
							defaultPath: config.engine_dialog_folder,
							properties: ["openFile"]
						});
						if (Array.isArray(files) && files.length > 0) {
							let file = files[0];
							if (file === process.argv[0] || path.basename(file).includes("client")) {
								alert(messages.wrong_engine_exe);
								return;
							}
							win.webContents.send("call", {
								fn: "switch_engine",
								args: [file]
							});
							// Save the dir as the new default dir, in both processes.
							config.engine_dialog_folder = path.dirname(file);
							win.webContents.send("set", {
								key: "engine_dialog_folder",
								value: path.dirname(file)
							});
						}
					},
				},
				{
					label: "Choose weights file...",
					click: () => {
						let files = open_dialog({
							defaultPath: config.weights_dialog_folder,
							properties: ["openFile"]
						});
						if (Array.isArray(files) && files.length > 0) {
							let file = files[0];
							win.webContents.send("call", {
								fn: "switch_weights",
								args: [file]
							});
							// Save the dir as the new default dir, in both processes.
							config.weights_dialog_folder = path.dirname(file);
							win.webContents.send("set", {
								key: "weights_dialog_folder",
								value: path.dirname(file)
							});
						}
					}
				},
				{
					label: "Backend",
					submenu: [
						{
							label: "cudnn-auto",
							type: "checkbox",
							checked: config.options.Backend === "cudnn-auto",
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Backend", "cudnn-auto"]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "cudnn",
							type: "checkbox",
							checked: config.options.Backend === "cudnn",
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Backend", "cudnn"]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "cudnn-fp16",
							type: "checkbox",
							checked: config.options.Backend === "cudnn-fp16",
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Backend", "cudnn-fp16"]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							type: "separator"
						},
						{
							label: "cuda-auto",
							type: "checkbox",
							checked: config.options.Backend === "cuda-auto",
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Backend", "cuda-auto"]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "cuda",
							type: "checkbox",
							checked: config.options.Backend === "cuda",
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Backend", "cuda"]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "cuda-fp16",
							type: "checkbox",
							checked: config.options.Backend === "cuda-fp16",
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Backend", "cuda-fp16"]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							type: "separator"
						},
						{
							label: "opencl",
							type: "checkbox",
							checked: config.options.Backend === "opencl",
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Backend", "opencl"]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "dx12",
							type: "checkbox",
							checked: config.options.Backend === "dx12",
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Backend", "dx12"]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "blas",
							type: "checkbox",
							checked: config.options.Backend === "blas",
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Backend", "blas"]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "eigen",
							type: "checkbox",
							checked: config.options.Backend === "eigen",
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Backend", "eigen"]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							type: "separator"
						},
						{
							label: "random",
							type: "checkbox",
							checked: config.options.Backend === "random",
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Backend", "random"]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "roundrobin",
							type: "checkbox",
							checked: config.options.Backend === "roundrobin",
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Backend", "roundrobin"]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "multiplexing",
							type: "checkbox",
							checked: config.options.Backend === "multiplexing",
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Backend", "multiplexing"]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "demux",
							type: "checkbox",
							checked: config.options.Backend === "demux",
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Backend", "demux"]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						}
					]
				},
				{
					label: "Syzygy",
					submenu: [
						{
							label: "Choose folder...",
							type: "checkbox",
							checked: typeof config.options.SyzygyPath === "string" && config.options.SyzygyPath !== "",
							click: () => {
								let folders = open_dialog({
									defaultPath: config.syzygy_dialog_folder,
									properties: ["openDirectory"]
								});
								if (Array.isArray(folders) && folders.length > 0) {
									let folder = folders[0];
									win.webContents.send("call", {
										fn: "set_uci_option_permanent",
										args: ["SyzygyPath", folder]			// FIXME: should send all folders, separated by system separator.
									});
									// Will receive an ack IPC which sets menu checks.
									// Save the dir as the new default dir, in both processes.
									config.syzygy_dialog_folder = path.dirname(folder);
									win.webContents.send("set", {
										key: "syzygy_dialog_folder",
										value: path.dirname(folder)
									});
								} else {
									win.webContents.send("call", {
										fn: "send_ack_setoption",
										args: ["SyzygyPath"]					// Force an ack IPC to fix our menu check state.
									});
								}
							}
						},
						{
							label: "Disable",
							click: () => {
								win.webContents.send("call", "disable_syzygy");
								// Will receive an ack IPC which sets menu checks.
							}
						}
					]
				},
				{
					type: "separator"
				},
				{
					label: "Node limit - normal",
					submenu: [
						{
							label: "Unlimited",
							accelerator: "CommandOrControl+U",
							type: "checkbox",
							checked: typeof config.search_nodes !== "number",
							click: () => {
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [null]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							type: "separator"
						},
						{
							label: "100,000,000",
							type: "checkbox",
							checked: config.search_nodes === 100 * million,
							click: () => {
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [100 * million]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "10,000,000",
							type: "checkbox",
							checked: config.search_nodes === 10 * million,
							click: () => {
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [10 * million]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "1,000,000",
							type: "checkbox",
							checked: config.search_nodes === 1 * million,
							click: () => {
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [1 * million]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "100,000",
							type: "checkbox",
							checked: config.search_nodes === 100000,
							click: () => {
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [100000]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "10,000",
							type: "checkbox",
							checked: config.search_nodes === 10000,
							click: () => {
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [10000]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "1,000",
							type: "checkbox",
							checked: config.search_nodes === 1000,
							click: () => {
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [1000]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "100",
							type: "checkbox",
							checked: config.search_nodes === 100,
							click: () => {
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [100]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "10",
							type: "checkbox",
							checked: config.search_nodes === 10,
							click: () => {
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [10]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "1",
							type: "checkbox",
							checked: config.search_nodes === 1,
							click: () => {
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [1]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							type: "separator",
						},
						{
							label: "Up slightly",
							accelerator: "CommandOrControl+=",
							click: () => {
								win.webContents.send("call", {
									fn: "adjust_node_limit",
									args: [1, false]
								});
							}
						},
						{
							label: "Down slightly",
							accelerator: "CommandOrControl+-",
							click: () => {
								win.webContents.send("call", {
									fn: "adjust_node_limit",
									args: [-1, false]
								});
							}
						},
					]
				},
				{
					label: "Node limit - auto-eval / play",
					submenu: [
						{
							label: "4,000,000",
							type: "checkbox",
							checked: config.search_nodes_special === 4 * million,
							click: () => {
								win.webContents.send("call", {
									fn: "set_node_limit_special",
									args: [4 * million]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "2,000,000",
							type: "checkbox",
							checked: config.search_nodes_special === 2 * million,
							click: () => {
								win.webContents.send("call", {
									fn: "set_node_limit_special",
									args: [2 * million]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "1,000,000",
							type: "checkbox",
							checked: config.search_nodes_special === 1 * million,
							click: () => {
								win.webContents.send("call", {
									fn: "set_node_limit_special",
									args: [1 * million]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "400,000",
							type: "checkbox",
							checked: config.search_nodes_special === 400000,
							click: () => {
								win.webContents.send("call", {
									fn: "set_node_limit_special",
									args: [400000]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "200,000",
							type: "checkbox",
							checked: config.search_nodes_special === 200000,
							click: () => {
								win.webContents.send("call", {
									fn: "set_node_limit_special",
									args: [200000]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "100,000",
							type: "checkbox",
							checked: config.search_nodes_special === 100000,
							click: () => {
								win.webContents.send("call", {
									fn: "set_node_limit_special",
									args: [100000]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "40,000",
							type: "checkbox",
							checked: config.search_nodes_special === 40000,
							click: () => {
								win.webContents.send("call", {
									fn: "set_node_limit_special",
									args: [40000]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "20,000",
							type: "checkbox",
							checked: config.search_nodes_special === 20000,
							click: () => {
								win.webContents.send("call", {
									fn: "set_node_limit_special",
									args: [20000]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "10,000",
							type: "checkbox",
							checked: config.search_nodes_special === 10000,
							click: () => {
								win.webContents.send("call", {
									fn: "set_node_limit_special",
									args: [10000]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "4,000",
							type: "checkbox",
							checked: config.search_nodes_special === 4000,
							click: () => {
								win.webContents.send("call", {
									fn: "set_node_limit_special",
									args: [4000]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "2,000",
							type: "checkbox",
							checked: config.search_nodes_special === 2000,
							click: () => {
								win.webContents.send("call", {
									fn: "set_node_limit_special",
									args: [2000]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "1,000",
							type: "checkbox",
							checked: config.search_nodes_special === 1000,
							click: () => {
								win.webContents.send("call", {
									fn: "set_node_limit_special",
									args: [1000]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "400",
							type: "checkbox",
							checked: config.search_nodes_special === 400,
							click: () => {
								win.webContents.send("call", {
									fn: "set_node_limit_special",
									args: [400]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "200",
							type: "checkbox",
							checked: config.search_nodes_special === 200,
							click: () => {
								win.webContents.send("call", {
									fn: "set_node_limit_special",
									args: [200]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "100",
							type: "checkbox",
							checked: config.search_nodes_special === 100,
							click: () => {
								win.webContents.send("call", {
									fn: "set_node_limit_special",
									args: [100]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "2",
							type: "checkbox",
							checked: config.search_nodes_special === 2,
							click: () => {
								win.webContents.send("call", {
									fn: "set_node_limit_special",
									args: [2]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "1",
							type: "checkbox",
							checked: config.search_nodes_special === 1,
							click: () => {
								win.webContents.send("call", {
									fn: "set_node_limit_special",
									args: [1]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							type: "separator",
						},
						{
							label: "Up slightly",
							accelerator: "CommandOrControl+]",
							click: () => {
								win.webContents.send("call", {
									fn: "adjust_node_limit",
									args: [1, true]
								});
							}
						},
						{
							label: "Down slightly",
							accelerator: "CommandOrControl+[",
							click: () => {
								win.webContents.send("call", {
									fn: "adjust_node_limit",
									args: [-1, true]
								});
							}
						},
					]
				},
				{
					type: "separator"
				},
				{
					label: "Threads",
					submenu: [
						{
							label: "128",
							type: "checkbox",
							checked: config.options.Threads === 128,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Threads", 128],
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "96",
							type: "checkbox",
							checked: config.options.Threads === 96,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Threads", 96],
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "64",
							type: "checkbox",
							checked: config.options.Threads === 64,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Threads", 64],
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "48",
							type: "checkbox",
							checked: config.options.Threads === 48,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Threads", 48],
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "32",
							type: "checkbox",
							checked: config.options.Threads === 32,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Threads", 32],
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "24",
							type: "checkbox",
							checked: config.options.Threads === 24,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Threads", 24],
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "16",
							type: "checkbox",
							checked: config.options.Threads === 16,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Threads", 16],
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "14",
							type: "checkbox",
							checked: config.options.Threads === 14,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Threads", 14],
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "12",
							type: "checkbox",
							checked: config.options.Threads === 12,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Threads", 12],
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "10",
							type: "checkbox",
							checked: config.options.Threads === 10,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Threads", 10],
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "8",
							type: "checkbox",
							checked: config.options.Threads === 8,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Threads", 8],
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "7",
							type: "checkbox",
							checked: config.options.Threads === 7,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Threads", 7],
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "6",
							type: "checkbox",
							checked: config.options.Threads === 6,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Threads", 6],
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "5",
							type: "checkbox",
							checked: config.options.Threads === 5,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Threads", 5],
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "4",
							type: "checkbox",
							checked: config.options.Threads === 4,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Threads", 4],
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "3",
							type: "checkbox",
							checked: config.options.Threads === 3,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Threads", 3],
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "2",
							type: "checkbox",
							checked: config.options.Threads === 2,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Threads", 2],
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "1",
							type: "checkbox",
							checked: config.options.Threads === 1,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Threads", 1],
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							type: "separator"
						},
						{
							label: "Warning about threads",
							click: () => {
								alert(messages.thread_warning);
							}
						},
					]
				},
				{
					type: "separator"
				},
				{
					label: "Custom scripts",
					submenu: scriptlist_in_menu			// Will be filled at the end, see below.
				},
				{
					type: "separator"
				},
				{
					label: "Restart engine",
					click: () => {
						win.webContents.send("call", "restart_engine");
					}
				},
				{
					label: "Soft engine reset",
					click: () => {
						win.webContents.send("call", "soft_engine_reset");
					}
				},
			]
		},
		{
			label: "Play",
			submenu: [
				{
					label: "Play this colour",
					accelerator: "F9",
					click: () => {
						win.webContents.send("call", "play_this_colour");
					}
				},
				{
					type: "separator"
				},
				{
					label: "Start self-play",
					accelerator: "F11",
					click: () => {
						win.webContents.send("call", {
							fn: "set_behaviour",
							args: ["self_play"],
						});
					}
				},
				{
					label: "Halt",
					click: () => {
						win.webContents.send("call", {
							fn: "set_behaviour",
							args: ["halt"],
						});
					}
				},
				{
					type: "separator"
				},
				{
					label: "Use PGN book...",
					type: "checkbox",
					checked: false,				// FIXME if we store this over time.
					click: () => {
						let files = open_dialog({
							defaultPath: config.book_dialog_folder,
							properties: ["openFile"]
						});
						if (Array.isArray(files) && files.length > 0) {
							let file = files[0];
							win.webContents.send("call", {
								fn: "load_book",
								args: [file]
							});
							// Will receive an ack IPC which sets menu checks.
							// Save the dir as the new default dir, in both processes.
							config.book_dialog_folder = path.dirname(file);
							win.webContents.send("set", {
								key: "book_dialog_folder",
								value: path.dirname(file)
							});
						} else {
							win.webContents.send("call", "send_ack_book");		// Force an ack IPC to fix our menu check state.
						}
					}
				},
				{
					label: "Unload book",
					click: () => {
						win.webContents.send("call", "unload_book");
						// Will receive an ack IPC which sets menu checks.
					}
				},
				{
					type: "separator"
				},
				{
					label: "Temperature",
					submenu: [
						{
							label: "1.0",
							type: "checkbox",
							checked: config.options.Temperature === 1.0,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Temperature", 1.0]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "0.9",
							type: "checkbox",
							checked: config.options.Temperature === 0.9,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Temperature", 0.9]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "0.8",
							type: "checkbox",
							checked: config.options.Temperature === 0.8,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Temperature", 0.8]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "0.7",
							type: "checkbox",
							checked: config.options.Temperature === 0.7,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Temperature", 0.7]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "0.6",
							type: "checkbox",
							checked: config.options.Temperature === 0.6,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Temperature", 0.6]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "0.5",
							type: "checkbox",
							checked: config.options.Temperature === 0.5,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Temperature", 0.5]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "0.4",
							type: "checkbox",
							checked: config.options.Temperature === 0.4,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Temperature", 0.4]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "0.3",
							type: "checkbox",
							checked: config.options.Temperature === 0.3,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Temperature", 0.3]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "0.2",
							type: "checkbox",
							checked: config.options.Temperature === 0.2,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Temperature", 0.2]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "0.1",
							type: "checkbox",
							checked: config.options.Temperature === 0.1,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Temperature", 0.1]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "0",
							type: "checkbox",
							checked: config.options.Temperature === 0,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["Temperature", 0]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
					]
				},
				{
					label: "TempDecayMoves",
					submenu: [
						{
							label: "Infinite",
							type: "checkbox",
							checked: config.options.TempDecayMoves === 0,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["TempDecayMoves", 0]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "20",
							type: "checkbox",
							checked: config.options.TempDecayMoves === 20,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["TempDecayMoves", 20]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "18",
							type: "checkbox",
							checked: config.options.TempDecayMoves === 18,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["TempDecayMoves", 18]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "16",
							type: "checkbox",
							checked: config.options.TempDecayMoves === 16,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["TempDecayMoves", 16]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "14",
							type: "checkbox",
							checked: config.options.TempDecayMoves === 14,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["TempDecayMoves", 14]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "12",
							type: "checkbox",
							checked: config.options.TempDecayMoves === 12,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["TempDecayMoves", 12]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "10",
							type: "checkbox",
							checked: config.options.TempDecayMoves === 10,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["TempDecayMoves", 10]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "8",
							type: "checkbox",
							checked: config.options.TempDecayMoves === 8,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["TempDecayMoves", 8]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "6",
							type: "checkbox",
							checked: config.options.TempDecayMoves === 6,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["TempDecayMoves", 6]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "4",
							type: "checkbox",
							checked: config.options.TempDecayMoves === 4,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["TempDecayMoves", 4]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
						{
							label: "2",
							type: "checkbox",
							checked: config.options.TempDecayMoves === 2,
							click: () => {
								win.webContents.send("call", {
									fn: "set_uci_option_permanent",
									args: ["TempDecayMoves", 2]
								});
								// Will receive an ack IPC which sets menu checks.
							}
						},
					]
				},
				{
					type: "separator"
				},
				{
					label: "About play modes",
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
				},
				{
					type: "separator"
				},
				{
					label: "Permanently enable save",
					click: () => {
						config.save_enabled = true;			// The main process actually uses this variable...
						win.webContents.send("set", {		// But it's the renderer process that saves the
							key: "save_enabled",			// config file.
							value: true,
						});
					}
				},
				{
					type: "separator"
				},
				{
					label: `Show ${config_io.filename}`,
					click: () => {
						electron.shell.showItemInFolder(config_io.filepath);
					}
				},
				{
					label: `Resave ${config_io.filename}`,
					click: () => {
						win.webContents.send("call", "save_config");
					}
				},
				{
					type: "separator"
				},
				{
					label: "Random move",
					accelerator: "CommandOrControl+/",
					click: () => {
						win.webContents.send("call", "random_move");
					}
				},
				{
					type: "separator"
				},
				{
					label: "Spin rate",
					submenu: [
						{
							label: "Frenetic",
							type: "checkbox",
							checked: config.update_delay === 25,
							click: () => {
								set_checks("Dev", "Spin rate", "Frenetic");
								win.webContents.send("set", {
									key: "update_delay",
									value: 25,
								});
							}
						},
						{
							label: "Fast",
							type: "checkbox",
							checked: config.update_delay === 60,
							click: () => {
								set_checks("Dev", "Spin rate", "Fast");
								win.webContents.send("set", {
									key: "update_delay",
									value: 60,
								});
							}
						},
						{
							label: "Normal",
							type: "checkbox",
							checked: config.update_delay === 125,
							click: () => {
								set_checks("Dev", "Spin rate", "Normal");
								win.webContents.send("set", {
									key: "update_delay",
									value: 125,
								});
							}
						},
						{
							label: "Relaxed",
							type: "checkbox",
							checked: config.update_delay === 170,
							click: () => {
								set_checks("Dev", "Spin rate", "Relaxed");
								win.webContents.send("set", {
									key: "update_delay",
									value: 170,
								});
							}
						},
					]
				},
				{
					type: "separator"
				},
				{
					label: "Query sync status",
					click: () => {
						win.webContents.send("call", "query_sync_status");
					}
				},
				{
					label: "Query dropped inputs",
					click: () => {
						win.webContents.send("call", "query_dropped_inputs");
					}
				},
				{
					label: "Show engine state",
					type: "checkbox",
					checked: config.show_engine_state,
					click: () => {
						win.webContents.send("call", {
							fn: "toggle",
							args: ["show_engine_state"]
						});
					}
				},
				{
					type: "separator"
				},
				{
					label: "Allow arbitrary scripts",
					type: "checkbox",
					checked: config.allow_arbitrary_scripts,
					click: () => {
						win.webContents.send("call", {
							fn: "toggle",
							args: ["allow_arbitrary_scripts"],
						});
					}
				},
				{
					type: "separator"
				},
				{
					label: "A/B MultiPV",
					submenu: [
						{
							label: "5",
							type: "checkbox",
							checked: config.ab_engine_multipv === 5,
							click: () => {
								win.webContents.send("call", {
									fn: "set_ab_engine_multipv",
									args: [5]
								});
								set_checks("Dev", "A/B MultiPV", "5");
							}
						},
						{
							label: "4",
							type: "checkbox",
							checked: config.ab_engine_multipv === 4,
							click: () => {
								win.webContents.send("call", {
									fn: "set_ab_engine_multipv",
									args: [4]
								});
								set_checks("Dev", "A/B MultiPV", "4");
							}
						},
						{
							label: "3",
							type: "checkbox",
							checked: config.ab_engine_multipv === 3,
							click: () => {
								win.webContents.send("call", {
									fn: "set_ab_engine_multipv",
									args: [3]
								});
								set_checks("Dev", "A/B MultiPV", "3");
							}
						},
						{
							label: "2",
							type: "checkbox",
							checked: config.ab_engine_multipv === 2,
							click: () => {
								win.webContents.send("call", {
									fn: "set_ab_engine_multipv",
									args: [2]
								});
								set_checks("Dev", "A/B MultiPV", "2");
							}
						},
						{
							label: "1",
							type: "checkbox",
							checked: config.ab_engine_multipv === 1,
							click: () => {
								win.webContents.send("call", {
									fn: "set_ab_engine_multipv",
									args: [1]
								});
								set_checks("Dev", "A/B MultiPV", "1");
							}
						},
					]
				},
				{
					type: "separator"
				},
				{
					label: "Log RAM state to console",
					click: () => {
						win.webContents.send("call", "log_ram");
					}
				},
				{
					label: "Fire GC",
					click: () => {
						win.webContents.send("call", "fire_gc");
					}
				},
				{
					type: "separator"
				},
				{
					label: "Use logfile...",
					type: "checkbox",
					checked: typeof config.logfile === "string" && config.logfile !== "",
					click: () => {
						let file = save_dialog();
						if (typeof file === "string" && file.length > 0) {
							win.webContents.send("call", {
								fn: "start_logging",
								args: [file]
							});
							// Will receive an ack IPC which sets menu checks.
						} else {
							win.webContents.send("call", "send_ack_logfile");		// Force an ack IPC to fix our menu check state.
						}
					}
				},
				{
					label: "Disable logging",
					click: () => {
						win.webContents.send("call", "stop_logging");
						// Will receive an ack IPC which sets menu checks.
					}
				},
				{
					type: "separator"
				},
				{
					label: "Log illegal moves",
					type: "checkbox",
					checked: config.log_illegal_moves,
					click: () => {
						win.webContents.send("call", {
							fn: "toggle",
							args: ["log_illegal_moves"],
						});
					}
				},
				{
					label: "Log positions",
					type: "checkbox",
					checked: config.log_positions,
					click: () => {
						win.webContents.send("call", {
							fn: "toggle",
							args: ["log_positions"],
						});
					}
				},
				{
					label: "Log info lines",
					type: "checkbox",
					checked: config.log_info_lines,
					click: () => {
						win.webContents.send("call", {
							fn: "toggle",
							args: ["log_info_lines"],
						});
					}
				},
				{
					label: "...including useless lines",
					type: "checkbox",
					checked: config.log_useless_info,
					click: () => {
						win.webContents.send("call", {
							fn: "toggle",
							args: ["log_useless_info"],
						});
					}
				},
			]
		}
	];

	// Some special shennanigans to build the custom scripts menu...

	let scriptlist = custom_uci.load();

	for (let script of scriptlist) {
		scriptlist_in_menu.push({
			label: script.name,
			click: () => {
				win.webContents.send("call", {
					fn: "run_script",
					args: [script.path]
				});
			}
		});
	}

	if (scriptlist_in_menu.length > 0) {
		scriptlist_in_menu.push({type: "separator"});
	}
	scriptlist_in_menu.push({
		label: "How to add scripts",
		click: () => {
			alert(messages.adding_scripts);
		}
	});
	scriptlist_in_menu.push({
		label: `Show scripts folder`,
		click: () => {
			electron.shell.showItemInFolder(custom_uci.script_dir_path);
		}
	});

	// Actually build the menu...

	return electron.Menu.buildFromTemplate(template);
}

function get_submenu_items(menupath) {

	// If the path is to a submenu, this returns a list of all items in the submenu.
	// If the path is to a specific menu item, it just returns that item.

	let o = menu.items;
	for (let p of menupath) {
		for (let item of o) {
			if (item.label === p) {
				if (item.submenu) {
					o = item.submenu.items;
					break;
				} else {
					return item;		// No submenu so this must be the end.
				}
			}
		}
	}
	return o;
}

function set_checks(...menupath) {

	if (!menu_is_set) {
		return;
	}

	// Since I don't know precisely how the menu works behind the scenes,
	// give a little time for the original click to go through first.

	setTimeout(() => {
		let items = get_submenu_items(menupath.slice(0, -1));
		for (let n = 0; n < items.length; n++) {
			if (items[n].checked !== undefined) {
				items[n].checked = items[n].label === menupath[menupath.length - 1];
			}
		}
	}, 50);
}

function set_one_check(state, ...menupath) {

	state = state ? true : false;

	if (!menu_is_set) {
		return;
	}

	let item = get_submenu_items(menupath);
	if (item.checked !== undefined) {
		item.checked = state;
	}
}
