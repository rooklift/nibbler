"use strict";

Log("");
Log("======================================================================================================================================");
Log(`Nibbler startup at ${new Date().toUTCString()}`);
Log("");

infobox.style.height = config.board_size.toString() + "px";
movelist.style.height = config.movelist_height.toString() + "px";		// Is there a way to avoid needing this, to get the scroll bar?

// We have 3 things that get drawn to:
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
		td1.id = "underlay_" + Point(x, y).s;
		td2.id = "overlay_" + Point(x, y).s;
		td1.width = td2.width = config.board_size / 8;
		td1.height = td2.height = config.board_size / 8;
		if ((x + y) % 2 === 0) {
			td1.style["background-color"] = config.light_square;
		} else {
			td1.style["background-color"] = config.dark_square;
		}
		tr1.appendChild(td1);
		tr2.appendChild(td2);
	}
}

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

let hub = NewRenderer();

if (config && config.warn_filename) {
	hub.err_receive(`<span class="blue">Nibbler says: You should rename config.example.json to config.json</span>`);
	hub.err_receive("");
}

ipcRenderer.on("set", (event, msg) => {		// Should only be for things that don't need immediate action.
	config[msg.key] = msg.value;
	hub.draw();
});

// --------------------------------------------------------------------------------------------
// In bad cases of super-large, trees, the UI can become unresponsive. To mitigate this, we
// put user input in a queue, and drop things if they build up.

let input_queue = [];

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
	let length = input_queue.length;
	if (length === 1) {
		input_queue[0]();
	} else if (length > 1) {
		input_queue[length - 1]();
		console.log(`input_loop() dropped ${length - 1} command${length === 2 ? "" : "s"}.`);
	}
	input_queue = [];
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

	// Only if the PGN chooser is closed, and the move_list has no scroll bar or isn't the target.

	if (pgnchooser.style.display !== "none") {
		return;
	}

	if (movelist.scrollHeight <= movelist.clientHeight) {
		if (event.deltaY && event.deltaY < 0) prev_next_queue.push(hub.prev.bind(hub));
		if (event.deltaY && event.deltaY > 0) prev_next_queue.push(hub.next.bind(hub));
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
		if (event.deltaY && event.deltaY < 0) prev_next_queue.push(hub.prev.bind(hub));
		if (event.deltaY && event.deltaY > 0) prev_next_queue.push(hub.next.bind(hub));
	}
});

// Setup return key on FEN box...

fenbox.onkeydown = (event) => {
	if (event.key === "Enter") {
		hub.load_fen(fenbox.value);
	}
};

// Setup drag-and-drop...

window.ondragover = () => false;		// Allows drops to happen, I think.

window.ondrop = (event) => {
	hub.handle_drop(event);
};

// Go...

function enter_loop() {
	if (loads === 12) {
		hub.draw_loop();
		ipcRenderer.send("renderer_ready", null);
	} else {
		setTimeout(enter_loop, 25);
	}
}

enter_loop();
