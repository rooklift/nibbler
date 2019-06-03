"use strict";

let config = {};
let exe = null;
let scanner = null;
let err_scanner = null;
let readyok_required = false;

// ------------------------------------------------------------------------------------------------

function send(msg) {
	try {
		msg = msg.trim();
		exe.stdin.write(msg);
		exe.stdin.write("\n");
		Log("--> " + msg);
	} catch (err) {
		// pass
	}
}

// The sync function exists so that we can disregard all output until a certain point.
// Basically we use it after sending a position, so that we can ignore all analysis
// that comes until LZ sends "readyok" in response to our "isready". All output before
// that moment would refer to the obsolete position.

function sync() {
	send("isready");
	readyok_required = true;
}

// ------------------------------------------------------------------------------------------------

try {
	if (fs.existsSync("config.json")) {
		config = JSON.parse(fs.readFileSync("config.json", "utf8"));
	} else if (fs.existsSync("config.json.example")) {
		config = JSON.parse(fs.readFileSync("config.json.example", "utf8"));
		config.warn_filename = true;
	} else {
		alert("config.json not present");
	}
} catch (err) {
	alert("Failed to parse config file");
}

// Some tolerable default values for config...

assign_without_overwrite(config, {
	"options": {},

	"bad_cp_threshold": 20,
	"terrible_cp_threshold": 100,

	"max_info_lines": 10,
	"node_display_threshold": 0.05,

	"board_size": 640,
	"mainline_height": 108,

	"show_cp": true,
	"show_n": true,
	"show_p": false,
	"show_pv": true,

	"logfile": null
});

infobox.style.height = config.board_size.toString() + "px";
mainline.style.height = config.mainline_height.toString() + "px";		// Is there a way to avoid needing this, to get the scroll bar?
canvas.width = config.board_size;
canvas.height = config.board_size;

Log("");
Log("***********************************************************************************************");
Log(`Startup at ${new Date().toUTCString()}`);
Log("");

if (config.path) {
	exe = child_process.spawn(config.path);
	exe.on("error", (err) => {
			alert("Couldn't spawn process - check the path in the config file");			// Note that this alert will come some time in the future, not instantly.
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

		if (readyok_required) {
			if (line.includes("readyok") === false) {
				Log("(ignored) < " + line);
				return;
			}
			readyok_required = false;
		}

		Log("< " + line);
		renderer.receive(line);
	});
}

send("uci");

for (let key of Object.keys(config.options)) {
	send(`setoption name ${key} value ${config.options[key]}`);
}

send("setoption name VerboseMoveStats value true");		// Required for LogLiveStats to work.
send("setoption name LogLiveStats value true");			// "Secret" Lc0 command.
send("setoption name MultiPV value 500");
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

function make_renderer() {

	let renderer = Object.create(null);

	renderer.pos = LoadFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
	renderer.info_table = NewInfoTable();
	renderer.squares = [];							// Info about clickable squares.
	renderer.active_square = null;					// Square clicked by user.
	renderer.running = false;						// Whether to send "go" to the engine after move, undo, etc.
	renderer.ever_received_info = false;			// When false, we write stderr log instead of move info.
	renderer.stderr_log = "";						// All output received from the engine's stderr.
	renderer.infobox_string = "";					// Just to help not redraw the infobox when not needed.
	renderer.pgn_choices = null;

	renderer.pgn_line = null;

	fenbox.value = renderer.pos.fen();

	renderer.square_size = () => {
		return config.board_size / 8;
	};

	renderer.pos_changed = (new_game_flag) => {

		renderer.active_square = null;
		renderer.info_table.clear();

		fenbox.value = renderer.pos.fen();
		renderer.draw_main_line();

		if (renderer.running) {
			renderer.go(new_game_flag);
		} else if (new_game_flag) {
			send("ucinewgame");
		}

		renderer.draw();
	};

	renderer.game_changed = () => {
		renderer.pos_changed(true);
	};

	renderer.load_fen = (s) => {

		try {
			renderer.pos = LoadFEN(s);
		} catch (err) {
			alert(err);
			return;
		}

		renderer.pgn_line = null;
		renderer.game_changed();
	};

	renderer.new = () => {
		renderer.load_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
	};

	renderer.load_pgn_object = (o) => {

		renderer.pgn_choices = null;

		// If this fails, it will just dump an error in the console, which is OK by me.
		// So no try / catch here...

		let final_pos = LoadPGN(o.movetext);

		renderer.pgn_line = final_pos.position_list();
		renderer.pos = renderer.pgn_line[0];

		// Cheap hack to let us see if and where we are on the PGN line...

		for (let n = 0; n < renderer.pgn_line.length; n++) {
			renderer.pgn_line[n].pgn_index = n;
		}

		renderer.game_changed();		// Do this after the above since it uses the info.
	};

	renderer.choose_pgn = (n) => {
		pgnchooser.style.display = "none";
		if (renderer.pgn_choices && n >= 0 && n < renderer.pgn_choices.length) {
			renderer.load_pgn_object(renderer.pgn_choices[n]);
		}
	};

	renderer.open = (filename) => {

		renderer.halt();

		let buf = fs.readFileSync(filename);		// i.e. binary buffer object
		let pgn_list = pre_parse_pgn(buf);

		if (pgn_list.length === 1) {
			renderer.load_pgn_object(pgn_list[0]);
			return;
		}

		// There are multiple games in the file, so we write a list to our hidden
		// pgnchooser div, and unhide it so the user can click one.
		
		renderer.pgn_choices = pgn_list;

		let lines = [];

		lines.push("&nbsp;");

		for (let n = 0; n < pgn_list.length; n++) {
			let p = pgn_list[n];
			// The SafeString() calls are super-important.
			let s = `${SafeString(p.tags.White)}  <span class="tech">${SafeString(p.tags.Result)}</span>  ${SafeString(p.tags.Black)}`;
			lines.push(`<span onclick="renderer.choose_pgn(${n})">&nbsp;&nbsp;${s}</span>`);
		}

		lines.push("&nbsp;");

		pgnchooser.innerHTML = lines.join("<br>");
		pgnchooser.style.display = "block";
	};

	renderer.prev = () => {
		if (renderer.pos.parent) {
			renderer.pos = renderer.pos.parent;
			renderer.pos_changed();
		}
	};

	renderer.next = () => {

		// Currently, next only makes sense if we're on the PGN line.
		// Ideally we would also remember at least 1 other line.

		if (renderer.pgn_line === null) {
			return;
		}

		if (renderer.pos.pgn_index === undefined) {
			return;
		}

		let index = renderer.pos.pgn_index;
		let next_pos = renderer.pgn_line[index + 1];

		if (next_pos) {
			renderer.pos = next_pos;
			renderer.pos_changed();
		}
	};

	renderer.root = () => {
		let root = renderer.pos.position_list()[0];
		if (renderer.pos !== root) {
			renderer.pos = root;
			renderer.pos_changed();
		}
	};

	renderer.pgn_end = () => {

		if (renderer.pgn_line === null) {
			return;
		}

		let end = renderer.pgn_line[renderer.pgn_line.length - 1];
		if (renderer.pos !== end) {
			renderer.pos = end;
			renderer.pos_changed();
		}
	};

	renderer.move = (s) => {

		let advanced_pgn_flag = false;

		if (renderer.pos.pgn_index !== undefined) {
			if (renderer.pgn_line.length > renderer.pos.pgn_index + 1) {
				if (renderer.pgn_line[renderer.pos.pgn_index + 1].lastmove === s) {
					advanced_pgn_flag = true;
					renderer.pos = renderer.pgn_line[renderer.pos.pgn_index + 1];
				}
			}
		}

		if (advanced_pgn_flag === false) {
			renderer.pos = renderer.pos.move(s);
		}

		renderer.pos_changed();
	};

	renderer.play_best = () => {
		let info_list = renderer.info_table.sorted();
		if (info_list.length > 0) {
			renderer.move(info_list[0].move);
		}
	};

	renderer.go = (new_game_flag) => {

		renderer.running = true;

		let setup;

		let initial_fen = renderer.pos.initial_fen();
		if (initial_fen !== "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1") {
			setup = `fen ${initial_fen}`;
		} else {
			setup = "startpos";
		}

		send("stop");
		if (new_game_flag) {
			send("ucinewgame");
		}

		send(`position ${setup} moves ${renderer.pos.history().join(" ")}`);
		sync();																	// See comment on how sync() works
		send("go infinite");
	};

	renderer.halt = () => {
		send("stop");
		renderer.running = false;
	};

	renderer.receive = (s) => {

		if (s.startsWith("info depth") || s.startsWith("info string")) {
			renderer.ever_received_info = true;
			renderer.info_table.receive(s, renderer.pos);
		}

		if (s.startsWith("error")) {
			renderer.err_receive(s);
		}
	};

	renderer.err_receive = (s) => {
		if (s.indexOf("WARNING") !== -1) {
			renderer.stderr_log += `<span class="red">${s}</span><br>`;
		} else {
			renderer.stderr_log += `${s}<br>`
		};
	};

	renderer.click = (event) => {

		let point = null;

		for (let n = 0; n < renderer.squares.length; n++) {
			let foo = renderer.squares[n];
			if (foo.x1 < event.offsetX && foo.y1 < event.offsetY && foo.x2 > event.offsetX && foo.y2 > event.offsetY) {
				point = foo.point;
				break;
			}
		}

		if (point === null) {
			return;
		}

		if (renderer.active_square) {

			let move_string = renderer.active_square.s + point.s;		// e.g. "e2e4"

			let illegal_reason = renderer.pos.illegal(move_string);	

			renderer.active_square = null;

			if (illegal_reason === "") {			
				renderer.move(move_string);
				return;							// Skip the draw, below, since move() will do that.
			} else {
				console.log(illegal_reason);
			}

		} else {

			if (renderer.pos.active === "w" && renderer.pos.is_white(point)) {
				renderer.active_square = point;
			}
			if (renderer.pos.active === "b" && renderer.pos.is_black(point)) {
				renderer.active_square = point;
			}
		}

		renderer.draw();
	};

	renderer.draw_main_line = () => {

		let elements1 = [];
		let elements2 = [];

		let poslist = renderer.pos.position_list();
		let on_pgn = renderer.pgn_line !== null;
			
		for (let p of poslist.slice(1)) {		// Start on the first position that has a lastmove

			if (p.pgn_index === undefined && on_pgn) {

				// This is the first step off the main line.
				// Either we continued after the PGN ended, or we deviated beforehand.

				if (p.parent && p.parent.pgn_index === renderer.pgn_line.length - 1) {
					elements1.push(`<span class="red">(PGN ends)</span>`);
				} else {
					elements1.push(`<span class="red">(deviated)</span>`);
				}
				on_pgn = false;
			}

			if (p.parent.active === "w") {
				elements1.push(`${p.parent.fullmove}.`);
			}

			elements1.push(p.nice_lastmove());
		}

		if (on_pgn) {

			for (let p of renderer.pgn_line.slice(renderer.pos.pgn_index + 1)) {

				if (p.parent.active === "w") {
					elements2.push(`${p.parent.fullmove}.`);
				}

				elements2.push(p.nice_lastmove());
			}
		}

		let s1 = elements1.join(" ");		// Possibly empty string
		let s2 = elements2.join(" ");		// Possibly empty string

		if (s2.length > 0) {
			s2 = `<span class="gray">` + s2 + "</span>";
		}

		mainline.innerHTML = [s1, s2].filter(s => s !== "").join(" ");
	};

	renderer.draw_info = () => {

		if (renderer.ever_received_info === false) {
			if (infobox.innerHTML !== renderer.stderr_log) {	// Only update when needed, so user can select and copy.
				infobox.innerHTML = renderer.stderr_log;
			}
			return;
		}

		// First, draw the info box on the side...

		let s = "";

		if (renderer.running === false) {
			s += "&lt;halted&gt;<br><br>";
		}

		let info_list = renderer.info_table.sorted();

		for (let i = 0; i < info_list.length && i < config.max_info_lines; i++) {

			if (config.show_cp) {

				let cp_string = info_list[i].cp.toString();
				if (cp_string.startsWith("-") === false) {
					cp_string = "+" + cp_string;
				}

				s += `<span class="tech">${cp_string}</span> `;
			}

			s += info_list[i].pv_string(renderer.pos);			// The actual thing.

			if (config.show_n || config.show_p) {
				
				let tech_elements = [];

				if (config.show_n) {
					tech_elements.push(`N: ${info_list[i].n.toString()}`);
				}

				if (config.show_p) {
					tech_elements.push(`P: ${info_list[i].p}`);
				}

				s += ` <span class="tech">(${tech_elements.join(" ")})</span>`;
			}

			s += "<br><br>";
		}

		if (renderer.infobox_string !== s) {		// Only update when needed, so user can select and copy. A direct
													// comparison of s with innerHTML seems to fail (something must get changed).
			renderer.infobox_string = s;
			infobox.innerHTML = s;
		}

		// ------------------------------------------
		// Now draw the arrows on the board...

		if (info_list.length === 0) {
			return;
		}

		let best_nodes = info_list[0].n;

		context.lineWidth = 8;
		context.textAlign = "center";
		context.textBaseline = "middle"; 
		
		for (let i = info_list.length - 1; i >= 0; i--) {		// Reverse order for aesthetics.

			if (info_list[i].n >= best_nodes * config.node_display_threshold) {

				let loss = info_list[0].cp - info_list[i].cp;

				if (loss > config.terrible_cp_threshold) {
					continue;
				}

				if (i === 0) {
					context.strokeStyle = "#66aaaa";
					context.fillStyle = "#66aaaa";
				} else if (loss > config.bad_cp_threshold) {
					context.strokeStyle = "#cccc66";
					context.fillStyle = "#cccc66";
				} else {
					context.strokeStyle = "#66aa66";
					context.fillStyle = "#66aa66";
				}

				let [x1, y1] = XY(info_list[i].move.slice(0, 2));
				let [x2, y2] = XY(info_list[i].move.slice(2, 4));

				let rss = renderer.square_size();

				let cx1 = x1 * rss + rss / 2;
				let cy1 = y1 * rss + rss / 2;
				let cx2 = x2 * rss + rss / 2;
				let cy2 = y2 * rss + rss / 2;

        		context.beginPath();
        		context.moveTo(cx1, cy1);
        		context.lineTo(cx2, cy2);
				context.stroke();
				
				context.beginPath();
				context.arc(cx2, cy2, 12, 0, 2 * Math.PI);
				context.fill();
			}
		}

		let text_spots = Object.create(null)		// What target squares we have drawn text on.

		for (let i = 0; i < info_list.length; i++) {

			if (info_list[i].n >= best_nodes * config.node_display_threshold) {

				let loss = info_list[0].cp - info_list[i].cp;

				if (loss > config.terrible_cp_threshold) {
					continue;
				}

				let [x2, y2] = XY(info_list[i].move.slice(2, 4));
				let rss = renderer.square_size();
				let cx2 = x2 * rss + rss / 2;
				let cy2 = y2 * rss + rss / 2;

				if (text_spots[info_list[i].move.slice(2, 4)] === undefined) {
					context.font = "24px Arial";
					context.fillStyle = "black";
					context.fillText(`${i + 1}`, cx2, cy2 + 1);
					text_spots[info_list[i].move.slice(2, 4)] = true;
				}
			}
		}
	};

	renderer.draw = () => {

		let rss = renderer.square_size();
		
		renderer.squares = [];

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				if (x % 2 !== y % 2) {
					context.fillStyle = dark;
				} else {
					context.fillStyle = light;
				}

				let x1 = x * rss;
				let y1 = y * rss;
				let x2 = x1 + rss;
				let y2 = y1 + rss;

				if (renderer.active_square === Point(x, y)) {
					context.fillStyle = act;
				}

				context.fillRect(x1, y1, rss, rss);
				renderer.squares.push({x1, y1, x2, y2, point: Point(x, y)});
			}
		}

		// Draw enemy pieces...

		let opponent_colour = renderer.pos.active === "w" ? "b" : "w";

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				if (renderer.pos.colour(Point(x, y)) === opponent_colour) {
					let piece = renderer.pos.state[x][y];
					let cx = x * rss;
					let cy = y * rss;
					context.drawImage(images[piece], cx, cy, rss, rss);
				}
			}
		}

		renderer.draw_info();		// Do this here so the arrows are below the friendly pieces

		// Draw friendly pieces...

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				if (renderer.pos.colour(Point(x, y)) === renderer.pos.active) {
					let piece = renderer.pos.state[x][y];
					let cx = x * rss;
					let cy = y * rss;
					context.drawImage(images[piece], cx, cy, rss, rss);
				}
			}
		}
	};

	renderer.draw_loop = () => {
		renderer.draw();
		setTimeout(renderer.draw_loop, 500);
	};

	return renderer;
}

// ------------------------------------------------------------------------------------------------

let renderer = make_renderer();

if (config && config.warn_filename) {
	renderer.err_receive(`<span class="tech">Nibbler says: You should rename config.json.example to config.json</span>`);
	renderer.err_receive("");
}

ipcRenderer.on("go", () => {
	renderer.go();
});

ipcRenderer.on("halt", () => {
	renderer.halt();
});

ipcRenderer.on("play_best", () => {
	renderer.play_best();
});

ipcRenderer.on("new", () => {
	renderer.new();
});

ipcRenderer.on("open", (event, filename) => {
	renderer.open(filename);
});

ipcRenderer.on("next", (event) => {
	renderer.next();
});

ipcRenderer.on("prev", (event) => {
	renderer.prev();
});

ipcRenderer.on("root", (event) => {
	renderer.root();
});

ipcRenderer.on("pgn_end", (event) => {
	renderer.pgn_end();
});

canvas.addEventListener("mousedown", (event) => {
	renderer.click(event);
});

// Setup return key on FEN box...
document.getElementById("fenbox").onkeydown = function(event) {
	if (event.keyCode === 13) {
		renderer.load_fen(document.getElementById("fenbox").value);
	}
};

function draw_after_images_load() {
	if (loads === 12) {
		renderer.draw_loop();
	} else {
		setTimeout(draw_after_images_load, 25);
	}
}

draw_after_images_load();
