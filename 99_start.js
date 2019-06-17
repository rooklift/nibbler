"use strict";

Log("");
Log("======================================================================================================================================");
Log(`Nibbler startup at ${new Date().toUTCString()}`);
Log("");

infobox.style.height = config.board_size.toString() + "px";
movelist.style.height = config.movelist_height.toString() + "px";		// Is there a way to avoid needing this, to get the scroll bar?
canvas.width = config.board_size;
canvas.height = config.board_size;

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

let renderer = NewRenderer();

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
		let fn = prev_next_queue[prev_next_queue.length - 1];
		fn.call(renderer);			// In case it uses "this", specify that "this" means renderer.
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
