"use strict";

const electron = require("electron");

// The docs are a bit vague but it seems there's a limited timeframe
// in which command line flags can be passed, so do this ASAP...

electron.app.commandLine.appendSwitch("js-flags", "--expose_gc");

// Other requires...

const alert = require("./modules/alert");
const config_io = require("./modules/config_io");
const custom_uci = require("./modules/custom_uci");
const messages = require("./modules/messages");
const path = require("path");
const running_as_electron = require("./modules/running_as_electron");
const url = require("url");

// We want sync save and open dialogs. In Electron 5 we could get these by calling
// showSaveDialog or showOpenDialog without a callback, but in Electron 6 this no
// longer works and we must call new functions. So find out if they exist...

const save_dialog = electron.dialog.showSaveDialogSync || electron.dialog.showSaveDialog;
const open_dialog = electron.dialog.showOpenDialogSync || electron.dialog.showOpenDialog;

// Note that as the user adjusts menu items, our copy of the config will become
// out of date. The renderer is responsible for having an up-to-date copy.

let config = config_io.load();		// Do this early, it's a needed global.

let win;
let menu = menu_build();

let loaded_engine = config.path;
let loaded_weights = config.options.WeightsFile || null;

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
			nodeIntegration: true,
			zoomFactor: 1 / electron.screen.getPrimaryDisplay().scaleFactor		// Unreliable, see https://github.com/electron/electron/issues/10572
		}
	});

	win.once("ready-to-show", () => {
		win.webContents.setZoomFactor(1 / electron.screen.getPrimaryDisplay().scaleFactor);		// This seems to work, note issue 10572 above.
		// win.webContents.zoomFactor = 1 / electron.screen.getPrimaryDisplay().scaleFactor;	// The method above is deprecated. This line will be best in future.
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

	electron.ipcMain.on("set_title", (event, msg) => {
		win.setTitle(msg);
	});

	// Actually load the page last, I guess, so the event handlers above are already set up...

	win.loadURL(url.format({
		protocol: "file:",
		pathname: path.join(__dirname, "nibbler.html"),
		slashes: true
	}));

	electron.Menu.setApplicationMenu(menu);
}

function menu_build() {

	const million = 1000000;

	let cclist_in_menu = [];

	let template = [
		{
			label: "App",
			submenu: [
				{
					label: "About",
					click: () => {
						alert(`Nibbler ${electron.app.getVersion()} in Electron ${process.versions.electron}\n\nEngine: ${loaded_engine}\nWeights: ${loaded_weights}`);
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
					label: "Load PGN from clipboard",
					click: () => {
						win.webContents.send("call", {
							fn: "load_pgn_from_string",
							args: [electron.clipboard.readText()]
						});
					}
				},
				{
					type: "separator"
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
					type: "separator"
				},
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
					label: "Write infobox to clipboard",
					click: () => {
						win.webContents.send("call", "infobox_to_clipboard");
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
					label: `Show ${config_io.filename}`,
					click: () => {
						electron.shell.showItemInFolder(config_io.filepath);
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
					label: "...with click spotlight",
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
								set_checks("Analysis", "Arrowhead type", "Winrate");
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
								set_checks("Analysis", "Arrowhead type", "Node %");
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
								set_checks("Analysis", "Arrowhead type", "Policy");
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
								set_checks("Analysis", "Arrowhead type", "MultiPV rank");
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
								set_checks("Analysis", "Moves to show", "All moves");
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
								set_checks("Analysis", "Moves to show", "U < 0.2");
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
								set_checks("Analysis", "Moves to show", "U < 0.175");
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
								set_checks("Analysis", "Moves to show", "U < 0.15");
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
								set_checks("Analysis", "Moves to show", "U < 0.125");
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
								set_checks("Analysis", "Moves to show", "U < 0.1");
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
								set_checks("Analysis", "Moves to show", "U < 0.075");
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
								set_checks("Analysis", "Moves to show", "U < 0.05");
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
								set_checks("Analysis", "Moves to show", "U < 0.025");
								win.webContents.send("set", {
									key: "uncertainty_cutoff",
									value: 0.025
								});
							}
						},
						{
							label: "Top move only",
							type: "checkbox",
							checked: config.uncertainty_cutoff === -999,				// Semi-special value we use
							click: () => {
								set_checks("Analysis", "Moves to show", "Top move only");
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
							label: "About U",
							click: () => {
								alert(messages.about_move_display);
							}
						}
					]
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
							label: "...from white's POV",
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
							label: "Q+U",
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
							label: "D - draw chance",
							type: "checkbox",
							checked: config.show_d,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["show_d"],
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
								set_checks("Analysis", "Draw PV method", "Animate");
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
								set_checks("Analysis", "Draw PV method", "Single move");
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
								set_checks("Analysis", "Draw PV method", "Final position");
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
					label: "Serious Analysis saved stats",
					submenu: [
						{
							label: "EV",
							type: "checkbox",
							checked: config.sam_ev,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["sam_ev"],
								});
							}
						},
						{
							label: "N (%)",
							type: "checkbox",
							checked: config.sam_n,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["sam_n"],
								});
							}
						},
						{
							label: "N (absolute)",
							type: "checkbox",
							checked: config.sam_n_abs,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["sam_n_abs"],
								});
							}
						},
						{
							label: "Total nodes",
							type: "checkbox",
							checked: config.sam_of_n,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["sam_of_n"],
								});
							}
						},
						{
							type: "separator"
						},
						{
							label: "P",
							type: "checkbox",
							checked: config.sam_p,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["sam_p"],
								});
							}
						},
						{
							label: "V",
							type: "checkbox",
							checked: config.sam_v,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["sam_v"],
								});
							}
						},
						{
							type: "separator"
						},
						{
							label: "Q",
							type: "checkbox",
							checked: config.sam_q,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["sam_q"],
								});
							}
						},
						{
							label: "U",
							type: "checkbox",
							checked: config.sam_u,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["sam_u"],
								});
							}
						},
						{
							label: "Q+U",
							type: "checkbox",
							checked: config.sam_s,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["sam_s"],
								});
							}
						},
						{
							type: "separator"
						},
						{
							label: "M",
							type: "checkbox",
							checked: config.sam_m,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["sam_m"],
								});
							}
						},
						{
							label: "D",
							type: "checkbox",
							checked: config.sam_d,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["sam_d"],
								});
							}
						},
						{
							label: "WDL",
							type: "checkbox",
							checked: config.sam_wdl,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["sam_wdl"],
								});
							}
						},
					]
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
			label: "Engine",
			submenu: [
				{
					label: "Choose engine...",
					click: () => {
						let files = open_dialog({
							defaultPath: config.engine_dialog_folder,
							properties: ["openFile"]
						});
						if (Array.isArray(files) && files.length > 0 && files[0] !== process.argv[0]) {
							let file = files[0];
							win.webContents.send("call", {
								fn: "switch_engine",
								args: [file]
							});
							loaded_engine = file;
							// Save the dir as the new default dir, in both processes.
							config.engine_dialog_folder = path.dirname(file);
							win.webContents.send("set", {
								key: "engine_dialog_folder",
								value: path.dirname(file)
							});
						}
					}
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
							loaded_weights = file;
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
								set_checks("Engine", "Backend", "cudnn-auto");
								win.webContents.send("call", {
									fn: "switch_backend",
									args: ["cudnn-auto"]
								});
							}
						},
						{
							label: "cudnn",
							type: "checkbox",
							checked: config.options.Backend === "cudnn",
							click: () => {
								set_checks("Engine", "Backend", "cudnn");
								win.webContents.send("call", {
									fn: "switch_backend",
									args: ["cudnn"]
								});
							}
						},
						{
							label: "cudnn-fp16",
							type: "checkbox",
							checked: config.options.Backend === "cudnn-fp16",
							click: () => {
								set_checks("Engine", "Backend", "cudnn-fp16");
								win.webContents.send("call", {
									fn: "switch_backend",
									args: ["cudnn-fp16"]
								});
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
								set_checks("Engine", "Backend", "opencl");
								win.webContents.send("call", {
									fn: "switch_backend",
									args: ["opencl"]
								});
							}
						},
						{
							label: "dx12",
							type: "checkbox",
							checked: config.options.Backend === "dx12",
							click: () => {
								set_checks("Engine", "Backend", "dx12");
								win.webContents.send("call", {
									fn: "switch_backend",
									args: ["dx12"]
								});
							}
						},
						{
							label: "blas",
							type: "checkbox",
							checked: config.options.Backend === "blas",
							click: () => {
								set_checks("Engine", "Backend", "blas");
								win.webContents.send("call", {
									fn: "switch_backend",
									args: ["blas"]
								});
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
								set_checks("Engine", "Backend", "random");
								win.webContents.send("call", {
									fn: "switch_backend",
									args: ["random"]
								});
							}
						},
						{
							label: "check",
							type: "checkbox",
							checked: config.options.Backend === "check",
							click: () => {
								set_checks("Engine", "Backend", "check");
								win.webContents.send("call", {
									fn: "switch_backend",
									args: ["check"]
								});
							}
						},
						{
							label: "roundrobin",
							type: "checkbox",
							checked: config.options.Backend === "roundrobin",
							click: () => {
								set_checks("Engine", "Backend", "roundrobin");
								win.webContents.send("call", {
									fn: "switch_backend",
									args: ["roundrobin"]
								});
							}
						},
						{
							label: "multiplexing",
							type: "checkbox",
							checked: config.options.Backend === "multiplexing",
							click: () => {
								set_checks("Engine", "Backend", "multiplexing");
								win.webContents.send("call", {
									fn: "switch_backend",
									args: ["multiplexing"]
								});
							}
						},
						{
							label: "demux",
							type: "checkbox",
							checked: config.options.Backend === "demux",
							click: () => {
								set_checks("Engine", "Backend", "demux");
								win.webContents.send("call", {
									fn: "switch_backend",
									args: ["demux"]
								});
							}
						}
					]
				},
				{
					type: "separator"
				},
				{
					label: "Reset Lc0 cache",
					accelerator: "F12",
					click: () => {
						win.webContents.send("call", "reset_leela_cache");
					}
				},
				{
					type: "separator"
				},
				{
					label: "Node limit",
					submenu: [
						{
							label: "Infinite",
							type: "checkbox",
							checked: typeof config.search_nodes !== "number",
							click: () => {
								set_checks("Engine", "Node limit", "Infinite");
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [null]
								});
							}
						},
						{
							type: "separator"
						},
						{
							label: "256,000,000",
							type: "checkbox",
							checked: config.search_nodes === 256 * million,
							click: () => {
								set_checks("Engine", "Node limit", "256,000,000");
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [256 * million]
								});
							}
						},
						{
							label: "64,000,000",
							type: "checkbox",
							checked: config.search_nodes === 64 * million,
							click: () => {
								set_checks("Engine", "Node limit", "64,000,000");
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [64 * million]
								});
							}
						},
						{
							label: "16,000,000",
							type: "checkbox",
							checked: config.search_nodes === 16 * million,
							click: () => {
								set_checks("Engine", "Node limit", "16,000,000");
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [16 * million]
								});
							}
						},
						{
							label: "4,000,000",
							type: "checkbox",
							checked: config.search_nodes === 4 * million,
							click: () => {
								set_checks("Engine", "Node limit", "4,000,000");
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [4 * million]
								});
							}
						},
						{
							label: "1,000,000",
							type: "checkbox",
							checked: config.search_nodes === 1 * million,
							click: () => {
								set_checks("Engine", "Node limit", "1,000,000");
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [1 * million]
								});
							}
						},
						{
							type: "separator"
						},
						{
							label: "256,000",
							type: "checkbox",
							checked: config.search_nodes === 256000,
							click: () => {
								set_checks("Engine", "Node limit", "256,000");
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [256000]
								});
							}
						},
						{
							label: "64,000",
							type: "checkbox",
							checked: config.search_nodes === 64000,
							click: () => {
								set_checks("Engine", "Node limit", "64,000");
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [64000]
								});
							}
						},
						{
							label: "16,000",
							type: "checkbox",
							checked: config.search_nodes === 16000,
							click: () => {
								set_checks("Engine", "Node limit", "16,000");
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [16000]
								});
							}
						},
						{
							label: "4,000",
							type: "checkbox",
							checked: config.search_nodes === 4000,
							click: () => {
								set_checks("Engine", "Node limit", "4,000");
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [4000]
								});
							}
						},
						{
							label: "1,000",
							type: "checkbox",
							checked: config.search_nodes === 1000,
							click: () => {
								set_checks("Engine", "Node limit", "1,000");
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [1000]
								});
							}
						},
						{
							type: "separator"
						},
						{
							label: "256",
							type: "checkbox",
							checked: config.search_nodes === 256,
							click: () => {
								set_checks("Engine", "Node limit", "256");
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [256]
								});
							}
						},
						{
							label: "64",
							type: "checkbox",
							checked: config.search_nodes === 64,
							click: () => {
								set_checks("Engine", "Node limit", "64");
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [64]
								});
							}
						},
						{
							label: "16",
							type: "checkbox",
							checked: config.search_nodes === 16,
							click: () => {
								set_checks("Engine", "Node limit", "16");
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [16]
								});
							}
						},
						{
							label: "4",
							type: "checkbox",
							checked: config.search_nodes === 4,
							click: () => {
								set_checks("Engine", "Node limit", "4");
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [4]
								});
							}
						},
						{
							label: "1",
							type: "checkbox",
							checked: config.search_nodes === 1,
							click: () => {
								set_checks("Engine", "Node limit", "1");
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [1]
								});
							}
						},
					]
				},
				{
					label: "Threads",
					submenu: [
						{
							label: "128",
							type: "checkbox",
							checked: config.options.Threads === 128,
							click: () => {
								set_checks("Engine", "Threads", "128");
								win.webContents.send("call", {
									fn: "set_threads",
									args: [128],
								});
							}
						},
						{
							label: "96",
							type: "checkbox",
							checked: config.options.Threads === 96,
							click: () => {
								set_checks("Engine", "Threads", "96");
								win.webContents.send("call", {
									fn: "set_threads",
									args: [96],
								});
							}
						},
						{
							label: "64",
							type: "checkbox",
							checked: config.options.Threads === 64,
							click: () => {
								set_checks("Engine", "Threads", "64");
								win.webContents.send("call", {
									fn: "set_threads",
									args: [64],
								});
							}
						},
						{
							label: "48",
							type: "checkbox",
							checked: config.options.Threads === 48,
							click: () => {
								set_checks("Engine", "Threads", "48");
								win.webContents.send("call", {
									fn: "set_threads",
									args: [48],
								});
							}
						},
						{
							label: "32",
							type: "checkbox",
							checked: config.options.Threads === 32,
							click: () => {
								set_checks("Engine", "Threads", "32");
								win.webContents.send("call", {
									fn: "set_threads",
									args: [32],
								});
							}
						},
						{
							label: "24",
							type: "checkbox",
							checked: config.options.Threads === 24,
							click: () => {
								set_checks("Engine", "Threads", "24");
								win.webContents.send("call", {
									fn: "set_threads",
									args: [24],
								});
							}
						},
						{
							label: "16",
							type: "checkbox",
							checked: config.options.Threads === 16,
							click: () => {
								set_checks("Engine", "Threads", "16");
								win.webContents.send("call", {
									fn: "set_threads",
									args: [16],
								});
							}
						},
						{
							label: "14",
							type: "checkbox",
							checked: config.options.Threads === 14,
							click: () => {
								set_checks("Engine", "Threads", "14");
								win.webContents.send("call", {
									fn: "set_threads",
									args: [14],
								});
							}
						},
						{
							label: "12",
							type: "checkbox",
							checked: config.options.Threads === 12,
							click: () => {
								set_checks("Engine", "Threads", "12");
								win.webContents.send("call", {
									fn: "set_threads",
									args: [12],
								});
							}
						},
						{
							label: "10",
							type: "checkbox",
							checked: config.options.Threads === 10,
							click: () => {
								set_checks("Engine", "Threads", "10");
								win.webContents.send("call", {
									fn: "set_threads",
									args: [10],
								});
							}
						},
						{
							label: "8",
							type: "checkbox",
							checked: config.options.Threads === 8,
							click: () => {
								set_checks("Engine", "Threads", "8");
								win.webContents.send("call", {
									fn: "set_threads",
									args: [8],
								});
							}
						},
						{
							label: "7",
							type: "checkbox",
							checked: config.options.Threads === 7,
							click: () => {
								set_checks("Engine", "Threads", "7");
								win.webContents.send("call", {
									fn: "set_threads",
									args: [7],
								});
							}
						},
						{
							label: "6",
							type: "checkbox",
							checked: config.options.Threads === 6,
							click: () => {
								set_checks("Engine", "Threads", "6");
								win.webContents.send("call", {
									fn: "set_threads",
									args: [6],
								});
							}
						},
						{
							label: "5",
							type: "checkbox",
							checked: config.options.Threads === 5,
							click: () => {
								set_checks("Engine", "Threads", "5");
								win.webContents.send("call", {
									fn: "set_threads",
									args: [5],
								});
							}
						},
						{
							label: "4",
							type: "checkbox",
							checked: config.options.Threads === 4,
							click: () => {
								set_checks("Engine", "Threads", "4");
								win.webContents.send("call", {
									fn: "set_threads",
									args: [4],
								});
							}
						},
						{
							label: "3",
							type: "checkbox",
							checked: config.options.Threads === 3,
							click: () => {
								set_checks("Engine", "Threads", "3");
								win.webContents.send("call", {
									fn: "set_threads",
									args: [3],
								});
							}
						},
						{
							label: "2",
							type: "checkbox",
							checked: config.options.Threads === 2,
							click: () => {
								set_checks("Engine", "Threads", "2");
								win.webContents.send("call", {
									fn: "set_threads",
									args: [2],
								});
							}
						},
						{
							label: "1",
							type: "checkbox",
							checked: config.options.Threads === 1,
							click: () => {
								set_checks("Engine", "Threads", "1");
								win.webContents.send("call", {
									fn: "set_threads",
									args: [1],
								});
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
					label: "Custom UCI options",
					submenu: cclist_in_menu			// Will be filled at the end, see below.
				},
				{
					type: "separator"
				},
				{
					label: "Only play White",
					accelerator: "F9",
					click: () => {
						win.webContents.send("call", {
							fn: "set_versus",
							args: ["w"],
						});
					}
				},
				{
					label: "Only play Black",
					accelerator: "F10",
					click: () => {
						win.webContents.send("call", {
							fn: "set_versus",
							args: ["b"],
						});
					}
				},
				{
					label: "...and play move at node limit",
					type: "checkbox",
					checked: config.autoplay,
					click: () => {
						win.webContents.send("call", {
							fn: "toggle",
							args: ["autoplay"],
						});
					}
				},
				{
					label: "About single colour modes",
					click: () => {
						alert(messages.about_versus_mode);
					}
				},
			]
		},
		{
			label: "Sizes",
			submenu: [
				{
					label: "Infobox font",
					submenu: [
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
					]
				},
				{
					label: "Move history font",
					submenu: [
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
					]
				},
				{
					type: "separator"
				},
				{
					label: "Board",
					submenu: [
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
					]
				},
				{
					label: "Arrows",
					submenu: [
						{
							label: "Small",
							click: () => {
								win.webContents.send("call", "small_arrows");
							}
						},
						{
							label: "Medium",
							click: () => {
								win.webContents.send("call", "medium_arrows");
							}
						},
						{
							label: "Large",
							click: () => {
								win.webContents.send("call", "large_arrows");
							}
						},
						{
							label: "Giant",
							click: () => {
								win.webContents.send("call", "giant_arrows");
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
					accelerator: "CommandOrControl+.",
					click: () => {
						win.webContents.send("call", "random_move");
					}
				},
				{
					type: "separator"
				},
				{
					label: "Draw rate",
					submenu: [
						{
							label: "Frenetic",
							type: "checkbox",
							checked: config.update_delay === 25,
							click: () => {
								set_checks("Dev", "Draw rate", "Frenetic");
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
								set_checks("Dev", "Draw rate", "Fast");
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
								set_checks("Dev", "Draw rate", "Normal");
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
								set_checks("Dev", "Draw rate", "Relaxed");
								win.webContents.send("set", {
									key: "update_delay",
									value: 170,
								});
							}
						},
					]
				},
				{
					label: "Fire GC",
					click: () => {
						win.webContents.send("call", "fire_gc");
					}
				},
				{
					label: "Show sync status",
					click: () => {
						win.webContents.send("call", "show_sync_status");
					}
				},
				{
					type: "separator"
				},
				{
					label: "Crash test",
					submenu: [
						{
							label: "Crash",
							click: () => {
								win.webContents.executeJavaScript("hub.engine.send('stop')");
								setTimeout(() => {
									win.webContents.executeJavaScript("process.crash()");
								}, 500);
							}
						},
						{
							label: "Hang",
							click: () => {
								win.webContents.executeJavaScript("hub.engine.send('stop')");
								setTimeout(() => {
									win.webContents.executeJavaScript("process.hang()");
								}, 500);
							}
						},
						{
							label: "Perft",
							click: () => {
								win.webContents.executeJavaScript("hub.engine.send('stop')");
								setTimeout(() => {
									win.webContents.executeJavaScript("Perft('1nr1nk1r/1b5B/p1p1qp2/b2pp1pP/3P2P1/P3P2N/1Pp2P2/BNR2KQR w CHch g6 0 1', 5)");
								}, 500);
							}
						},
					]
				},
			]
		}
	];

	// Some special shennanigans to build the custom options menu...

	let cclist = custom_uci.load();

	for (let command of cclist) {
		cclist_in_menu.push({
			label: command.name + " " + command.val,
			click: () => {
				win.webContents.send("call", {
					fn: "send_custom",
					args: [command.name, command.val]
				});
			}
		});
	}

	if (cclist_in_menu.length > 0) {
		cclist_in_menu.push({type: "separator"});
	}
	cclist_in_menu.push({
		label: "How to add UCI options",
		click: () => {
			alert(messages.adding_uci_options);
		}
	});
	cclist_in_menu.push({
		label: `Show ${custom_uci.filename}`,
		click: () => {
			electron.shell.showItemInFolder(custom_uci.filepath);
		}
	});

	// Actually build the menu...

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

function set_checks(...menupath) {

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

