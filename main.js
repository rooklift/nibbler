"use strict";

const alert = require("./modules/alert");
const electron = require("electron");
const config_io = require("./modules/config_io");
const get_main_folder = require("./modules/get_main_folder");
const messages = require("./modules/messages");
const path = require("path");
const running_as_electron = require("./modules/running_as_electron");
const url = require("url");

// We want sync save and open dialogs. In Electron 5 we could get these by calling
// showSaveDialog or showOpenDialog without a callback, but in Electron 6 this no
// longer works and we must call new functions. So find out if they exist...

const save_dialog = electron.dialog.showSaveDialogSync || electron.dialog.showSaveDialog;
const open_dialog = electron.dialog.showOpenDialogSync || electron.dialog.showOpenDialog;

// We do manual GC firing sometimes...

electron.app.commandLine.appendSwitch("js-flags", "--expose_gc");

// Note that as the user adjusts menu items, our copy of the config will become
// out of date. The renderer is responsible for having an up-to-date copy.

let config = config_io.load();		// Do this first, it's a needed global.

let win;
let menu = menu_build();
let loaded_weights = config.options.WeightsFile || null;
let loaded_engine = config.path;

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
			zoomFactor: 1 / electron.screen.getPrimaryDisplay().scaleFactor
		}
	});

	win.once("ready-to-show", () => {		// Event will come even if there's an exception in renderer.
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
	const template = [
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
					type: "separator"
				},
				{
					label: "Open PGN...",
					accelerator: "CommandOrControl+O",
					click: () => {
						let files = open_dialog({
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
						let files = open_dialog({
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
					label: "Save this game...",
					accelerator: "CommandOrControl+S",
					click: () => {
						if (config.save_enabled !== true) {		// Note: exact test for true, not just any truthy value
							alert(messages.save_not_enabled);
							return;
						}
						let file = save_dialog();
						if (file && file.length > 0) {
							win.webContents.send("call", {
								fn: "save",
								args: [file]
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
					label: "Show config.json",
					click: () => {
						let filename = config_io.get_filename();
						electron.shell.showItemInFolder(filename);
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
					label: "Play choice",
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
					label: "Flip board",
					accelerator: "CommandOrControl+F",
					click: () => {
						win.webContents.send("call", {
							fn: "toggle",
							args: ["flip"],
						});
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
							label: "About this option",
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
							label: "Show N (%)",
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
							label: "Show N (absolute)",
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
							label: "Show V",
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
							label: "Show Q",
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
							label: "Show D",
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
						{
							label: "Show Q+U",
							type: "checkbox",
							checked: config.show_q_plus_u,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["show_q_plus_u"],
								});
							}
						},
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
							label: "Show EV",
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
							label: "Show N (%)",
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
							label: "Show N (absolute)",
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
							label: "Show Total Nodes",
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
							label: "Show P",
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
							label: "Show V",
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
							label: "Show Q",
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
							label: "Show D",
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
							label: "Show U",
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
							label: "Show Q+U",
							type: "checkbox",
							checked: config.sam_q_plus_u,
							click: () => {
								win.webContents.send("call", {
									fn: "toggle",
									args: ["sam_q_plus_u"],
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
							properties: ["openFile"]
						});
						if (files && files.length > 0) {
							win.webContents.send("call", {
								fn: "switch_engine",
								args: [files[0]]
							});
							loaded_engine = files[0];
						}
					}
				},
				{
					label: "Choose weights file...",
					click: () => {
						let files = open_dialog({
							properties: ["openFile"]
						});
						if (files && files.length > 0) {
							win.webContents.send("call", {
								fn: "switch_weights",
								args: [files[0]]
							});
							loaded_weights = files[0];
						}
					}
				},
				{
					label: "Backend",
					submenu: [
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
							checked: config.search_nodes === "infinite",
							click: () => {
								set_checks("Engine", "Node limit", "Infinite");
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: ["infinite"]
								});
							}
						},
						{
							label: "100,000,000",
							type: "checkbox",
							checked: config.search_nodes === 100000000,
							click: () => {
								set_checks("Engine", "Node limit", "100,000,000");
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [100000000]
								});
							}
						},
						{
							label: "10,000,000",
							type: "checkbox",
							checked: config.search_nodes === 10000000,
							click: () => {
								set_checks("Engine", "Node limit", "10,000,000");
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [10000000]
								});
							}
						},
						{
							label: "1,000,000",
							type: "checkbox",
							checked: config.search_nodes === 1000000,
							click: () => {
								set_checks("Engine", "Node limit", "1,000,000");
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [1000000]
								});
							}
						},
						{
							label: "100,000",
							type: "checkbox",
							checked: config.search_nodes === 100000,
							click: () => {
								set_checks("Engine", "Node limit", "100,000");
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [100000]
								});
							}
						},
						{
							label: "10,000",
							type: "checkbox",
							checked: config.search_nodes === 10000,
							click: () => {
								set_checks("Engine", "Node limit", "10,000");
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [10000]
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
							label: "100",
							type: "checkbox",
							checked: config.search_nodes === 100,
							click: () => {
								set_checks("Engine", "Node limit", "100");
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [100]
								});
							}
						},
						{
							label: "10",
							type: "checkbox",
							checked: config.search_nodes === 10,
							click: () => {
								set_checks("Engine", "Node limit", "10");
								win.webContents.send("call", {
									fn: "set_node_limit",
									args: [10]
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
					label: "CPuct",
					submenu: [
					{
							label: "4.0",
							type: "checkbox",
							checked: config.options.CPuct === 4.0,
							click: () => {
								set_checks("Engine", "CPuct", "4.0");
								win.webContents.send("call", {
									fn: "set_cpuct",
									args: [4.0],
								});
							}
						},
						{
							label: "3.8",
							type: "checkbox",
							checked: config.options.CPuct === 3.8,
							click: () => {
								set_checks("Engine", "CPuct", "3.8");
								win.webContents.send("call", {
									fn: "set_cpuct",
									args: [3.8],
								});
							}
						},
						{
							label: "3.6",
							type: "checkbox",
							checked: config.options.CPuct === 3.6,
							click: () => {
								set_checks("Engine", "CPuct", "3.6");
								win.webContents.send("call", {
									fn: "set_cpuct",
									args: [3.6],
								});
							}
						},
						{
							label: "3.4",
							type: "checkbox",
							checked: config.options.CPuct === 3.4,
							click: () => {
								set_checks("Engine", "CPuct", "3.4");
								win.webContents.send("call", {
									fn: "set_cpuct",
									args: [3.4],
								});
							}
						},
						{
							label: "3.2",
							type: "checkbox",
							checked: config.options.CPuct === 3.2,
							click: () => {
								set_checks("Engine", "CPuct", "3.2");
								win.webContents.send("call", {
									fn: "set_cpuct",
									args: [3.2],
								});
							}
						},
						{
							label: "3.0",
							type: "checkbox",
							checked: config.options.CPuct === 3.0,
							click: () => {
								set_checks("Engine", "CPuct", "3.0");
								win.webContents.send("call", {
									fn: "set_cpuct",
									args: [3.0],
								});
							}
						},
						{
							label: "2.8",
							type: "checkbox",
							checked: config.options.CPuct === 2.8,
							click: () => {
								set_checks("Engine", "CPuct", "2.8");
								win.webContents.send("call", {
									fn: "set_cpuct",
									args: [2.8],
								});
							}
						},
						{
							label: "2.6",
							type: "checkbox",
							checked: config.options.CPuct === 2.6,
							click: () => {
								set_checks("Engine", "CPuct", "2.6");
								win.webContents.send("call", {
									fn: "set_cpuct",
									args: [2.6],
								});
							}
						},
						{
							label: "2.4",
							type: "checkbox",
							checked: config.options.CPuct === 2.4,
							click: () => {
								set_checks("Engine", "CPuct", "2.4");
								win.webContents.send("call", {
									fn: "set_cpuct",
									args: [2.4],
								});
							}
						},
					]
				},
				{
					type: "separator"
				},
				{
					label: "Only play White",
					click: () => {
						win.webContents.send("call", {
							fn: "set_versus",
							args: ["w"],
						});
					}
				},
				{
					label: "Only play Black",
					click: () => {
						win.webContents.send("call", {
							fn: "set_versus",
							args: ["b"],
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
					label: "Infobox",
					submenu: [
						{
							label: "16",
							type: "checkbox",
							checked: config.info_font_size === 16,
							click: () => {
								set_checks("Sizes", "Infobox", "16");
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
								set_checks("Sizes", "Infobox", "20");
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
								set_checks("Sizes", "Infobox", "24");
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
								set_checks("Sizes", "Infobox", "28");
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
								set_checks("Sizes", "Infobox", "32");
								win.webContents.send("call", {
									fn: "set_info_font_size",
									args: [32],
								});
							}
						},
					]
				},
				{
					label: "Move list",
					submenu: [
						{
							label: "16",
							type: "checkbox",
							checked: config.pgn_font_size === 16,
							click: () => {
								set_checks("Sizes", "Move list", "16");
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
								set_checks("Sizes", "Move list", "20");
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
								set_checks("Sizes", "Move list", "24");
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
								set_checks("Sizes", "Move list", "28");
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
								set_checks("Sizes", "Move list", "32");
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
					label: "Other size options",
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
					label: "Fire GC",
					click: () => {
						win.webContents.send("call", "fire_gc");
					}
				},
				{
					label: "Crash Test",
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
						}
					]
				},
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
