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
	readyok_required++;
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

	"width": 1280,
	"height": 840,
	"board_size": 640,
	"mainline_height": 108,

	"show_n": true,
	"show_p": true,
	"show_pv": true,
	"show_winrate": true,

	"rank_font": "24px Arial",

	"light_square": "#dadada",
	"dark_square": "#b4b4b4",
	"active_square": "#cc9966",

	"best_colour": "#66aaaa",
	"good_colour": "#66aa66",
	"bad_colour": "#cccc66",
	"terrible_colour": "#cc6666",

	"bad_move_threshold": 0.02,
	"terrible_move_threshold": 0.04,
	
	"max_info_lines": 10,
	"node_display_threshold": 0.02,

	"logfile": null
});

infobox.style.height = config.board_size.toString() + "px";
mainline.style.height = config.mainline_height.toString() + "px";				// Is there a way to avoid needing this, to get the scroll bar?
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
			Log("(ignored) < " + line);
			return;
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
	renderer.info_table = NewInfoTable();

	renderer.squares = [];							// Info about clickable squares.
	renderer.active_square = null;					// Square clicked by user.
	renderer.running = false;						// Whether to resend "go" to the engine after move, undo, etc.
	renderer.ever_received_info = false;			// When false, we write stderr log instead of move info.
	renderer.stderr_log = "";						// All output received from the engine's stderr.
	renderer.infobox_string = "";					// Just to help not redraw the infobox when not needed.
	renderer.pgn_choices = null;					// All games found when opening a PGN file.
	renderer.clickable_pv_lines = [];				// List of PV objects we use to tell what the user clicked on.

	renderer.start_pos = LoadFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
	renderer.user_line = [];						// Entire history of the user variation, as a list of moves.
	renderer.moves = [];							// History of the currently shown position.

	renderer.board_cache = null;

	fenbox.value = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

	// --------------------------------------------------------------------------------------------

	renderer.getboard = () => {

		if (renderer.board_cache && CompareArrays(renderer.board_cache.moves, renderer.moves)) {
			return renderer.board_cache.board;
		}

		let board = renderer.start_pos;
		for (let move of renderer.moves) {
			board = board.move(move);
		}

		renderer.board_cache = {
			moves: Array.from(renderer.moves),		// Copy, not reference!
			board: board
		};

		return renderer.board_cache.board;
	}

	renderer.move = (s) => {

		let board = renderer.getboard();

		// Add promotion if needed and not present...

		if (s.length === 4) {
			let source = Point(s.slice(0, 2));
			if (board.piece(source) === "P" && source.y === 1) {
				console.log(`Move ${s} was promotion but had no promotion piece set; adjusting to ${s + "q"}`);
				s += "q";
			}
			if (board.piece(source) === "p" && source.y === 6) {
				console.log(`Move ${s} was promotion but had no promotion piece set; adjusting to ${s + "q"}`);
				s += "q";
			}
		}

		let illegal_reason = board.illegal(s)
		if (illegal_reason !== "") {
			alert(`Illegal move requested (${s}, ${illegal_reason}). This should be impossible, please tell the author how you managed it.`);
			return;
		}

		renderer.moves.push(s);
		renderer.position_changed();
	};

	// There are 3 ways the position can change...
	//
	// Moving inside a game.
	// New game.
	// Loaded game.

	renderer.position_changed = () => {

		if (ArrayStartsWith(renderer.user_line, renderer.moves) === false) {
			// The new position (from moves) is not inside the current user_line
			renderer.user_line = Array.from(renderer.moves);
		}

		renderer.draw();
		renderer.draw_main_line();
		fenbox.value = renderer.getboard().fen();
	};

	renderer.new_game = (start_pos) => {

		if (!start_pos) {
			start_pos = LoadFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
		}

		renderer.start_pos = start_pos;
		renderer.user_line = [];
		renderer.moves = [];

		renderer.draw();
		renderer.draw_main_line();
		fenbox.value = renderer.start_pos.fen();
	};

	renderer.load_pgn_object = (o) => {			// Returns true or false - whether this actually succeeded.

		let final_pos;

		try {
			final_pos = LoadPGN(o.movetext);
		} catch (err) {
			alert(err);
			return false;
		}

		// FIXME: I think a PGN can actually specify a different starting position?
		renderer.start_pos = LoadFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
		renderer.user_line = Array.from(final_pos.history());
		renderer.moves = [];

		renderer.draw();
		renderer.draw_main_line();
		fenbox.value = renderer.start_pos.fen();

		return true;
	};

	renderer.prev = () => {
		if (renderer.moves.length > 0) {
			renderer.moves = renderer.moves.slice(0, renderer.moves.length - 1);
			renderer.position_changed();
		}
	};

	renderer.next = () => {
		if (renderer.user_line.length > renderer.moves.length) {
			renderer.moves = renderer.user_line.slice(0, renderer.moves.length + 1);
			renderer.position_changed();
		}
	};

	renderer.load_fen = (s) => {

		let newpos;

		try {
			newpos = LoadFEN(s);
		} catch (err) {
			alert(err);
			return;
		}

		renderer.new_game(newpos);
	};

	// --------------------------------------------------------------------------------------------
	// Things below this point are not related to the difficult task of keeping track of positions.

	renderer.receive = (s) => {

		if (s.startsWith("info")) {
			renderer.ever_received_info = true;
			renderer.info_table.receive(s, renderer.getboard());
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

	renderer.square_size = () => {
		return config.board_size / 8;
	};

	renderer.canvas_click = (event) => {

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

		let board = renderer.getboard();

		if (renderer.active_square) {

			let move_string = renderer.active_square.s + point.s;		// e.g. "e2e4"
			renderer.active_square = null;

			let illegal_reason = board.illegal(move_string);	

			if (illegal_reason === "") {			
				renderer.move(move_string);
				return;							// Skip the draw, below, since move() will do that.
			} else {
				console.log(illegal_reason);
			}

		} else {

			if (board.active === "w" && board.is_white(point)) {
				renderer.active_square = point;
			}
			if (board.active === "b" && board.is_black(point)) {
				renderer.active_square = point;
			}
		}

		renderer.draw();
	};

	renderer.draw_main_line = () => {
		let elements1 = [];
		let elements2 = [];

		// First, have the moves actually made on the visible board.
			
		for (let m of renderer.moves) {
			elements1.push(m);
		}

		// Next, have the moves to the end of the user line.

		for (let m of renderer.user_line.slice(renderer.moves.length)) {
			elements2.push(m);
		}

		let s1 = elements1.join(" ");		// Possibly empty string
		let s2 = elements2.join(" ");		// Possibly empty string

		if (s2.length > 0) {
			s2 = `<span class="gray">` + s2 + "</span>";
		}

		mainline.innerHTML = [s1, s2].filter(s => s !== "").join(" ");
	};

	renderer.pv_click = (i, n) => {
		// TODO
	};

	renderer.draw_infobox = () => {
		// TODO
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

	renderer.draw_board = (light, dark) => {
		
		renderer.squares = [];

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				if (x % 2 === y % 2) {
					context.fillStyle = light;
				} else {
					context.fillStyle = dark;
				}

				let cc = renderer.canvas_coords(x, y);

				if (renderer.active_square === Point(x, y)) {
					context.fillStyle = config.active_square;
				}

				context.fillRect(cc.x1, cc.y1, cc.rss, cc.rss);

				// Update renderer.squares each draw - our list of clickable coordinates.

				renderer.squares.push({x1: cc.x1, y1: cc.y1, x2: cc.x2, y2: cc.y2, point: Point(x, y)});
			}
		}
	};

	renderer.draw_piece = (o) => {
		let cc = renderer.canvas_coords(o.x, o.y);
		context.drawImage(images[o.piece], cc.x1, cc.y1, cc.rss, cc.rss);
	};

	renderer.draw_arrow_line = (o) => {		// Doesn't draw the arrowhead
		let cc1 = renderer.canvas_coords(o.x1, o.y1);
		let cc2 = renderer.canvas_coords(o.x2, o.y2);
		context.strokeStyle = o.colour;
		context.fillStyle = o.colour;
		context.beginPath();
		context.moveTo(cc1.cx, cc1.cy);
		context.lineTo(cc2.cx, cc2.cy);
		context.stroke();
	};

	renderer.draw_ranking = (o) => {		// Does draw the arrowhead
		let cc = renderer.canvas_coords(o.x, o.y);
		context.fillStyle = o.colour;
		context.beginPath();
		context.arc(cc.cx, cc.cy, 12, 0, 2 * Math.PI);
		context.fill();
		context.fillStyle = "black";
		context.fillText(`${o.rank}`, cc.cx, cc.cy + 1);
	};

	renderer.draw_normal = () => {

		context.lineWidth = 8;
		context.textAlign = "center";
		context.textBaseline = "middle";
		context.font = config.rank_font;

		renderer.draw_board(config.light_square, config.dark_square);

		let pieces = [];
		let board = renderer.getboard();

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				if (board.state[x][y] === "") {
					continue;
				}
				pieces.push({
					fn: renderer.draw_piece,
					piece: board.state[x][y],
					colour: board.state[x][y].toUpperCase() === board.state[x][y] ? "w" : "b",
					x: x,
					y: y
				});
			}
		}

		let info_list = renderer.info_table.sorted();

		let arrows = [];
		let rankings = Object.create(null);

		if (info_list.length > 0) {

			let best_nodes = info_list[0].n;
			
			for (let i = 0; i < info_list.length; i++) {

				let [x1, y1] = XY(info_list[i].move.slice(0, 2));
				let [x2, y2] = XY(info_list[i].move.slice(2, 4));

				if (info_list[i].n >= best_nodes * config.node_display_threshold) {

					let loss = 0;

					if (typeof info_list[0].winrate === "number" && typeof info_list[i].winrate === "number") {
						loss = info_list[0].winrate - info_list[i].winrate;
					}

					let colour;

					if (i === 0) {
						colour = config.best_colour;
					} else if (loss > config.terrible_move_threshold) {
						colour = config.terrible_colour;
					} else if (loss > config.bad_move_threshold) {
						colour = config.bad_colour;
					} else {
						colour = config.good_colour;
					}

					arrows.push({
						fn: renderer.draw_arrow_line,
						colour: colour,
						x1: x1,
						y1: y1,
						x2: x2,
						y2: y2
					});

					// We only draw the best ranking for each particular target square...

					if (rankings[info_list[i].move.slice(2, 4)] === undefined) {
						rankings[info_list[i].move.slice(2, 4)] = {
							fn: renderer.draw_ranking,
							colour: colour,
							rank: i + 1,
							x: x2,
							y: y2
						};
					}
				}
			}
		}

		// It looks best if the longest arrows are drawn underneath. Manhattan distance is good enough.

		arrows.sort((a, b) => {
			if (Math.abs(a.x2 - a.x1) + Math.abs(a.y2 - a.y1) < Math.abs(b.x2 - b.x1) + Math.abs(b.y2 - b.y1)) {
				return 1;
			}
			if (Math.abs(a.x2 - a.x1) + Math.abs(a.y2 - a.y1) > Math.abs(b.x2 - b.x1) + Math.abs(b.y2 - b.y1)) {
				return -1;
			}
			return 0;
		});

		let drawables = [];

		for (let o of pieces) {
			if (o.colour !== board.active) {
				drawables.push(o);
			}
		}

		drawables = drawables.concat(arrows);

		for (let o of pieces) {
			if (o.colour === board.active) {
				drawables.push(o);
			}
		}

		drawables = drawables.concat(Object.values(rankings));

		for (let o of drawables) {
			o.fn(o);
		}
	};

	renderer.draw = () => {
		renderer.draw_infobox();
		renderer.draw_normal();
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

canvas.addEventListener("mousedown", (event) => {
	renderer.canvas_click(event);
});

// Setup return key on FEN box...
fenbox.onkeydown = (event) => {
	console.log(event);
	if (event.key === "Enter") {
		renderer.load_fen(fenbox.value);
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
