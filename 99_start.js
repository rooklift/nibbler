"use strict";

Log("");
Log("======================================================================================================================================");
Log(`Nibbler startup at ${new Date().toUTCString()}`);
Log("");

let hub = NewRenderer();

// We have 3 main things that get drawn to:
//
//		- boardsquares, a table with the actual squares of the board.
//		- canvas, which gets enemy pieces and arrows drawn on it.
//		- boardfriends, a table with friendly pieces.
//
// boardsquares has its natural position, while the other two get
// fixed position that is set to be on top of it.

boardsquares.width = boardfriends.width = canvas.width = config.board_size;
boardsquares.height = boardfriends.height = canvas.height = config.board_size;

boardfriends.style.left = canvas.style.left = boardsquares.offsetLeft.toString() + "px";
boardfriends.style.top = canvas.style.top = boardsquares.offsetTop.toString() + "px";

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

// Resize various things...

let infobox_top = infobox.getBoundingClientRect().top;
let canvas_bottom = canvas.getBoundingClientRect().bottom;

infobox.style.height = (canvas_bottom - infobox_top).toString() + "px";

function set_movelist_height() {
	let desired_height = window.innerHeight - movelist.getBoundingClientRect().top - 16;
	if (desired_height < 60) {
		desired_height = 60;
	}
	movelist.style.height = `${desired_height}px`;
}

set_movelist_height();

window.addEventListener("resize", set_movelist_height);		// There must be a CSS solution. FIXME.

// The promotion table pops up when needed...

promotiontable.style.left = (boardsquares.offsetLeft + config.square_size * 2).toString() + "px";
promotiontable.style.top = (boardsquares.offsetTop + config.square_size * 3.5).toString() + "px";
promotiontable.style["background-color"] = config.active_square;

// ------------------------------------------------------------------------------------------------

if (config.warn_filename) {
	hub.err_receive(`<span class="blue">Nibbler says: You should rename config.example.json to config.json</span>`);
	hub.err_receive("");
}

if (config.failure) {
	alert(config.failure);
}

ipcRenderer.on("set", (event, msg) => {		// Should only be for things that don't need immediate action.
	config[msg.key] = msg.value;
	hub.draw();
});

// --------------------------------------------------------------------------------------------
// In bad cases of super-large, trees, the UI can become unresponsive. To mitigate this, we
// put user input in a queue, and drop things if they build up.

let input_queue = [];
let total_dropped_inputs = 0;

ipcRenderer.on("call", (event, msg) => {

	let fn;

	if (typeof msg === "string") {									// msg is function name
		fn = hub[msg].bind(hub);
	} else if (typeof msg === "object" && msg.fn && msg.args) {		// msg is object with fn and args
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
		fn();		// We could wrap this in a try, but for dev purposes it's best to break hard.
	}

	setTimeout(input_loop, 10);
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

// Constantly track the mouse...

document.addEventListener("mousemove", (event) => {
	// This can fire a LOT. So don't call any more functions.
	hub.mousex = event.x;
	hub.mousey = event.y;
});

document.addEventListener("mouseout", (event) => {
	hub.mousex = null;
	hub.mousey = null;
});

document.addEventListener("wheel", (event) => {

	// Only if the PGN chooser is closed, and the mouse is over the board.

	if (pgnchooser.style.display !== "none") {
		return;
	}

	let allow = false;

	if (event.path) {
		for (let item of event.path) {
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
	hub.handle_drop(event);
});

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
