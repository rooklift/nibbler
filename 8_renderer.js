"use strict";

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
	readyok_required = true;
}

// ------------------------------------------------------------------------------------------------

try {
	if (fs.existsSync("config.json")) {
		config = JSON.parse(debork_json(fs.readFileSync("config.json", "utf8")));
	} else if (fs.existsSync("config.json.example")) {
		config = JSON.parse(debork_json(fs.readFileSync("config.json.example", "utf8")));
		config.warn_filename = true;
	} else {
		alert("config.json not present");
	}
} catch (err) {
	alert("Failed to parse config file - make sure it is valid JSON, and in particular, if on Windows, use \\\\ instead of \\ as a path separator.");
}

// Some tolerable default values for config...

assign_without_overwrite(config, {
	"options": {},

	"board_size": 640,
	"mainline_height": 108,

	"show_n": true,
	"show_p": true,
	"show_pv": true,
	"show_winrate": true,

	"bad_move_threshold": 0.02,
	"terrible_move_threshold": 0.04,
	
	"max_info_lines": 10,
	"node_display_threshold": 0.02,

	"logfile": null
});

infobox.style.height = config.board_size.toString() + "px";
mainline.style.height = config.mainline_height.toString() + "px";		// Is there a way to avoid needing this, to get the scroll bar?
canvas.width = config.board_size;
canvas.height = config.board_size;

Log("");
Log("======================================================================================================================================");
Log(`Nibbler startup at ${new Date().toUTCString()}`);
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
	setoption(key, config.options[key]);
}

setoption("VerboseMoveStats", true);		// Required for LogLiveStats to work.
setoption("LogLiveStats", true);			// "Secret" Lc0 command.
setoption("MultiPV", 500);

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

		let final_pos;

		try {
			final_pos = LoadPGN(o.movetext);
		} catch (err) {
			alert(err);
			return;
		}

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

		let max_ordinal_length = pgn_list.length.toString().length;
		let padding = "";
		for (let n = 0; n < max_ordinal_length - 1; n++) {
			padding += "&nbsp;";
		}

		for (let n = 0; n < pgn_list.length; n++) {

			if (n === 9 || n === 99 || n === 999 || n === 9999 || n === 99999 || n === 999999) {
				padding = padding.slice(0, padding.length - 6);
			}

			let p = pgn_list[n];

			let s;

			if (p.tags.Result === "1-0") {
				s = `${padding}${n + 1}. <span class="blue">${p.tags.White}</span> - ${p.tags.Black}`;
			} else if (p.tags.Result === "0-1") {
				s = `${padding}${n + 1}. ${p.tags.White} - <span class="blue">${p.tags.Black}</span>`;
			} else {
				s = `${padding}${n + 1}. ${p.tags.White} - ${p.tags.Black}`;
			}
			lines.push(`<a href="javascript:renderer.choose_pgn(${n})">&nbsp;&nbsp;${s}</a>`);
		}

		lines.push("&nbsp;");

		pgnchooser.innerHTML = lines.join("<br>");
		pgnchooser.style.display = "block";
	};

	renderer.validate_pgn = (filename) => {

		let buf = fs.readFileSync(filename);		// i.e. binary buffer object
		let pgn_list = pre_parse_pgn(buf);

		for (let n = 0; n < pgn_list.length; n++) {

			let o = pgn_list[n];

			try {
				LoadPGN(o.movetext);
			} catch (err) {
				alert(`Game ${n + 1} - ${err.toString()}`);
				return;
			}
		}

		alert(`This file seems OK. ${pgn_list.length} games checked.`);
		return true;
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
			renderer.stderr_log += `${s}<br>`;
		}
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

	renderer.draw_infobox = (info_list) => {

		if (!renderer.ever_received_info) {
			if (infobox.innerHTML !== renderer.stderr_log) {	// Only update when needed, so user can select and copy.
				infobox.innerHTML = renderer.stderr_log;
			}
			return;
		}

		let s = "";

		if (!renderer.running) {
			s += "&lt;halted&gt;<br><br>";
		}

		for (let i = 0; i < info_list.length && i < config.max_info_lines; i++) {
			s += info_list[i].pv_string(renderer.pos, config);
		}

		// Only update when needed, so user can select and copy. A direct comparison
		// of s with innerHTML seems to fail (something must get changed).

		if (renderer.infobox_string !== s) {
			renderer.infobox_string = s;
			infobox.innerHTML = s;
		}
	};

	renderer.canvas_coords = (x, y) => {

		// Given the x, y coordinates on the board (a8 is 0, 0)
		// return an object with the canvas coordinates for
		// the square, and also the centre. Also has rss.
		//
		//      x1,y1--------
		//        |         |
		//        |  cx,cy  |
		//        |         |
		//        --------x2,y2

		let rss = renderer.square_size();
		let x1 = x * rss;
		let y1 = y * rss;
		let x2 = x1 + rss;
		let y2 = y1 + rss;

		if (config.flip) {
			[x1, x2] = [(rss * 8) - x2, (rss * 8) - x1];
			[y1, y2] = [(rss * 8) - y2, (rss * 8) - y1];
		}

		let cx = x1 + rss / 2;
		let cy = y1 + rss / 2;

		return {x1, y1, x2, y2, cx, cy, rss};
	};

	renderer.draw_board = () => {
		
		renderer.squares = [];

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				if (x % 2 !== y % 2) {
					context.fillStyle = dark;
				} else {
					context.fillStyle = light;
				}

				let cc = renderer.canvas_coords(x, y);

				if (renderer.active_square === Point(x, y)) {
					context.fillStyle = act;
				}

				context.fillRect(cc.x1, cc.y1, cc.rss, cc.rss);

				// Update renderer.squares each draw - our list of clickable coordinates.

				renderer.squares.push({x1: cc.x1, y1: cc.y1, x2: cc.x2, y2: cc.y2, point: Point(x, y)});
			}
		}
	};

	renderer.draw_pieces = (pieces) => {

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				if (renderer.pos.state[x][y] === "") continue;
				if (pieces.includes(renderer.pos.state[x][y])) {
					let piece = renderer.pos.state[x][y];
					let cc = renderer.canvas_coords(x, y);
					context.drawImage(images[piece], cc.x1, cc.y1, cc.rss, cc.rss);
				}
			}
		}
	};

	renderer.draw_arrows = (info_list, pieces) => {

		if (info_list.length === 0) {
			return;
		}

		let best_nodes = info_list[0].n;

		context.lineWidth = 8;
		context.textAlign = "center";
		context.textBaseline = "middle"; 
		
		for (let i = info_list.length - 1; i >= 0; i--) {		// Reverse order for aesthetics.

			let [x1, y1] = XY(info_list[i].move.slice(0, 2));
			let [x2, y2] = XY(info_list[i].move.slice(2, 4));

			if (pieces.includes(renderer.pos.state[x1][y1]) === false) {
				continue;
			}

			if (info_list[i].n >= best_nodes * config.node_display_threshold) {

				let loss = 0;

				if (typeof info_list[0].winrate === "number" && typeof info_list[i].winrate === "number") {
					loss = info_list[0].winrate - info_list[i].winrate;
					if (loss > config.terrible_move_threshold) {
						continue;
					}
				}

				if (i === 0) {
					context.strokeStyle = "#66aaaa";
					context.fillStyle = "#66aaaa";
				} else if (loss > config.bad_move_threshold) {
					context.strokeStyle = "#cccc66";
					context.fillStyle = "#cccc66";
				} else {
					context.strokeStyle = "#66aa66";
					context.fillStyle = "#66aa66";
				}

				let cc1 = renderer.canvas_coords(x1, y1);
				let cc2 = renderer.canvas_coords(x2, y2);

        		context.beginPath();
        		context.moveTo(cc1.cx, cc1.cy);
        		context.lineTo(cc2.cx, cc2.cy);
				context.stroke();
				
				context.beginPath();
				context.arc(cc2.cx, cc2.cy, 12, 0, 2 * Math.PI);
				context.fill();
			}
		}
	};

	renderer.draw_rankings = (info_list) => {

		if (info_list.length === 0) {
			return;
		}

		let best_nodes = info_list[0].n;

		let text_spots = Object.create(null);		// What target squares we have drawn text on.

		for (let i = 0; i < info_list.length; i++) {

			if (info_list[i].n >= best_nodes * config.node_display_threshold) {

				let loss = 0;

				if (typeof info_list[0].winrate === "number" && typeof info_list[i].winrate === "number") {
					loss = info_list[0].winrate - info_list[i].winrate;
					if (loss > config.terrible_move_threshold) {
						continue;
					}
				}

				let [x2, y2] = XY(info_list[i].move.slice(2, 4));
				let cc2 = renderer.canvas_coords(x2, y2);

				if (text_spots[info_list[i].move.slice(2, 4)] === undefined) {
					context.font = "24px Arial";
					context.fillStyle = "black";
					context.fillText(`${i + 1}`, cc2.cx, cc2.cy + 1);
					text_spots[info_list[i].move.slice(2, 4)] = true;
				}
			}
		}
	};

	renderer.draw = () => {

		let info_list = renderer.info_table.sorted();
		
		// We draw stuff in a very specific order to show knights "leaping over" pieces.

		renderer.draw_board();
		renderer.draw_pieces(renderer.pos.active === "w" ? "kqrbnp" : "KQRBNP");	// Enemy pieces
		renderer.draw_arrows(info_list, "KkQqRrBbPp");								// Arrows of non-knights
		renderer.draw_pieces(renderer.pos.active === "w" ? "KQRBP" : "kqrbp");		// Friendly non-knights
		renderer.draw_arrows(info_list, "Nn");										// Arrows of knights
		renderer.draw_pieces(renderer.pos.active === "w" ? "N" : "n");				// Friendly knights
		renderer.draw_rankings(info_list);
		renderer.draw_infobox(info_list);
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
	renderer.err_receive(`<span class="blue">Nibbler says: You should rename config.json.example to config.json</span>`);
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

ipcRenderer.on("validate_pgn", (event, filename) => {
	renderer.validate_pgn(filename);
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

ipcRenderer.on("toggle", (event, cfgvar) => {
	config[cfgvar] = !config[cfgvar];
	renderer.draw();
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
