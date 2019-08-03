"use strict";

Log("");
Log("======================================================================================================================================");
Log(`Nibbler startup at ${new Date().toUTCString()}`);
Log("");

let hub = NewRenderer();
hub.engine_start();			// Note that this oblirates any error log, so this must come before the following...

if (fs.existsSync(path.join(get_main_folder(), "config.json"))) {
	hub.err_receive(`<span class="blue">${messages.new_config_location}</span>`);
	hub.err_receive("");
}

if (config.failure) {
	hub.err_receive(`<span class="blue">While loading config.json: ${config.failure}</span>`);
	hub.err_receive("");
}

fenbox.value = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// We have 3 main things that get drawn to:
//
//		- boardsquares, a table with the actual squares of the board.
//		- canvas, which gets enemy pieces and arrows drawn on it.
//		- boardfriends, a table with friendly pieces.
//
// boardsquares has its natural position, while the other two get
// fixed position that is set to be on top of it.

boardfriends.width = canvas.width = fantasy.width = boardsquares.width = config.board_size;
boardfriends.height = canvas.height = fantasy.height = boardsquares.height = config.board_size;

boardfriends.style.left = canvas.style.left = fantasy.style.left = boardsquares.offsetLeft.toString() + "px";
boardfriends.style.top = canvas.style.top = fantasy.style.top = boardsquares.offsetTop.toString() + "px";

// Set up the squares in both tables. Note that, upon flips, the elements
// themselves are moved to their new position, so everything works, e.g.
// the x and y values are still correct for the flipped view.

for (let y = 0; y < 8; y++) {
	let tr1 = document.createElement("tr");
	let tr2 = document.createElement("tr");
	boardsquares.appendChild(tr1);
	boardfriends.appendChild(tr2);
	for (let x = 0; x < 8; x++) {
		let td1 = document.createElement("td");
		let td2 = document.createElement("td");
		td1.id = "underlay_" + S(x, y);
		td2.id = "overlay_" + S(x, y);
		td1.width = td2.width = config.square_size;
		td1.height = td2.height = config.square_size;
		if ((x + y) % 2 === 0) {
			td1.style["background-color"] = config.light_square;
		} else {
			td1.style["background-color"] = config.dark_square;
		}
		tr1.appendChild(td1);
		tr2.appendChild(td2);
		td2.addEventListener("dragstart", (event) => {
			hub.set_active_square(Point(x, y));
			event.dataTransfer.setData("text", "overlay_" + S(x, y));
		});
	}
}

// Font sizes... do this before calculating sizes of stuff below.

infobox.style["font-size"] = config.info_font_size.toString() + "px";
movelist.style["font-size"] = config.pgn_font_size.toString() + "px";
fenbox.style["font-size"] = config.fen_font_size.toString() + "px";
statusbox.style["font-size"] = config.status_font_size.toString() + "px";

// We rely on the statusbox having some text when doing these calculations,
// so that the infobox_top has its final position.

let infobox_top = infobox.getBoundingClientRect().top;
let canvas_bottom = canvas.getBoundingClientRect().bottom;

infobox.style.height = (canvas_bottom - infobox_top).toString() + "px";

// The promotion table pops up when needed...

promotiontable.style.left = (boardsquares.offsetLeft + config.square_size * 2).toString() + "px";
promotiontable.style.top = (boardsquares.offsetTop + config.square_size * 3.5).toString() + "px";
promotiontable.style["background-color"] = config.active_square;

// --------------------------------------------------------------------------------------------
// In bad cases of super-large trees, the UI can become unresponsive. To mitigate this, we
// put user input in a queue, and drop things if they build up.

let input_queue = [];
let total_dropped_inputs = 0;

ipcRenderer.on("set", (event, msg) => {		// Should only be for things that don't need any other action.
	config[msg.key] = msg.value;
	config_io.save(config);
	hub.draw();
});

ipcRenderer.on("call", (event, msg) => {

	let fn;

	if (typeof msg === "string") {																		// msg is function name
		fn = hub[msg].bind(hub);
	} else if (typeof msg === "object" && typeof msg.fn === "string" && Array.isArray(msg.args)) {		// msg is object with fn and args
		fn = hub[msg.fn].bind(hub, ...msg.args);
	} else {
		console.log("Bad call, msg was...");
		console.log(msg);
	}

	if (fn) {
		input_queue.push(fn);
	}
});

// The queue needs to be examined very regularly and acted upon.

function input_loop() {

	debug.input_loop = debug.input_loop ? debug.input_loop + 1 : 1;

	let fn;

	let length = input_queue.length;

	if (length === 1) {
		fn = input_queue[0];
	} else if (length > 1) {
		total_dropped_inputs += length - 1;
		console.log(`input_loop() dropped ${length - 1} input${length === 2 ? "" : "s"}, total now ${total_dropped_inputs}.`);
		fn = input_queue[length - 1];
	}

	input_queue = [];

	if (fn) {
		fn();
	}

	setTimeout(input_loop, 10);
	debug.input_loop -= 1;
}

input_loop();

// --------------------------------------------------------------------------------------------
// We had some problems with the various clickers: we used to destroy and create
// clickable objects a lot. This seemed to lead to moments where clicks wouldn't
// register.
//
// A better approach is to use event handlers on the outer elements, and examine
// the event.path to see what was actually clicked on.

pgnchooser.addEventListener("mousedown", (event) => {
	hub.pgnchooser_click(event);
});

boardfriends.addEventListener("mousedown", (event) => {
	hub.boardfriends_click(event);
});

infobox.addEventListener("mousedown", (event) => {
	hub.infobox_click(event);
});

movelist.addEventListener("mousedown", (event) => {
	hub.movelist_click(event);
});

document.addEventListener("wheel", (event) => {

	// Only if the PGN chooser is closed, and the mouse is over the board.

	if (pgnchooser.style.display !== "none") {
		return;
	}

	let allow = false;

	let path = event.path || (event.composedPath && event.composedPath());

	if (path) {
		for (let item of path) {
			if (item.id === "boardfriends") {
				allow = true;
				break;
			}
		}
	}

	if (allow) {
		if (event.deltaY && event.deltaY < 0) input_queue.push(hub.prev.bind(hub));
		if (event.deltaY && event.deltaY > 0) input_queue.push(hub.next.bind(hub));
	}
});

// Setup return key on FEN box...

fenbox.addEventListener("keydown", (event) => {
	if (event.key === "Enter") {
		hub.load_fen(fenbox.value);
	}
});

// Setup drag-and-drop...

window.addEventListener("dragenter", (event) => {		// Necessary to prevent brief flashes of "not allowed" icon.
	event.preventDefault();
});

window.addEventListener("dragover", (event) => {		// Necessary to prevent always having the "not allowed" icon.
	event.preventDefault();
});

window.addEventListener("drop", (event) => {
	event.preventDefault();
	hub.handle_drop(event);
});

// Debug. Various functions increment a counter when starting, and decrement it before returning,
// so if we find a property that is non-zero, an exception has occurred.

function debug_loop() {
	for (let value of Object.values(debug)) {
		if (value) {
			alert(messages.uncaught_exception);
			return;		// Return before setTimeout, thus no more warnings.
		}
	}
	setTimeout(debug_loop, 5000);
}

debug_loop();

// Forced garbage collection. For reasons I can't begin to fathom, Node isn't
// garbage collecting everything, and the heaps seems to grow and grow. It's
// not what you would call a memory leak, since manually triggering the GC
// does clear everything... note --max-old-space-size is another option.

function force_gc() {
	if (!global || !global.gc) {
		console.log("Triggered GC not enabled.");
		return;
	}
	global.gc();
	setTimeout(force_gc, 300000);		// Once every 5 minutes or so?
}

setTimeout(force_gc, 300000);

// Go...

function enter_loop() {
	if (images.fully_loaded()) {
		hub.draw_loop();
		ipcRenderer.send("renderer_ready", null);
	} else {
		setTimeout(enter_loop, 25);
	}
}

enter_loop();
