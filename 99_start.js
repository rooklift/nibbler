"use strict";

function send(msg) {
	try {
		msg = msg.trim();
		exe.stdin.write(msg);
		exe.stdin.write("\n");
		Log("--> " + msg);
	} catch (err) {
		Log("(failed) --> " + msg);
		if (exe.connected === false && !send.warned) {
			send.warned = true;
			alert("The engine appears to have crashed.");
		}
	}
}

function setoption(name, value) {
	send(`setoption name ${name} value ${value}`);
}

// The sync function exists so that we can disregard all output until a certain point.
// Basically we use it after sending a position, so that we can ignore all analysis
// that comes until LZ sends "readyok" in response to our "isready". All output before
// that moment would refer to the obsolete position.
//
// While this seems to work correctly with Lc0, tests with Stockfish show that it
// definitely violates our assumptions and sends things out of order, hence the need
// for validity checking on incoming messages anyway.

function sync() {
	send("isready");
	readyok_required++;
}

// ------------------------------------------------------------------------------------------------

try {
	let config_filename = path.join(get_main_folder(), "config.json");
	let config_example_filename = path.join(get_main_folder(), "config.example.json");

	if (fs.existsSync(config_filename)) {
		config = JSON.parse(debork_json(fs.readFileSync(config_filename, "utf8")));
	} else if (fs.existsSync(config_example_filename)) {
		config = JSON.parse(debork_json(fs.readFileSync(config_example_filename, "utf8")));
		config.warn_filename = true;
	} else {
		alert(`Couldn't find config file. Looked at:\n${config_filename}`);
	}
} catch (err) {
	alert("Failed to parse config file - make sure it is valid JSON, and in particular, if on Windows, use \\\\ instead of \\ as a path separator.");
}

// Some tolerable default values for config...

assign_without_overwrite(config, {
	"options": {},

	"width": 1280,
	"height": 835,
	"board_size": 640,
	"movelist_height": 110,

	"board_font": "18px Arial",

	"light_square": "#dadada",
	"dark_square": "#b4b4b4",
	"active_square": "#cc9966",

	"best_colour": "#66aaaa",
	"good_colour": "#66aa66",
	"bad_colour": "#cccc66",
	"terrible_colour": "#cc6666",

	"bad_move_threshold": 0.02,
	"terrible_move_threshold": 0.04,

	"node_display_threshold": 0.02,

	"max_info_lines": 10,
	"update_delay": 170,
	
	"logfile": null,
	"log_info_lines": false
});

config.board_size = Math.floor(config.board_size / 8) * 8;

infobox.style.height = config.board_size.toString() + "px";
movelist.style.height = config.movelist_height.toString() + "px";				// Is there a way to avoid needing this, to get the scroll bar?
canvas.width = config.board_size;
canvas.height = config.board_size;

Log("");
Log("======================================================================================================================================");
Log(`Nibbler startup at ${new Date().toUTCString()}`);
Log("");

if (config.path) {
	exe = child_process.spawn(config.path);
	exe.on("error", (err) => {
		alert("Couldn't spawn process - check the path in the config file");	// Note that this alert will come some time in the future, not instantly.
	});

	scanner = readline.createInterface({
		input: exe.stdout,
		output: undefined,
		terminal: false
	});

	err_scanner = readline.createInterface({
		input: exe.stderr,
		output: undefined,
		terminal: false
	});

	err_scanner.on("line", (line) => {
		Log("! " + line);
		renderer.err_receive(line);
	});

	scanner.on("line", (line) => {

		// We want to ignore all output when waiting for readyok

		if (line.includes("readyok") && readyok_required > 0) {
			readyok_required--;
		}

		if (readyok_required > 0) {
			if (config.log_info_lines || line.includes("info") === false) {
				Log("(ignored) < " + line);
			}
			return;
		}

		if (config.log_info_lines || line.includes("info") === false) {
			Log("< " + line);
		}
		renderer.receive(line);
	});
}

send("uci");

for (let key of Object.keys(config.options)) {
	setoption(key, config.options[key]);
}

setoption("VerboseMoveStats", true);			// Required for LogLiveStats to work.
setoption("LogLiveStats", true);				// "Secret" Lc0 command.
setoption("MultiPV", config.max_info_lines);
send("ucinewgame");

// ------------------------------------------------------------------------------------------------

let images = Object.create(null);
let loads = 0;

for (let c of Array.from("KkQqRrBbNnPp")) {
	images[c] = new Image();
	if (c === c.toUpperCase()) {
		images[c].src = `./pieces/${c}.png`;
	} else {
		images[c].src = `./pieces/_${c.toUpperCase()}.png`;
	}
	images[c].onload = () => {
		loads++;
	};
}

// ------------------------------------------------------------------------------------------------

let renderer = make_renderer();

if (config && config.warn_filename) {
	renderer.err_receive(`<span class="blue">Nibbler says: You should rename config.example.json to config.json</span>`);
	renderer.err_receive("");
}

ipcRenderer.on("call", (event, msg) => {
	if (typeof msg === "string") {
		renderer[msg]();
	} else if (typeof msg === "object" && msg.fn && msg.args) {
		renderer[msg.fn](...msg.args);
	} else {
		console.log("Bad call, msg was...");
		console.log(msg);
	}
});

ipcRenderer.on("toggle", (event, cfgvar) => {
	config[cfgvar] = !config[cfgvar];
	renderer.draw();
});

ipcRenderer.on("set", (event, msg) => {
	config[msg.key] = msg.value;
	renderer.draw();
});

// --------------------------------------------------------------------------------------------
// prev() and next() calls are the things most likely to lag the app if we've a pathologically
// branchy PGN. To mitigate this, when one comes in, don't execute it immediately, but place it
// on a queue, which is regularly examined. If there's multiple stuff on the queue, drop stuff.

let prev_next_queue = [];

ipcRenderer.on("prev", (event) => {
	prev_next_queue.push(renderer.prev);
});

ipcRenderer.on("next", (event) => {
	prev_next_queue.push(renderer.next);
});

function prev_next_loop() {
	if (prev_next_queue.length > 0) {
		let fn_to_call = prev_next_queue[prev_next_queue.length - 1];
		fn_to_call();
		prev_next_queue = [];
	}
	setTimeout(prev_next_loop, 10);
}

prev_next_loop();

// --------------------------------------------------------------------------------------------
// We had some problems with the various clickers: we used to destroy and create
// clickable objects a lot. This seemed to lead to moments where clicks wouldn't
// register.
//
// A better approach is to use event handlers on the outer elements, and examine
// the event.path to see what was actually clicked on.

pgnchooser.addEventListener("mousedown", (event) => {
	renderer.pgnchooser_click(event);
});

canvas.addEventListener("mousedown", (event) => {
	renderer.canvas_click(event);
});

infobox.addEventListener("mousedown", (event) => {
	renderer.infobox_click(event);
});

movelist.addEventListener("mousedown", (event) => {
	renderer.movelist_click(event);
});

// Constantly track the mouse...

canvas.addEventListener("mousemove", (event) => {
	// This can fire a LOT. So don't call any more functions.
	renderer.mousex = event.offsetX;
	renderer.mousey = event.offsetY;
});

canvas.addEventListener("mouseout", (event) => {
	renderer.mousex = null;
	renderer.mousey = null;
});

document.addEventListener("wheel", (event) => {

	// Only if the PGN chooser is closed, and the move_list has no scroll bar or isn't the target.

	if (pgnchooser.style.display !== "none") {
		return;
	}

	if (movelist.scrollHeight <= movelist.clientHeight) {
		if (event.deltaY && event.deltaY < 0) prev_next_queue.push(renderer.prev);
		if (event.deltaY && event.deltaY > 0) prev_next_queue.push(renderer.next);
		return;
	}

	let allow = true;

	if (event.path) {
		for (let item of event.path) {
			if (item.id === "movelist") {
				allow = false;
				break;
			}
		}
	}

	if (allow) {
		if (event.deltaY && event.deltaY < 0) prev_next_queue.push(renderer.prev);
		if (event.deltaY && event.deltaY > 0) prev_next_queue.push(renderer.next);
	}
});

// Setup return key on FEN box...
fenbox.onkeydown = (event) => {
	if (event.key === "Enter") {
		renderer.load_fen(fenbox.value);
	}
};

// Setup drag-and-drop for PGN files into the window itself...

window.ondragover = () => false;
window.ondragleave = () => false;
window.ondragend = () => false;
window.ondrop = (event) => {
	event.preventDefault();
	renderer.open(event.dataTransfer.files[0].path);
	return false;
};

function enter_loop() {
	if (loads === 12) {
		renderer.draw_loop();
		ipcRenderer.send("renderer_ready", null);
	} else {
		setTimeout(enter_loop, 25);
	}
}

enter_loop();
