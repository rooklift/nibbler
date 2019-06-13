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
	
	"logfile": null
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

function make_renderer() {

	let renderer = Object.create(null);

	renderer.active_square = null;					// Square clicked by user.
	renderer.running = false;						// Whether to resend "go" to the engine after move, undo, etc.
	renderer.ever_received_info = false;			// When false, we write stderr log instead of move info.
	renderer.stderr_log = "";						// All output received from the engine's stderr.
	renderer.pgn_choices = null;					// All games found when opening a PGN file.
	renderer.infobox_clickers = [];					// Objects relating to our infobox.
	renderer.mousex = null;							// Raw mouse X on the canvas, e.g. between 0 and 640.
	renderer.mousey = null;							// Raw mouse Y on the canvas, e.g. between 0 and 640.
	renderer.one_click_moves = New2DArray(8, 8);	// 2D array of [x][y] --> move string or null.
	renderer.movelist_connections = null;			// List of objects telling us what movelist clicks go to what nodes.
	renderer.movelist_connections_version = -1;		// 
	renderer.last_tick_highlight_dest = null;		// Used to skip redraws.

	renderer.info_table = NewInfoTable();			// Holds info about the engine evaluations.
	renderer.node = NewTree();						// Our current place in the current tree.

	fenbox.value = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

	// --------------------------------------------------------------------------------------------

	renderer.position_changed = (new_game_flag) => {

		renderer.info_table.clear();

		renderer.escape();
		renderer.draw_movelist();
		fenbox.value = renderer.node.fen();

		if (renderer.running) {
			renderer.go(new_game_flag);
		}
	};

	renderer.move = (s) => {		// It is safe to call this with illegal moves.

		if (typeof s !== "string") {
			console.log(`renderer.move(${s}) - bad argument`);
			return false;
		}

		let board = renderer.node.get_board();

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

		// The promised legality check...

		let illegal_reason = board.illegal(s);
		if (illegal_reason !== "") {
			console.log(`renderer.move(${s}) - ${illegal_reason}`);
			return false;
		}

		renderer.node = renderer.node.make_move(s);
		renderer.position_changed();
		return true;
	};

	renderer.play_info_index = (n) => {
		let info_list = renderer.info_table.sorted();
		if (n >= 0 && n < info_list.length) {
			renderer.move(info_list[n].move);
		}
	};

	renderer.prev = () => {
		if (renderer.node.parent) {
			renderer.node = renderer.node.parent;
			renderer.position_changed();
		}
	};

	renderer.next = () => {							// FIXME? Doesn't remember current line.
		if (renderer.node.children.length > 0) {
			renderer.node = renderer.node.children[0];
			renderer.position_changed();
		}
	};

	renderer.goto_root = () => {
		renderer.node = renderer.node.get_root();
		renderer.position_changed();
	};

	renderer.goto_end = () => {
		renderer.node = renderer.node.get_end();
		renderer.position_changed();
	};

	renderer.return_to_main_line = () => {

		let root = renderer.node.get_root();
		let main_line = root.future_history();
		let history = renderer.node.history();

		let node = root;

		for (let n = 0; n < history.length; n++) {
			if (main_line[n] !== history[n]) {
				break;
			}
			if (node.children.length === 0) {
				break;
			}
			node = node.children[0];
		}

		renderer.node = node;
		renderer.position_changed();
	};

	renderer.promote_to_main_line = () => {
		renderer.node.promote_to_main_line();
		renderer.draw_movelist();
	};

	renderer.load_fen = (s) => {

		if (s.trim() === renderer.node.get_board().fen()) {
			return;
		}

		let newpos;

		try {
			newpos = LoadFEN(s);
		} catch (err) {
			alert(err);
			return;
		}

		renderer.node = NewTree(newpos);
		renderer.position_changed(true);
	};

	renderer.load_pgn_buffer = (buf) => {
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

	renderer.open = (filename) => {
		let buf = fs.readFileSync(filename);
		renderer.load_pgn_buffer(buf);
	};

	renderer.load_pgn_from_string = (s) => {
		let buf = Buffer.from(s);
		renderer.load_pgn_buffer(buf);
	};

	renderer.save = (filename) => {
		SavePGN(filename, renderer.node);
	};

	renderer.new_game = () => {
		renderer.node = NewTree();
		renderer.position_changed(true);
	};

	renderer.load_pgn_object = (o) => {			// Returns true or false - whether this actually succeeded.

		let new_root;

		try {
			new_root = LoadPGNRecord(o);
		} catch (err) {
			alert(err);
			return false;
		}

		renderer.node = new_root;
		renderer.position_changed(true);

		return true;
	};

	renderer.pgnchooser_click = (event) => {

		// The thing that's clickable has a bunch of spans, meaning the exact
		// target might not be what we want, but we can examine the event.path
		// array and find the item with the unique id.

		let n;

		for (let item of event.path) {
			if (typeof item.id === "string" && item.id.startsWith("chooser_")) {
				n = parseInt(item.id.slice(8), 10);
				break;
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
				LoadPGNRecord(o);
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
			renderer.info_table.receive(s, renderer.node.get_board());
		}

		if (s.startsWith("error")) {
			renderer.err_receive(s);
		}
	};

	renderer.err_receive = (s) => {
		if (s.indexOf("WARNING") !== -1 || s.indexOf("error") !== -1) {
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

		send("stop");
		if (new_game_flag) {
			send("ucinewgame");
		}

		let start_fen = renderer.node.get_root().fen();
		let setup = `fen ${start_fen}`;

		// FIXME: can use "startpos" when normal starting position

		send(`position ${setup} moves ${renderer.node.history().join(" ")}`);
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

	renderer.switch_weights = (filename) => {
		renderer.halt();
		setoption("WeightsFile", filename);
		send("ucinewgame");
	};

	// --------------------------------------------------------------------------------------------
	// Visual stuff...

	renderer.escape = () => {			// Set things into a clean state.
		renderer.hide_pgn_chooser();
		renderer.active_square = null;
		renderer.draw();
	};

	renderer.toggle_debug_css = () => {
		let ss = document.styleSheets[0];
		let i = 0;
		for (let rule of Object.values(ss.cssRules)) {
			if (rule.selectorText && rule.selectorText === "*") {
				ss.deleteRule(i);
				return;
			}
			i++;
		}
		ss.insertRule("* {outline: 1px dotted red;}");
	};

	renderer.show_pgn_chooser = () => {

		if (!renderer.pgn_choices) {
			alert("No PGN loaded");
			return;
		}

		renderer.halt();				// It's lame to run the GPU when we're clearly switching games.

		let lines = [];

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

			if (p.tags.Opening) {
				s += `  <span class="gray">(${p.tags.Opening})</span>`;
			}

			lines.push(`<li id="chooser_${n}">${s}</li>`);
		}

		pgnchooser.innerHTML = "<ul>" + lines.join("") + "</ul>";
		pgnchooser.style.display = "block";
	};

	renderer.hide_pgn_chooser = () => {
		pgnchooser.style.display = "none";
	};

	renderer.square_size = () => {
		return config.board_size / 8;
	};

	renderer.canvas_click = (event) => {

		let p = renderer.mouse_to_point(event.offsetX, event.offsetY);
		if (!p) {
			return;
		}

		let ocm = renderer.one_click_moves[p.x][p.y];
		let board = renderer.node.get_board();

		if (!renderer.active_square && ocm) {
			renderer.move(ocm);
			return;
		}

		if (renderer.active_square) {

			let move = renderer.active_square.s + p.s;		// e.g. "e2e4" - note promotion char is handled by renderer.move()
			renderer.active_square = null;

			let success = renderer.move(move);		// move() will draw if it succeeds...
			if (!success) {
				renderer.draw();					// ... but if it doesn't, we draw to show the active_square cleared.
			}

			return;

		} else {

			if (board.active === "w" && board.is_white(p)) {
				renderer.active_square = p;
			}
			if (board.active === "b" && board.is_black(p)) {
				renderer.active_square = p;
			}
		}

		renderer.draw();
	};

	renderer.draw_movelist = () => {

		// As a cheap hack, go through the nodes on the displayed line and add a flag
		// to them so we know to draw them in a different colour. We'll undo the damage
		// after we write the list.

		let foo = renderer.node;
		while(foo) {
			foo.bright = true;
			foo = foo.parent;
		}

		if (!renderer.movelist_connections || renderer.movelist_connections_version !== total_tree_changes) {
			renderer.movelist_connections = TokenNodeConnections(renderer.node);
			renderer.movelist_connections_version = total_tree_changes;
		}

		let elements = [];		// Objects containing class and text.

		let blue_element_n;

		for (let n = 0; n < renderer.movelist_connections.length; n++) {

			let s = renderer.movelist_connections.tokens[n];

			let next_s = renderer.movelist_connections.tokens[n + 1];	// possibly undefined
			let node = renderer.movelist_connections.nodes[n];			// possibly null

			let space = (s === "(" || next_s === ")") ? "" : " ";

			let element = {
				text: `${s}${space}`
			};

			if (node === renderer.node && s.endsWith(".") === false) {
				element.class = "blue";
				blue_element_n = n;
			} else if (node && node.bright) {
				element.class = "white";
			} else {
				element.class = "gray";
			}

			elements.push(element);
		}

		renderer.update_clickable_thingy(movelist, elements, "movelist");

		// Undo the damage to our tree...

		foo = renderer.node;
		while(foo) {
			delete foo.bright;
			foo = foo.parent;
		}

		// Fix the scrollbar position...

		if (blue_element_n !== undefined) {

			let top = document.getElementById(`movelist_${blue_element_n}`).offsetTop - movelist.offsetTop;

			if (top < movelist.scrollTop) {
				movelist.scrollTop = top;
			}

			let bottom = top + document.getElementById(`movelist_${blue_element_n}`).offsetHeight;

			if (bottom > movelist.scrollTop + movelist.offsetHeight) {
				movelist.scrollTop = bottom - movelist.offsetHeight;
			}

		}
	};

	renderer.movelist_click = (event) => {

		if (!renderer.movelist_connections) {
			return;
		}

		let n;

		for (let item of event.path) {
			if (typeof item.id === "string") {
				if (item.id === "mainline_deviated") {
					renderer.return_to_main_line();
					return;
				}
				if (item.id.startsWith("movelist_")) {
					n = parseInt(item.id.slice(9), 10);
					break;
				}
			}
		}

		if (n === undefined) {
			return;
		}

		if (n < 0 || n >= renderer.movelist_connections.length) {
			return;
		}

		let node = renderer.movelist_connections.nodes[n];

		if (!node) {
			return;
		}

		if (node.get_root() !== renderer.node.get_root()) {
			return;
		}

		renderer.node = node;
		renderer.position_changed();
	};

	renderer.mouse_to_point = (mousex, mousey) => {

		// Assumes mousex and mousey are relative to canvas top left.

		if (typeof mousex !== "number" || typeof mousey !== "number") {
			return null;
		}

		let rss = renderer.square_size();

		let boardx = Math.floor(mousex / rss);
		let boardy = Math.floor(mousey / rss);

		if (boardx < 0 || boardy < 0 || boardx > 7 || boardy > 7) {
			return null;
		}

		if (config.flip) {
			boardx = 7 - boardx;
			boardy = 7 - boardy;
		}

		return Point(boardx, boardy);
	};

	renderer.update_clickable_thingy = (thingy, elements, prefix) => {

		// What this is: given a container (the thingy) and a list of elements (which are normal JS objects
		// containing a "text" and a "class" property) we make the container have child spans which have the
		// said text and class, as well as a unique id so they can be clicked on (e.g. "foo_37").
		//
		// If the children already exist, we reuse them.
		// We hide existing children if there are too many.
		// We create more children as needed.

		let html_nodes = thingy.children;
		let elements_length = elements.length;					// Is this type of optimisation helpful?
		let initial_html_nodes_length = html_nodes.length;

		for (let n = 0; true; n++) {
			if (n < initial_html_nodes_length && n < elements_length) {
				html_nodes[n].innerHTML = elements[n].text;
				html_nodes[n].className = elements[n].class;
				html_nodes[n].style.display = "inline";
				if (html_nodes[n].id !== `${prefix}_${n}`) {
					console.log("update_clickable_thingy(): Pre-existing child did not have correct id");
					html_nodes[n].id = `${prefix}_${n}`;
				}
			} else if (n < initial_html_nodes_length) {
				html_nodes[n].style.display = "none";
			} else if (n < elements_length) {
				let node = document.createElement("span");
				node.id = `${prefix}_${n}`;
				node.innerHTML = elements[n].text;
				node.className = elements[n].class;
				node.style.display = "inline";
				thingy.appendChild(node);
			} else {
				break;
			}
		}
	};

	renderer.draw_infobox = () => {

		if (!renderer.ever_received_info) {
			let html_nodes = infobox.children;
			if (html_nodes.length === 0) {
				let node = document.createElement("span");
				node.id = "infobox_0";
				infobox.appendChild(node);
			}
			html_nodes[0].innerHTML = renderer.stderr_log;
			return;
		}

		// Find the square the user is hovering over (might be null)...
		let p = renderer.mouse_to_point(renderer.mousex, renderer.mousey);

		// By default we're highlighting nothing...
		let highlight_dest = null;
		let one_click_move = "__none__";

		// But if the hovered square actually has a one-click move available, highlight its variation,
		// unless we have an active (i.e. clicked) square...
		if (p && renderer.one_click_moves[p.x][p.y] && !renderer.active_square) {
			highlight_dest = p;
			one_click_move = renderer.one_click_moves[p.x][p.y];
		}

		// The info_table.drawn property is set to false whenever new info is received from the engine.
		// So maybe we can skip drawing the infobox, and just return...

		if (renderer.info_table.drawn) {

			if (highlight_dest === renderer.last_tick_highlight_dest) {

				// Count skips for debugging...

				renderer.draw_infobox.skips = renderer.draw_infobox.skips === undefined ? 1 : renderer.draw_infobox.skips + 1;
				return;
			}
		}

		renderer.last_tick_highlight_dest = highlight_dest;

		//

		let info_list = renderer.info_table.sorted();
		let elements = [];									// Not HTML elements, just our own objects.

		if (renderer.running === false) {
			elements.push({
				class: "yellow",
				text: "HALTED "
			});
		}

		elements.push({
			class: "gray",
			text: `Nodes: ${renderer.info_table.nodes}, N/s: ${renderer.info_table.nps}<br><br>`
		});

		for (let i = 0; i < info_list.length && i < config.max_info_lines; i++) {

			let new_elements = [];

			let info = info_list[i];

			new_elements.push({
				class: "blue",
				text: `${info.value_string(1)} `,
			});

			let colour = renderer.node.get_board().active;

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
				new_elements.push(element);
				colour = OppositeColour(colour);
			}

			new_elements.push({
				class: "gray",
				text: `(N: ${info.n.toString()}, P: ${info.p})`
			});

			if (info.move === one_click_move) {
				for (let e of new_elements) {
					e.class += " redback";
				}
			}

			if (new_elements.length > 0) {					// Always true.
				new_elements[new_elements.length - 1].text += "<br><br>";
			}

			elements = elements.concat(new_elements);
		}

		renderer.update_clickable_thingy(infobox, elements, "infobox");
		renderer.infobox_clickers = elements;				// We actually only need the move or its absence in each object. Meh.
		renderer.info_table.drawn = true;
	};

	renderer.infobox_click = (event) => {

		let n;

		for (let item of event.path) {
			if (typeof item.id === "string" && item.id.startsWith("infobox_")) {
				n = parseInt(item.id.slice(8), 10);
				break;
			}
		}

		if (n === undefined) {
			return;
		}

		// This is a bit icky, it relies on the fact that our infobox_clickers list
		// has some objects that lack a move property (the blue info bits).
		//
		// There's also some small chance that we will receive an outdated click. 
		// However, we know that our infobox_clickers list matches the current board, 
		// so the only danger is the user gets something unintended, but it will still 
		// be legal.

		if (!renderer.infobox_clickers || n >= renderer.infobox_clickers.length) {
			return;
		}

		let move_list = [];

		// Work backwards until we get to the start of the line...

		for (; n >= 0; n--) {
			let element = renderer.infobox_clickers[n];
			if (!element || !element.move) {
				break;
			}
			move_list.push(element.move);
		}

		if (move_list.length === 0) {
			return;
		}

		move_list.reverse();

		// Legality checks... best to assume nothing.

		let tmp_board = renderer.node.get_board();
		for (let move of move_list) {
			if (tmp_board.illegal(move) !== "") {
				return;
			}
			tmp_board = tmp_board.move(move);
		}

		for (let move of move_list) {
			renderer.node = renderer.node.make_move(move);
		}
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

	renderer.draw_head = (o) => {
		let cc = renderer.canvas_coords(o.x, o.y);
		context.fillStyle = o.colour;
		context.beginPath();
		context.arc(cc.cx, cc.cy, 12, 0, 2 * Math.PI);
		context.fill();
		context.fillStyle = "black";
		context.fillText(`${o.info.value_string(0)}`, cc.cx, cc.cy + 1);
	};

	renderer.draw_position = () => {

		context.lineWidth = 8;
		context.textAlign = "center";
		context.textBaseline = "middle";
		context.font = config.board_font;

		let pieces = [];
		let board = renderer.node.get_board();

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
		let heads = Object.create(null);

		// Clear our 2D array of one-click moves.
		// We will shortly update it with valid ones.
		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				renderer.one_click_moves[x][y] = null;
			}
		}

		if (info_list.length > 0) {

			let best_nodes = info_list[0].n;
			
			for (let i = 0; i < info_list.length; i++) {

				let [x1, y1] = XY(info_list[i].move.slice(0, 2));
				let [x2, y2] = XY(info_list[i].move.slice(2, 4));

				if (info_list[i].n >= best_nodes * config.node_display_threshold) {

					let loss = 0;

					if (typeof info_list[0].value === "number" && typeof info_list[i].value === "number") {
						loss = info_list[0].value - info_list[i].value;
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

					// We only draw the best ranking for each particular target square.
					// At the same time, the square becomes available for one-click
					// movement; we set the relevant info in renderer.one_click_moves.

					if (heads[info_list[i].move.slice(2, 4)] === undefined) {
						heads[info_list[i].move.slice(2, 4)] = {
							fn: renderer.draw_head,
							colour: colour,
							info: info_list[i],
							x: x2,
							y: y2
						};
						renderer.one_click_moves[x2][y2] = info_list[i].move;
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

		drawables = drawables.concat(Object.values(heads));

		for (let o of drawables) {
			o.fn(o);
		}
	};

	renderer.draw = () => {

		// Not using requestAnimationFrame the normal way. But it still
		// may make the "animation" smoother, I think.

		requestAnimationFrame(() => {
			renderer.draw_infobox();
			renderer.draw_board(config.light_square, config.dark_square);
			renderer.draw_position();
		});
	};

	renderer.draw_loop = () => {
		renderer.draw();
		setTimeout(renderer.draw_loop, config.update_delay);
	};

	return renderer;
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
