"use strict";

Log("");
Log("======================================================================================================================================");
Log(`Nibbler startup at ${new Date().toUTCString()}`);
Log("");

infobox.style.height = config.board_size.toString() + "px";
movelist.style.height = config.movelist_height.toString() + "px";		// Is there a way to avoid needing this, to get the scroll bar?

// Create the board and its squares, and make the canvas sit on top of it...

boardtable.width = config.board_size;
boardtable.height = config.board_size;

for (let y = 0; y < 8; y++) {
	let tr = document.createElement("tr");
	boardtable.appendChild(tr);
	for (let x = 0; x < 8; x++) {
		let td = document.createElement("td");
		td.id = "square_" + Point(x, y).s;
		td.width = config.board_size / 8;
		td.height = config.board_size / 8;
		if ((x + y) % 2 === 0) {
			td.style["background-color"] = config.light_square;
		} else {
			td.style["background-color"] = config.dark_square;
		}
		tr.appendChild(td);
	}
}

canvas.width = config.board_size;
canvas.height = config.board_size;
canvas.style.left = boardtable.offsetLeft.toString() + "px";
canvas.style.top = boardtable.offsetTop.toString() + "px";

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

ipcRenderer.on("call", (event, msg) => {
	if (typeof msg === "string") {
		hub[msg]();
	} else if (typeof msg === "object" && msg.fn && msg.args) {
		hub[msg.fn](...msg.args);
	} else {
		console.log("Bad call, msg was...");
		console.log(msg);
	}
});

ipcRenderer.on("toggle", (event, cfgvar) => {
	config[cfgvar] = !config[cfgvar];
	hub.draw();
});

ipcRenderer.on("set", (event, msg) => {
	config[msg.key] = msg.value;
	hub.draw();
});

// --------------------------------------------------------------------------------------------
// prev() and next() calls are the things most likely to lag the app if we've a pathologically
// branchy PGN. To mitigate this, when one comes in, don't execute it immediately, but place it
// on a queue, which is regularly examined. If there's multiple stuff on the queue, drop stuff.

let prev_next_queue = [];

ipcRenderer.on("prev", (event) => {
	prev_next_queue.push(hub.prev.bind(hub));
});

ipcRenderer.on("next", (event) => {
	prev_next_queue.push(hub.next.bind(hub));
});

function prev_next_loop() {
	if (prev_next_queue.length > 0) {
		let fn = prev_next_queue[prev_next_queue.length - 1];
		fn();
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
	hub.pgnchooser_click(event);
});

boardtable.addEventListener("mousedown", (event) => {
	hub.boardtable_click(event);
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
}

// Go...

function enter_loop() {
	if (loads === 12) {
		hub.draw_board();
		hub.draw_info_loop();
		ipcRenderer.send("renderer_ready", null);
	} else {
		setTimeout(enter_loop, 25);
	}
}

enter_loop();
