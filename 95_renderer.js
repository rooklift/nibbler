"use strict";

function NewRenderer() {

	let renderer = Object.create(null);

	renderer.movelist_handler = NewMovelistHander();	// Deals with the movelist at the bottom.
	renderer.info_handler = NewInfoHandler();			// Handles info from the engine, and drawing it.
	renderer.node = NewTree();							// Our current place in the current tree.
	renderer.engine = NewEngine();						// Engine connection. Needs its setup() called.

	// Various state we have to keep track of...

	renderer.pgn_choices = null;						// All games found when opening a PGN file.
	renderer.mousex = null;								// Raw mouse X on the document.
	renderer.mousey = null;								// Raw mouse Y on the document.
	renderer.friendly_draws = New2DArray(8, 8);			// What pieces are drawn in boardfriends. Used to skip redraws.
	renderer.active_square = null;						// Clicked square.

	// Some sync stuff...

	renderer.leela_maybe_running = false;				// Whether we last sent "go" or "stop" to Leela.
	renderer.leela_position = null;						// The position we last sent to Leela.
	renderer.searchmoves = [];							// Moves that we're compelling Leela to search.

	// We use both leela_position and the engine.sync() method to ensure that we are actually synced up
	// with Lc0 when interpreting Lc0 output. Neither one on its own is really enough (future me: trust
	// me about this). Indeed I'm not sure if both together are foolproof, which is why we also don't
	// trust moves to be legal.

	// --------------------------------------------------------------------------------------------

	renderer.position_changed = function(new_game_flag) {

		this.info_handler.clear();
		this.searchmoves = [];

		this.go_or_halt(new_game_flag);

		this.escape();
		this.draw();
		this.movelist_handler.draw(this.node);
		fenbox.value = this.node.get_board().fen();
	};

	renderer.set_versus = function(s) {					// config.versus should not be directly set, call this function instead.
		config.versus = s;
		this.go_or_halt();
	};

	renderer.move = function(s) {						// It is safe to call this with illegal moves.

		if (typeof s !== "string") {
			console.log(`renderer.move(${s}) - bad argument`);
			return;
		}

		let board = this.node.get_board();

		// If a promotion character is required and not present, show the promotion chooser and return
		// without committing to anything.

		if (s.length === 4) {
			let source = Point(s.slice(0, 2));
			if ((board.piece(source) === "P" && source.y === 1) || (board.piece(source) === "p" && source.y === 6)) {
				let illegal_reason = board.illegal(s + "q");
				if (illegal_reason !== "") {
					console.log(`renderer.move(${s}) - ${illegal_reason}`);
				} else {
					this.show_promotiontable(s);
				}
				return;
			}
		}

		// The promised legality check...

		let illegal_reason = board.illegal(s);
		if (illegal_reason !== "") {
			console.log(`renderer.move(${s}) - ${illegal_reason}`);
			return;
		}

		this.node = this.node.make_move(s);
		this.position_changed();
		return;
	};

	renderer.play_info_index = function(n) {
		let info_list = this.info_handler.sorted();
		if (n >= 0 && n < info_list.length) {
			this.move(info_list[n].move);
		}
	};

	renderer.prev = function() {
		if (this.node.parent) {
			this.node = this.node.parent;
			this.position_changed();
		}
	};

	renderer.next = function() {
		if (this.node.children.length > 0) {
			this.node = this.node.children[0];
			this.position_changed();
		}
	};

	renderer.goto_root = function() {
		let root = this.node.get_root();
		if (this.node !== root) {
			this.node = root;
			this.position_changed();
		}
	};

	renderer.goto_end = function() {
		let end = this.node.get_end();
		if (this.node !== end) {
			this.node = end;
			this.position_changed();
		}
	};

	renderer.return_to_main_line = function() {

		let root = this.node.get_root();
		let main_line = root.future_history();
		let history = this.node.history();

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

		if (this.node !== node) {
			this.node = node;
			this.position_changed();
		}
	};

	renderer.promote_to_main_line = function() {
		this.node.promote_to_main_line();
		this.movelist_handler.draw(this.node);
	};

	renderer.delete_move = function() {

		if (!this.node.parent) {
			return;
		}

		this.node = this.node.detach();
		this.position_changed();
	};

	renderer.load_fen = function(s) {

		if (s.trim() === this.node.get_board().fen()) {
			return;
		}

		let newpos;

		try {
			newpos = LoadFEN(s);
		} catch (err) {
			alert(err);
			return;
		}

		DestroyTree(this.node);			// Optional, but might help the GC.
		this.node = NewTree(newpos);
		this.position_changed(true);
	};

	renderer.new_game = function() {
		DestroyTree(this.node);			// Optional, but might help the GC.
		this.node = NewTree();
		this.position_changed(true);
	};

	// --------------------------------------------------------------------------------------------
	// PGN...

	renderer.pgn_to_clipboard = function() {
		PGNToClipboard(this.node);
	};

	renderer.save = function(filename) {
		SavePGN(filename, this.node);
	};

	renderer.open = function(filename) {
		let buf = fs.readFileSync(filename);
		this.load_pgn_buffer(buf);
	};

	renderer.load_pgn_from_string = function(s) {
		let buf = Buffer.from(s);
		this.load_pgn_buffer(buf);
	};

	renderer.load_pgn_buffer = function(buf) {

		let new_pgn_choices = PreParsePGN(buf);

		if (new_pgn_choices.length === 1) {
			let success = this.load_pgn_object(new_pgn_choices[0]);
			if (success) {
				this.pgn_choices = new_pgn_choices;			// We only want to set this to a 1 value array if it actually worked.
			}
		} else {
			this.pgn_choices = new_pgn_choices;				// Setting it to a multi-value array is "always" OK.
			this.show_pgn_chooser();						// Now we need to have the user choose a game.
		}
	};

	renderer.load_pgn_object = function(o) {				// Returns true or false - whether this actually succeeded.

		let new_root;

		try {
			new_root = LoadPGNRecord(o);
		} catch (err) {
			alert(err);
			return false;
		}

		DestroyTree(this.node);								// Optional, but might help the GC.
		this.node = new_root;
		this.position_changed(true);

		return true;
	};

	renderer.show_pgn_chooser = function() {

		if (!this.pgn_choices) {
			alert("No PGN loaded");
			return;
		}

		this.hide_promotiontable();		// Just in case it's up.
		this.set_versus("");			// It's lame to run the GPU when we're clearly switching games.

		let lines = [];

		let max_ordinal_length = this.pgn_choices.length.toString().length;
		let padding = "";
		for (let n = 0; n < max_ordinal_length - 1; n++) {
			padding += "&nbsp;";
		}

		for (let n = 0; n < this.pgn_choices.length; n++) {

			if (n === 9 || n === 99 || n === 999 || n === 9999 || n === 99999 || n === 999999) {
				padding = padding.slice(0, padding.length - 6);
			}

			let p = this.pgn_choices[n];

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

	renderer.hide_pgn_chooser = function() {
		pgnchooser.style.display = "none";
	};

	renderer.pgnchooser_click = function(event) {

		if (!event || Array.isArray(event.path) === false) {
			return;
		}

		let n;

		for (let item of event.path) {
			if (typeof item.id === "string" && item.id.startsWith("chooser_")) {
				n = parseInt(item.id.slice(8), 10);
				break;
			}
		}

		if (n === undefined || Number.isNaN(n)) {
			return;
		}

		if (this.pgn_choices && n >= 0 && n < this.pgn_choices.length) {
			this.load_pgn_object(this.pgn_choices[n]);
		}
	};

	renderer.validate_pgn = function(filename) {
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

	renderer.leela_should_go = function() {
		return config.versus.includes(this.node.get_board().active);
	};

	renderer.receive = function(s) {
		if (s.startsWith("info")) {
			if (this.leela_position === this.node.get_board()) {		// Note leela_position is a misleading name - it's the last position we
				this.info_handler.receive(s, this.node.get_board());	// sent, but Leela could be sending info about the previous position.
			}															// So the above condition doesn't prove the info is current.
		}
		if (s.startsWith("error")) {
			this.info_handler.err_receive(s);
		}
	};

	renderer.err_receive = function(s) {
		this.info_handler.err_receive(s);
	};

	// The go and halt methods should generally not be called directly.

	renderer.go_or_halt = function(new_game_flag) {
		if (this.leela_should_go()) {
			this.__go(new_game_flag);								
		} else {
			this.__halt();
		}
	};

	renderer.__halt = function() {
		if (this.leela_maybe_running) {
			this.engine.send("stop");
			// this.engine.sync();				// Not needed. If we're changing position, invalid data will be discarded by renderer.receive().
			this.leela_maybe_running = false;
		}
	};

	renderer.__go = function(new_game_flag) {

		this.validate_searchmoves();			// Leela can crash on illegal searchmoves.
		this.hide_pgn_chooser();

		if (this.leela_maybe_running) {
			this.engine.send("stop");
		}

		if (new_game_flag) {
			this.engine.send("ucinewgame");
		}

		let start_fen = this.node.get_root().get_board().fen();

		let setup;
		if (start_fen === "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1") {
			setup = "startpos";
		} else {
			setup = `fen ${start_fen}`;
		}

		this.engine.send(`position ${setup} moves ${this.node.history().join(" ")}`);
		this.engine.sync();			// Disregard Leela output until "readyok" comes. Leela seems to time "readyok" correctly after "position" commands.

		let s;

		if (typeof config.search_nodes !== "number") {
			s = "go infinite";
		} else {
			s = `go nodes ${config.search_nodes}`;
		}

		if (this.searchmoves.length > 0) {
			s += " searchmoves";
			for (let move of this.searchmoves) {
				s += " " + move;
			}
		}

		this.engine.send(s);

		this.leela_maybe_running = true;
		this.leela_position = this.node.get_board();
	};

	renderer.validate_searchmoves = function() {

		if (!config.serious_analysis_mode) {
			this.searchmoves = [];
			return;
		}

		let valid_list = [];
		let board = this.node.get_board();

		for (let move of this.searchmoves) {
			if (board.illegal(move) === "") {
				valid_list.push(move);
			}
		}

		this.searchmoves = valid_list;
	};

	renderer.reset_leela_cache = function() {
		if (this.leela_should_go()) {
			this.__go(true);
		} else {
			this.engine.send("ucinewgame");
		}
	};

	renderer.switch_weights = function(filename) {
		this.set_versus("");
		this.engine.setoption("WeightsFile", filename);
	};

	// --------------------------------------------------------------------------------------------
	// Visual stuff...

	renderer.toggle_flip = function() {				// config.flip should not be directly set, call this function instead.

		let active_square = this.active_square;		// Save and clear this for now.
		this.set_active_square(null);

		config.flip = !config.flip;

		// Set all the ids to a temporary value so they can always have unique ids...

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				let underlay_element = document.getElementById("underlay_" + S(x, y));
				let overlay_element = document.getElementById("overlay_" + S(x, y));
				underlay_element.id = "underlay_tmp_" + S(x, y);
				overlay_element.id = "overlay_tmp_" + S(x, y);
			}
		}

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				let underlay_element = document.getElementById("underlay_tmp_" + S(x, y));
				let overlay_element = document.getElementById("overlay_tmp_" + S(x, y));
				underlay_element.id = "underlay_" + S(7 - x, 7 - y);
				overlay_element.id = "overlay_" + S(7 - x, 7 - y);
			}
		}

		this.set_active_square(active_square);		// Put it back.
		this.friendly_draws = New2DArray(8, 8);		// Everything needs drawn.
		this.draw();
	};

	renderer.escape = function() {					// Set things into a clean state.
		this.hide_pgn_chooser();
		this.hide_promotiontable();
		this.set_active_square(null);
	};

	renderer.toggle_debug_css = function() {
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

	// --------------------------------------------------------------------------------------------
	// Clickers... (except the PGN clicker, which is in the PGN section).

	renderer.set_active_square = function(new_point) {

		// Clear the old...

		let old_point = this.active_square;

		if (old_point && old_point !== Point(null)) {
			let td = document.getElementById("underlay_" + old_point.s);
			td.style["background-color"] = (old_point.x + old_point.y) % 2 === 0 ? config.light_square : config.dark_square;
		}

		this.active_square = null;

		// Bring the new...

		if (new_point && new_point !== Point(null)) {
			let td = document.getElementById("underlay_" + new_point.s);
			td.style["background-color"] = config.active_square;
			this.active_square = new_point;
		}
	};

	renderer.mouse_point = function() {

		let [mousex, mousey] = [this.mousex, this.mousey];

		if (typeof mousex !== "number" || typeof mousey !== "number") {
			return null;
		}

		// Assumes mousex and mousey are relative to the whole window.

		mousex -= boardfriends.getBoundingClientRect().left;
		mousey -= boardfriends.getBoundingClientRect().top;

		let css = config.square_size;

		let boardx = Math.floor(mousex / css);
		let boardy = Math.floor(mousey / css);

		if (boardx < 0 || boardy < 0 || boardx > 7 || boardy > 7) {
			return null;
		}

		if (config.flip) {
			boardx = 7 - boardx;
			boardy = 7 - boardy;
		}

		return Point(boardx, boardy);
	};

	renderer.boardfriends_click = function(event) {

		this.hide_promotiontable();						// Just in case it's up.

		let p = Point(null);

		for (let item of event.path) {
			if (typeof item.id === "string" && item.id.startsWith("overlay_")) {
				p = Point(item.id.slice(8, 10));
				break;
			}
		}

		if (p === Point(null)) {
			return;
		}

		let ocm = this.info_handler.one_click_moves[p.x][p.y];
		let board = this.node.get_board();

		if (!this.active_square && ocm) {
			this.set_active_square(null);
			this.move(ocm);
			return;
		}

		if (this.active_square) {

			let move = this.active_square.s + p.s;		// e.g. "e2e4" - note promotion char is handled by renderer.move()
			this.set_active_square(null);
			this.move(move);
			return;

		} else {

			if (board.active === "w" && board.is_white(p)) {
				this.set_active_square(p);
			}
			if (board.active === "b" && board.is_black(p)) {
				this.set_active_square(p);
			}
		}
	};

	renderer.infobox_click = function(event) {

		let moves = this.info_handler.moves_from_click(event);

		if (!moves || moves.length === 0) {				// We do assume length > 0 below.
			renderer.maybe_searchmove_click(event);
			return;
		}

		// Legality checks... best to assume nothing.

		let reason = this.node.get_board().sequence_illegal(moves);
		if (reason !== "") {
			console.log("infobox_click(): " + reason);
			return;
		}

		// Add the moves to the tree...

		let node = this.node;
		for (let move of moves) {
			node = node.make_move(move);
		}

		// Maybe we're done...

		if (!config.serious_analysis_mode) {
			this.node = node;
			this.position_changed();
			return;
		}

		// OK, so we're in Serious Analysis Mode (tm). We don't change this.node.
		// But we do save some statistics into the node of the first move made...

		let stats_node = this.node.make_move(moves[0]);
		let info = this.info_handler.table[moves[0]];		// info for the first move in our clicked line.

		if (info) {
			let divisor = this.info_handler.nodes > 0 ? this.info_handler.nodes : 1;
			let nstr = (100 * info.n / divisor).toFixed(2);
			let s = `EV: ${info.value_string(1, true)}%, N: ${nstr}% of ${this.info_handler.nodes}`;
			stats_node.stats = s;
		}

		this.movelist_handler.draw(this.node);				// Draw the tree with the current node (this.node) as highlight.
		this.movelist_handler.redraw_node(stats_node);		// Redraw the stats node, which might not have been drawn (if draw was lazy).
	};

	renderer.maybe_searchmove_click = function(event) {

		let sm = this.info_handler.searchmove_from_click(event);

		if (!sm) {
			return;
		}

		if (ArrayIncludes(this.searchmoves, sm)) {
			this.searchmoves = this.searchmoves.filter(move => move !== sm);
		} else {
			this.searchmoves.push(sm);
		}

		this.info_handler.must_draw_infobox();
		this.go_or_halt();									// If we're running, send a new go message with the updated searchmoves.
	};

	renderer.movelist_click = function(event) {

		let node = this.movelist_handler.node_from_click(event);

		if (!node || node.get_root() !== this.node.get_root()) {
			return;
		}

		this.node = node;
		this.position_changed();
	};

	renderer.show_promotiontable = function(partial_move) {

		promotiontable.innerHTML = "";

		let tr = document.createElement("tr");
		promotiontable.appendChild(tr);

		let pieces = "QRBN";

		if (renderer.node.get_board().active === "b") {
			pieces = "qrbn";
		}

		for (let piece of Array.from(pieces)) {

			let td = document.createElement("td");
			td.width = config.square_size;
			td.height = config.square_size;
			td.style["background-image"] = "url('" + images[piece].src + "')";
			td.style["background-size"] = "contain";

			// This isn't a memory leak is it? The handlers are deleted when the element is deleted, right?

			td.addEventListener("mousedown", () => {
				this.hide_promotiontable();
				this.move(partial_move + piece.toLowerCase());
			});

			tr.appendChild(td);
		}

		promotiontable.style.display = "block";
	};

	renderer.hide_promotiontable = function() {
		promotiontable.style.display = "none";
	};

	// --------------------------------------------------------------------------------------------

	renderer.handle_drop = function(event) {

		// Note to self - examining the event in the console can be misleading
		// because the object seems to get changed after we've used it.

		// Just about any drop should clear the active square...

		this.set_active_square(null);

		// Is it a file?

		if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0] && event.dataTransfer.files[0].path) {
			this.open(event.dataTransfer.files[0].path);
			return;
		}

		// Is it a piece?

		let text_data = event.dataTransfer.getData("text");
		if (text_data.startsWith("overlay_")) {

			let source = Point(text_data.slice(8, 10));

			let dest = Point(null);

			for (let item of event.path) {
				if (typeof item.id === "string" && item.id.startsWith("overlay_")) {
					dest = Point(item.id.slice(8, 10));
					break;
				}
			}

			if (source !== Point(null) && dest !== Point(null)) {
				this.move(source.s + dest.s);
			}

			return;
		}
	};

	renderer.console = function(...args) {
		for (let item of args) {
			console.log(item);
		}
	};

	renderer.toggle = function(option) {

		// Cases with their own handler...

		if (option === "flip") {
			this.toggle_flip();
			return;
		}

		// Normal cases...

		config[option] = !config[option];
		this.info_handler.must_draw_infobox();

		// Cases that have additional actions after...

		if (option === "serious_analysis_mode") {
			if (!config.serious_analysis_mode) {		// We turned it off.
				this.searchmoves = [];
				this.go_or_halt();
			}
		}
	};

	// --------------------------------------------------------------------------------------------

	renderer.draw_friendlies_in_table = function() {

		// Our strategy for avoiding redraws doesn't make so much sense any more,
		// since only friendly pieces are drawn, moving from node to node in a
		// normal way always means everything has to be drawn. Meh.

		let position = this.node.get_board();

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {

				let piece_to_draw = "";

				if (position.colour(Point(x, y)) === position.active) {
					piece_to_draw = position.state[x][y];
				}

				if (piece_to_draw === this.friendly_draws[x][y]) {
					continue;
				}

				// So if we get to here, we need to draw...

				this.friendly_draws[x][y] = piece_to_draw;

				let s = S(x, y);
				let td = document.getElementById("overlay_" + s);

				if (piece_to_draw === "") {
					td.style["background-image"] = "none";
					td.draggable = false;
				} else {
					td.style["background-image"] = "url('" + images[piece_to_draw].src + "')";
					td.style["background-size"] = "contain";
					td.draggable = true;
				}
			}
		}
	};

	renderer.draw_enemies_in_canvas = function() {

		let board = this.node.get_board();

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				if (board.state[x][y] === "") {
					continue;
				}

				if (board.colour(Point(x, y)) === board.active) {
					continue;
				}

				let piece = board.state[x][y];
				let cc = CanvasCoords(x, y);
				context.drawImage(images[piece], cc.x1, cc.y1, config.square_size, config.square_size);
			}
		}
	};

	renderer.draw = function() {

		this.info_handler.draw_infobox(		// The info handler needs a bit more state than I'd like, but what can you do.
			this.mouse_point(),
			this.active_square,
			this.leela_should_go(),
			this.node.get_board().active,
			this.searchmoves);

		context.clearRect(0, 0, canvas.width, canvas.height);

		this.draw_enemies_in_canvas();
		this.info_handler.draw_arrows();
		this.draw_friendlies_in_table();
	};

	renderer.draw_loop = function() {
		this.draw();	// We could wrap this in a try, but for dev purposes it's best to break hard.
		setTimeout(this.draw_loop.bind(this), config.update_delay);
	};

	// --------------------------------------------------------------------------------------------
	// The call to setup needs to happen after renderer.receive and .err_receive actually exist...
	// One could argue that this stuff shouldn't be in NewRenderer() at all.

	if (config && config.path) {

		renderer.engine.setup(config.path, config.args, renderer.receive.bind(renderer), renderer.err_receive.bind(renderer), config.log_info_lines);

		renderer.engine.send("uci");
		for (let key of Object.keys(config.options)) {
			renderer.engine.setoption(key, config.options[key]);
		}
		renderer.engine.setoption("VerboseMoveStats", true);			// Required for LogLiveStats to work.
		renderer.engine.setoption("LogLiveStats", true);				// "Secret" Lc0 command.

		// Give me all the variations. Wait. Wait! I'm worried that what you heard was "give me
		// a lot of variations". To clarify - give me all the variations!

		renderer.engine.setoption("MultiPV", 500);
		renderer.engine.setoption("SmartPruningFactor", 0);
		renderer.engine.send("ucinewgame");
	}

	// Another thing that needs to happen somewhere...

	fenbox.value = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

	return renderer;
}
