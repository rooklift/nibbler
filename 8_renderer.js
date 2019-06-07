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

	"node_display_threshold": 0.02,

	"max_info_lines": 10,
	"update_delay": 500,
	
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

	renderer.squares = [];							// Info about clickable squares.
	renderer.active_square = null;					// Square clicked by user.
	renderer.running = false;						// Whether to resend "go" to the engine after move, undo, etc.
	renderer.ever_received_info = false;			// When false, we write stderr log instead of move info.
	renderer.stderr_log = "";						// All output received from the engine's stderr.
	renderer.infobox_string = "";					// Just to help not redraw the infobox when not needed.
	renderer.pgn_choices = null;					// All games found when opening a PGN file.
	renderer.clickable_elements = [];				// Objects relating to our infobox.

	renderer.start_pos = LoadFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
	renderer.info_table = NewInfoTable();
	renderer.board_cache = null;

	// IMPORTANT! The following arrays must NEVER be the same object. Use Array.from() a lot to avoid this.
	// Note also that user_line is always supposed to contain moves. While in some ways it would be simpler
	// to simply store an index of where we are in the user_line, this way has some advantages too...

	renderer.pgn_line = [];							// The loaded PGN object, as a list of moves.
	renderer.user_line = [];						// Entire history of the user variation, as a list of moves.
	renderer.moves = [];							// History of the currently shown position.

	fenbox.value = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

	// --------------------------------------------------------------------------------------------

	renderer.programmer_mistake_check = () => {
		if (renderer.programmer_mistake_check.warned) {
			return;
		}
		if (renderer.moves === renderer.user_line) {
			renderer.programmer_mistake_check.warned = true;
			alert("renderer.moves is the same object as renderer.user_line. This should be impossible, please tell the author how you managed it.");
		}
		if (ArrayStartsWith(renderer.user_line, renderer.moves) === false) {
			renderer.programmer_mistake_check.warned = true;
			alert("renderer.user_line does not start with renderer.moves. This should be impossible, please tell the author how you managed it.");
		}
	};

	renderer.getboard = () => {
		if (renderer.board_cache) {
			return renderer.board_cache;
		}
		let board = renderer.start_pos;
		for (let move of renderer.moves) {
			board = board.move(move);
		}
		renderer.board_cache = board;
		return renderer.board_cache;
	};

	// --------------------------------------------------------------------------------------------
	// There are 3 ways the position can change...
	//
	//		Moving inside a game.
	//		New game.
	//		Loaded game.
	//
	// Although it seems like we do a lot of book-keeping,
	// we only need to do it in these 3 functions.
	//
	// In general, changing position is as simple as setting
	// renderer.moves and calling renderer.position_changed().
	//
	// Thankfully position_changed() is the simplest function.

	renderer.position_changed = () => {

		if (ArrayStartsWith(renderer.user_line, renderer.moves) === false) {
			// The new position is not inside the current user_line
			renderer.user_line = Array.from(renderer.moves);
		}

		renderer.board_cache = null;
		renderer.info_table.clear();

		renderer.escape();
		renderer.draw_main_line();
		fenbox.value = renderer.getboard().fen();		// Must be after the cache is cleared!

		if (renderer.running) {
			renderer.go();
		}
	};

	renderer.new_game = (start_pos) => {

		if (!start_pos) {
			start_pos = LoadFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
		}

		renderer.start_pos = start_pos;
		renderer.pgn_line = [];
		renderer.user_line = [];
		renderer.moves = [];

		renderer.board_cache = null;
		renderer.info_table.clear();

		renderer.escape();
		renderer.draw_main_line();
		fenbox.value = renderer.start_pos.fen();

		if (renderer.running) {
			renderer.go(true);
		}
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
		renderer.pgn_line = Array.from(final_pos.history());
		renderer.user_line = Array.from(final_pos.history());
		renderer.moves = [];

		renderer.board_cache = null;
		renderer.info_table.clear();

		renderer.escape();
		renderer.draw_main_line();
		fenbox.value = renderer.start_pos.fen();

		if (renderer.running) {
			renderer.go(true);
		}

		return true;
	};

	// --------------------------------------------------------------------------------------------

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

		let illegal_reason = board.illegal(s);
		if (illegal_reason !== "") {
			alert(`Illegal move requested (${s}, ${illegal_reason}). This should be impossible, please tell the author how you managed it.`);
			return;
		}

		renderer.moves.push(s);
		renderer.position_changed();
	};

	renderer.play_best = () => {
		let info_list = renderer.info_table.sorted();
		if (info_list.length > 0) {
			renderer.move(info_list[0].move);
		}
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

	renderer.goto_root = () => {
		if (renderer.moves.length > 0) {
			renderer.moves = [];
			renderer.position_changed();
		}
	};

	renderer.goto_end = () => {
		if (renderer.moves.length !== renderer.user_line.length) {
			renderer.moves = Array.from(renderer.user_line);
			renderer.position_changed();
		}
	};

	renderer.return_to_pgn = () => {

		if (!renderer.pgn_line || renderer.pgn_line.length === 0) {
			alert("No PGN loaded.");
			return;
		}

		let new_moves_list = [];
		for (let i = 0; i < renderer.pgn_line.length; i++) {
			if (renderer.pgn_line[i] !== renderer.moves[i]) {		// renderer.moves[i] may be undefined, that's OK
				break;
			}
			new_moves_list.push(renderer.pgn_line[i]);
		}

		renderer.moves = new_moves_list;
		renderer.user_line = Array.from(renderer.pgn_line);
		renderer.position_changed();
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

	renderer.open = (filename) => {
		let buf = fs.readFileSync(filename);				// i.e. binary buffer object
		let new_pgn_choices = PreParsePGN(buf);

		if (new_pgn_choices.length === 1) {
			let success = renderer.load_pgn_object(new_pgn_choices[0]);
			if (success) {
				renderer.pgn_choices = new_pgn_choices;		// We only want to set this to a 1 value array if it actually worked.
			}
		} else {
			renderer.pgn_choices = new_pgn_choices;			// Setting it to a multi-value array is "always" OK.
			renderer.show_pgn_chooser();					// Now we need to have the user choose a game.
		}
	};

	renderer.choose_pgn = (event) => {

		// The thing that's clickable has a bunch of spans, meaning the exact
		// target might not be what we want, but we can examine the event.path
		// array and find the item with the unique id.

		let n = undefined;

		for (let item of event.path) {
			if (typeof item.id === "string" && item.id.startsWith("chooser_")) {
				n = parseInt(item.id.slice(8), 10);
			}
		}

		if (n === undefined) {
			return;
		}

		if (renderer.pgn_choices && n >= 0 && n < renderer.pgn_choices.length) {
			renderer.load_pgn_object(renderer.pgn_choices[n]);
		}
	};

	renderer.validate_pgn = (filename) => {
		let buf = fs.readFileSync(filename);		// i.e. binary buffer object
		let pgn_list = PreParsePGN(buf);

		for (let n = 0; n < pgn_list.length; n++) {

			let o = pgn_list[n];

			try {
				LoadPGN(o.movetext);
			} catch (err) {
				alert(`Game ${n + 1} - ${err.toString()}`);
				return false;
			}
		}

		alert(`This file seems OK. ${pgn_list.length} ${pgn_list.length === 1 ? "game" : "games"} checked.`);
		return true;
	};

	// --------------------------------------------------------------------------------------------
	// Engine stuff...

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

	renderer.halt = () => {
		send("stop");
		renderer.running = false;
	};

	renderer.go = (new_game_flag) => {

		renderer.hide_pgn_chooser();
		renderer.running = true;

		let setup;
		let start_fen = renderer.start_pos.fen();

		if (start_fen !== "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1") {
			setup = `fen ${start_fen}`;
		} else {
			setup = "startpos";
		}

		send("stop");
		if (new_game_flag) {
			send("ucinewgame");
		}

		send(`position ${setup} moves ${renderer.moves.join(" ")}`);
		sync();																	// See comment on how sync() works
		send("go infinite");
	};

	renderer.reset_leela_cache = () => {
		if (renderer.running) {
			renderer.go(true);
		} else {
			send("ucinewgame");
		}
	};

	// --------------------------------------------------------------------------------------------
	// Visual stuff...

	renderer.escape = () => {			// Set things into a clean state.
		renderer.hide_pgn_chooser();
		renderer.active_square = null;
		renderer.draw();
	};

	renderer.show_pgn_chooser = () => {

		if (!renderer.pgn_choices) {
			alert("No PGN loaded");
			return;
		}

		renderer.halt();				// It's lame to run the GPU when we're clearly switching games.

		let lines = [];

		lines.push("&nbsp;");

		let max_ordinal_length = renderer.pgn_choices.length.toString().length;
		let padding = "";
		for (let n = 0; n < max_ordinal_length - 1; n++) {
			padding += "&nbsp;";
		}

		for (let n = 0; n < renderer.pgn_choices.length; n++) {

			if (n === 9 || n === 99 || n === 999 || n === 9999 || n === 99999 || n === 999999) {
				padding = padding.slice(0, padding.length - 6);
			}

			let p = renderer.pgn_choices[n];

			let s;

			if (p.tags.Result === "1-0") {
				s = `${padding}${n + 1}. <span class="blue">${p.tags.White}</span> - ${p.tags.Black}`;
			} else if (p.tags.Result === "0-1") {
				s = `${padding}${n + 1}. ${p.tags.White} - <span class="blue">${p.tags.Black}</span>`;
			} else {
				s = `${padding}${n + 1}. ${p.tags.White} - ${p.tags.Black}`;
			}
			lines.push(`<span id="chooser_${n}">&nbsp;&nbsp;${s}</span>`);
		}

		lines.push("&nbsp;");

		pgnchooser.innerHTML = lines.join("<br>");
		pgnchooser.style.display = "block";
	};

	renderer.hide_pgn_chooser = () => {
		pgnchooser.style.display = "none";
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

		let board = renderer.start_pos;
		let deviated_from_pgn = false;

		// First, have the moves actually made on the visible board.
		
		let i = 0;

		for (let m of renderer.moves) {

			if (renderer.pgn_line && renderer.pgn_line.length > 0 && deviated_from_pgn === false && renderer.pgn_line[i] !== m) {
				elements1.push(`<span class="red">(deviated)</span>`);
				deviated_from_pgn = true;
			}

			if (board.active === "w") {
				elements1.push(`${board.fullmove}.`);
			}

			elements1.push(board.nice_string(m));
			board = board.move(m);

			i++;
		}

		// Next, have the moves to the end of the user line.

		for (let m of renderer.user_line.slice(renderer.moves.length)) {

			if (renderer.pgn_line && renderer.pgn_line.length > 0 && deviated_from_pgn === false && renderer.pgn_line[i] !== m) {
				elements2.push(`<span class="red">(deviated)</span>`);
				deviated_from_pgn = true;
			}

			if (board.active === "w") {
				elements2.push(`${board.fullmove}.`);
			}

			elements2.push(board.nice_string(m));
			board = board.move(m);

			i++;
		}

		let s1 = elements1.join(" ");		// Possibly empty string
		let s2 = elements2.join(" ");		// Possibly empty string

		if (s2.length > 0) {
			s2 = `<span class="gray">` + s2 + "</span>";
		}

		mainline.innerHTML = [s1, s2].filter(s => s !== "").join(" ");
	};

	// --------------------------------------------------------------------------------------------
	// We had some problems with the info clicker: we used to destroy and create
	// clickable objects a lot. This seemed to lead to moments where clicks wouldn't
	// register.
	//
	// A better approach is to use an event handler on the infobox element itself
	// (which is set up at the bottom of this file) and examine the event for the
	// target property.

	renderer.draw_infobox = () => {

		if (!renderer.ever_received_info) {
			let html_nodes = infobox.children;
			if (html_nodes.length === 0) {
				let node = document.createElement("span");
				node.id = "clicker_0";
				infobox.appendChild(node);
			}
			html_nodes[0].innerHTML = renderer.stderr_log;
			return;
		}

		let info_list = renderer.info_table.sorted();
		let elements = [];												// Not HTML elements, just our own objects

		if (renderer.running === false) {
			elements.push({
				class: "gray",
				text: "(halted)<br><br>"
			});
		}

		for (let i = 0; i < info_list.length && i < config.max_info_lines; i++) {

			let info = info_list[i];

			elements.push({
				class: "blue",
				text: `${info.winrate_string()} `,
			});

			let colour = renderer.getboard().active;

			let nice_pv = info.nice_pv();

			for (let n = 0; n < nice_pv.length; n++) {
				let nice_move = nice_pv[n];
				let element = {
					class: colour === "w" ? "white" : "pink",
					text: nice_move + " ",
					move: info.pv[n],
				};
				if (nice_move.includes("O-O")) {
					element.class += " nobr";
				}
				elements.push(element);
				colour = OppositeColour(colour);
			}

			elements.push({
				class: "blue",
				text: `(N: ${info.n.toString()}, P: ${info.p})`
			});

			if (elements.length > 0) {			// Always true.
				elements[elements.length - 1].text += "<br><br>";
			}
		}

		let html_nodes = infobox.children;		// Read only thing that's automatically updated when we append children.

		for (let n = 0; true; n++) {
			if (n < infobox.children.length && n < elements.length) {
				html_nodes[n].innerHTML = elements[n].text;
				html_nodes[n].className = elements[n].class;
			} else if (n < html_nodes.length) {
				html_nodes[n].innerHTML = "";
				html_nodes[n].className = "";
			} else if (n < elements.length) {
				let node = document.createElement("span");
				node.id = `clicker_${n}`;
				infobox.appendChild(node);
				html_nodes[n].innerHTML = elements[n].text;
				html_nodes[n].className = elements[n].class;
			} else {
				break;
			}
		}

		renderer.clickable_elements = elements;
	};

	renderer.info_click = (event) => {

		// Look at the path to find our element with the unique id.

		let n = undefined;

		for (let item of event.path) {
			if (typeof item.id === "string" && item.id.startsWith("clicker_")) {
				n = parseInt(item.id.slice(8), 10);
			}
		}

		if (n === undefined) {
			return;
		}

		// This is a bit icky, it relies on the fact that our clickable_elements list
		// has some objects that lack a move property (the blue info bits).
		//
		// There's also some small chance that we will receive an outdated click. 
		// However, we know that our clickable_elements list matches the current board, 
		// so the only danger is the user gets something unintended, but it will still 
		// be legal.

		if (!renderer.clickable_elements || n >= renderer.clickable_elements.length) {
			return;
		}

		let move_list = [];

		// Work backwards until we get to the start of the line...

		for (; n >= 0; n--) {
			let element = renderer.clickable_elements[n];
			if (!element || !element.move) {
				break;
			}
			move_list.push(element.move);
		}

		if (move_list.length === 0) {
			return;
		}

		move_list.reverse();

		// Legality checks... probably unnecessary...

		let tmp_board = renderer.getboard();
		for (let move of move_list) {
			if (tmp_board.illegal(move) !== "") {
				return;
			}
			tmp_board = tmp_board.move(move);
		}

		renderer.moves = renderer.moves.concat(move_list);
		renderer.position_changed();

	};

	// --------------------------------------------------------------------------------------------

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

		// Not using requestAnimationFrame the normal way. But it still
		// may make the "animation" smoother, I think.

		requestAnimationFrame(() => {
			renderer.draw_infobox();
			renderer.draw_normal();
		});
	};

	renderer.draw_loop = () => {
		renderer.programmer_mistake_check();			// Regularly check that we haven't violated some assumptions...
		renderer.draw();
		setTimeout(renderer.draw_loop, config.update_delay);
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

pgnchooser.addEventListener("mousedown", (event) => {
	renderer.choose_pgn(event);
});

canvas.addEventListener("mousedown", (event) => {
	renderer.canvas_click(event);
});

infobox.addEventListener("mousedown", (event) => {
	renderer.info_click(event);
});

// Setup return key on FEN box...
fenbox.onkeydown = (event) => {
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
