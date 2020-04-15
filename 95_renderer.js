"use strict";

function NewRenderer() {

	let renderer = Object.create(null);

	renderer.engine = NewEngine();								// Engine connection. Needs its setup() called.
	renderer.node = NewTree();									// Our current place in the current tree.
	renderer.movelist_handler = NewMovelistHander();			// Deals with the movelist at the bottom.

	renderer.info_handler = NewInfoHandler();					// Handles info from the engine, and drawing it.
	renderer.info_handler.clear(renderer.node.get_board());		// Best give it a valid board to start with.

	// Various state we have to keep track of...

	renderer.pgn_choices = null;								// All games found when opening a PGN file.
	renderer.friendly_draws = New2DArray(8, 8);					// What pieces are drawn in boardfriends. Used to skip redraws.
	renderer.active_square = null;								// Clicked square.
	renderer.hoverdraw_div = -1;
	renderer.hoverdraw_depth = 0;
	renderer.tick = 0;											// How many draw loops we've been through.
	renderer.position_change_time = performance.now();			// Time of the last position change. Used for cooldown on hover draw.

	// Some sync stuff...

	renderer.leela_maybe_running = false;						// Whether we last sent "go" or "stop" to Leela.
	renderer.leela_position = null;								// The position we last sent to Leela.
	renderer.searchmoves = [];									// Moves that we're compelling Leela to search.

	// We use both leela_position and the engine.sync() method to ensure that we are actually synced up
	// with Lc0 when interpreting Lc0 output. Neither one on its own is really enough (future me: trust
	// me about this). Indeed I'm not sure if both together are foolproof, which is why we also don't
	// trust moves to be legal.

	// --------------------------------------------------------------------------------------------

	renderer.position_changed = function(new_game_flag) {

		this.position_change_time = performance.now();

		this.searchmoves = [];
		this.hoverdraw_div = -1;
		this.position_changed_clear_info_handler(new_game_flag);
		this.escape();

		this.go_or_halt(new_game_flag);

		this.draw();
		this.movelist_handler.draw(this.node);
		fenbox.value = this.node.get_board().fen(true);

		if (new_game_flag) {
			let title = "Nibbler";
			let root = this.node.get_root();
			if (root.tags && root.tags.White && root.tags.White !== "White" && root.tags.Black && root.tags.Black !== "Black") {
				title += `: ${root.tags.White} - ${root.tags.Black}`;
			}
			ipcRenderer.send("set_title", title);
		}
	};

	renderer.position_changed_clear_info_handler = function(new_game_flag) {

		// The position has changed. Maybe the new position is contained within a PV
		// of the old info table. We want to clear the info table, but preserving the
		// relevant part of the PV, and evals, if available.

		if (new_game_flag || Object.keys(this.info_handler.table).length === 0) {			// Fail
			this.info_handler.clear(this.node.get_board());
			return;
		}

		if (config.versus === "w" || config.versus === "b") {
			if (this.leela_should_go() === false) {											// Fail (conceal)
				this.info_handler.clear(this.node.get_board());
				return;
			}
		}

		// First, find what ancestor (if any) has the old position...

		let node = this.node;
		let moves = [];
		let found = false;

		while (node.parent) {
			moves.push(node.move);
			if (node.parent.get_board() === this.info_handler.board) {
				found = true;
				break;
			}
			node = node.parent;
		}

		if (found === false) {																// Fail
			this.info_handler.clear(this.node.get_board());
			return;
		}

		moves.reverse();

		// moves is now the sequence of moves that gets us from 
		// the info_handler board to our board.

		let oldinfo = this.info_handler.table[moves[0]];

		if (!oldinfo) {																		// Fail
			this.info_handler.clear(this.node.get_board());
			return;
		}

		if (Array.isArray(oldinfo.pv) === false || oldinfo.pv.length <= moves.length) {		// Fail
			this.info_handler.clear(this.node.get_board());
			return;
		}

		let pv = Array.from(oldinfo.pv);

		// Find out if the oldinfo's PV matches our moves.

		for (let n = 0; n < moves.length; n++) {
			if (pv[n] !== moves[n]) {														// Fail
				this.info_handler.clear(this.node.get_board());
				return;
			}
		}

		// So, everything matches and we can use the PV...

		this.info_handler.clear(this.node.get_board());

		let nextmove = pv[moves.length];
		pv = pv.slice(moves.length);

		this.info_handler.table[nextmove] = new_info(this.node.get_board(), nextmove);
		this.info_handler.table[nextmove].pv = pv;
		this.info_handler.table[nextmove].q = oldinfo.q;
		this.info_handler.table[nextmove].cp = oldinfo.cp;
		this.info_handler.table[nextmove].multipv = 1;

		// Flip our evals if the colour changes...

		if (oldinfo.board.active !== this.node.get_board().active) {
			if (typeof this.info_handler.table[nextmove].q === "number") {
				this.info_handler.table[nextmove].q *= -1;
			}
			if (typeof this.info_handler.table[nextmove].cp === "number") {
				this.info_handler.table[nextmove].cp *= -1;
			}
		}
	};

	renderer.set_versus = function(s) {						// config.versus should not be directly set, call this function instead.
		config.versus = typeof s === "string" ? s : "";
		this.go_or_halt();
	};

	renderer.move = function(s) {							// It is safe to call this with illegal moves.

		if (typeof s !== "string") {
			console.log(`renderer.move(${s}) - bad argument`);
			return;
		}

		let board = this.node.get_board();
		let source = Point(s.slice(0, 2));

		// First deal with old-school castling in Standard Chess...

		if (s === "e1g1" && board.state[4][7] === "K" && board.castling.includes("G") === false) {
			s  =  "e1h1";
		}
		if (s === "e1c1" && board.state[4][7] === "K" && board.castling.includes("C") === false) {
			s  =  "e1a1";
		}
		if (s === "e8g8" && board.state[4][0] === "k" && board.castling.includes("g") === false) {
			s  =  "e8h8";
		}
		if (s === "e8c8" && board.state[4][0] === "k" && board.castling.includes("c") === false) {
			s  =  "e8a8";
		}

		// If a promotion character is required and not present, show the promotion chooser and return
		// without committing to anything.

		if (s.length === 4) {
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
		if (typeof n === "number" && n >= 0 && n < info_list.length) {
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

	renderer.delete_other_lines = function() {
		this.node.delete_other_lines();
		this.movelist_handler.draw(this.node);
	};

	renderer.delete_node = function() {

		if (!this.node.parent) {
			return;
		}

		let parent = this.node.parent;
		this.node.detach();
		this.node = parent;

		this.position_changed();
	};

	renderer.delete_children = function() {
		for (let child of this.node.children) {
			child.detach();
		}
		this.movelist_handler.draw(this.node);
	};

	renderer.delete_siblings = function() {

		if (!this.node.parent) {
			return;
		}

		for (let sibling of this.node.parent.children) {
			if (sibling !== this.node) {
				sibling.detach();
			}
		}
		
		this.movelist_handler.draw(this.node);
	};

	renderer.load_from_fenbox = function(s) {

		s = s.trim();

		if (s === this.node.get_board().fen(true)) {
			return;
		}

		let abnormal = false;

		// Allow loading a Chess 960 position by giving its ID:

		if (s.length <= 3) {
			let n = Number.parseInt(s, 10);
			if (Number.isNaN(n) === false) {
				s = c960_fen(n);
				abnormal = true;
			}
		}

		// Allow loading a fruity start position by giving the pieces:

		if (s.length === 8) {
			let ok = true;
			for (let c of s) {
				if (["K", "k", "Q", "q", "R", "r", "B", "b", "N", "n"].includes(c) === false) {
					ok = false;
					break;
				}
			}
			if (ok) {
				s = `${s.toLowerCase()}/pppppppp/8/8/8/8/PPPPPPPP/${s.toUpperCase()} w KQkq - 0 1`;
				abnormal = true;
			}
		}

		this.load_fen(s, abnormal);
	};

	renderer.load_fen = function(s, abnormal) {

		let newpos;

		try {

			newpos = LoadFEN(s);

			// If the FEN loader thought it looked like normal chess, we must
			// override it if the caller passed the abnormal flag. Note that
			// it is never permissible to go in the opposite direction... if
			// the loader thought it was abnormal, we never say it's normal.

			if (abnormal) {
				newpos.normalchess = false;
			}

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

	renderer.new_960 = function(n) {
		if (n === undefined) {
			n = RandInt(0, 960);
		}
		this.load_fen(c960_fen(n), true);
	};

	renderer.infobox_to_clipboard = function() {
		let s = infobox.innerText;
		s = ReplaceAll(s, `${config.focus_on_text} `, "");
		s = ReplaceAll(s, `${config.focus_off_text} `, "");
		clipboard.writeText(statusbox.innerText + "\n\n" + s);
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
		let buf;
		try {
			buf = fs.readFileSync(filename);
		} catch (err) {
			alert(err);
			return;
		}
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
				padding = padding.slice(0, -6);
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
		let n = EventPathN(event, "chooser_");
		if (typeof n !== "number") {
			return;
		}
		if (this.pgn_choices && n >= 0 && n < this.pgn_choices.length) {
			this.load_pgn_object(this.pgn_choices[n]);
		}
	};

	renderer.validate_pgn = function(filename) {
		
		let buf;
		try {
			buf = fs.readFileSync(filename);		// i.e. binary buffer object
		} catch (err) {
			alert(err);
			return;
		}

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

		debug.receive = debug.receive ? debug.receive + 1 : 1;

		if (s.startsWith("info")) {

			if (this.leela_position === this.node.get_board()) {		// Note leela_position is a misleading name - it's the last position we
				this.info_handler.receive(s, this.node.get_board());	// sent, but Leela could be sending info about the previous position.
			}															// So the above condition doesn't prove the info is current.

		} else if (s.startsWith("error")) {

			// If this comes at the start, we want to display it in the infobox, but if we're already
			// drawing the infobox for real, we'll need to flash it up in the status box instead...

			if (this.info_handler.ever_received_info) {
				SetSpecialMessage(s);
			}
			this.info_handler.err_receive(s);

		} else if (s.startsWith("id name")) {

			for (let n = 10; n < messages.min_version; n++) {
				if (s.includes(`v0.${n}`)) {
					this.info_handler.err_receive("");
					this.info_handler.err_receive(`<span class="blue">${messages.obsolete_leela}</span>`);
					this.info_handler.err_receive("");
				}
			}

		} else if (s.startsWith("bestmove") && config.autoplay && config.versus === this.node.get_board().active) {

			// When in autoplay mode, use "bestmove" to detect that analysis is finished. There are
			// synchronisation worries here, though it seems the isready / readyok system is good enough.

			if (this.leela_position === this.node.get_board()) {		// See notes on leela_position above.
				let tokens = s.split(" ");
				this.move(tokens[1]);
			}
		}

		debug.receive -= 1;
	};

	renderer.err_receive = function(s) {

		// If Leela announces it's using BLAS, adjust some UCI settings that can drastically improve performance.
		// This is pretty crude.

		if (config.options.MaxPrefetch === undefined && config.options.MinibatchSize === undefined && s.startsWith("Creating backend [blas]")) {
			this.engine.setoption("MaxPrefetch", 0);
			this.engine.setoption("MinibatchSize", 8);
			this.info_handler.err_receive(s);
			this.info_handler.err_receive(`<span class="blue">${messages.settings_for_blas}</span>`);	// Announces [MaxPrefetch = 0, MinibatchSize = 8]
			return;
		}

		this.info_handler.err_receive(s);
	};

	// The go and halt methods should generally not be called directly.

	renderer.go_or_halt = function(new_game_flag) {
		if (this.leela_should_go()) {
			this.__go(new_game_flag);								
		} else {
			this.__halt(new_game_flag);
		}
	};

	renderer.__halt = function(new_game_flag) {		// "isready" is not needed. If changing position, invalid data will be discarded by renderer.receive().
		if (this.leela_maybe_running) {
			this.engine.send("stop");		
			this.leela_maybe_running = false;
		}
		if (new_game_flag) {
			this.engine.send("ucinewgame");			// Shouldn't be sent when engine is running.
		}
	};

	renderer.__go = function(new_game_flag) {

		this.validate_searchmoves();				// Leela can crash on illegal searchmoves.
		this.hide_pgn_chooser();

		if (this.leela_maybe_running) {
			this.engine.send("stop");
		}

		if (new_game_flag) {
			this.engine.send("ucinewgame");			// Shouldn't be sent when engine is running.
		}

		let start_fen = this.node.get_root().get_board().fen(false);	// Send castling in AHah format.
		let setup = `fen ${start_fen}`;

		// Leela seems to time "readyok" correctly after "position" commands.
		// After sending "isready" we'll ignore Leela output until "readyok" comes.

		this.engine.send(`position ${setup} moves ${this.node.history().join(" ")}`);
		this.engine.send("isready");

		let s;

		if (typeof config.search_nodes !== "number" || config.search_nodes < 1) {
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

		if (!config.searchmoves_buttons) {
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
		this.info_handler.clear(this.node.get_board());
		this.go_or_halt(true);
	};

	renderer.send_custom = function(name, val) {
		this.__halt();
		SetSpecialMessage(this.engine.setoption(name, val), "blue");
		this.go_or_halt();
	};

	renderer.set_threads = function(val) {
		this.__halt();
		config.options.Threads = val;
		config_io.save(config);
		this.engine.setoption("Threads", val);
		this.go_or_halt();
	};

	renderer.set_node_limit = function(val) {
		config.search_nodes = val;
		config_io.save(config);
		this.go_or_halt();
	};

	renderer.switch_weights = function(filename) {
		this.__halt();
		this.info_handler.stderr_log = "";						// Avoids having confusing stale messages.
		config.options.WeightsFile = filename;
		config_io.save(config);
		this.engine.setoption("WeightsFile", filename);
		this.go_or_halt();
	};

	renderer.switch_engine = function(filename) {
		this.set_versus("");
		config.path = filename;
		config_io.save(config);
		this.engine_start();
	};

	renderer.switch_backend = function(s) {
		this.__halt();
		config.options.Backend = s;
		config_io.save(config);
		this.engine.setoption("Backend", s);
		this.go_or_halt();
	};

	renderer.engine_start = function() {

		if (this.engine.exe) {				// We already have an engine connection (possibly non-functioning, but still...)
			this.engine.shutdown();
			this.engine = NewEngine();
		}

		this.info_handler.clear(this.node.get_board());
		this.info_handler.reset_engine_info();

		if (typeof config.path !== "string" || fs.existsSync(config.path) === false) {

			if (!config.failure) {			// Only show the following if there isn't a bigger problem...
				this.err_receive(`<span class="blue">${messages.engine_not_present}</span>`);
				this.err_receive("");
			}
			return;
		}

		this.engine.setup(this.receive.bind(this), this.err_receive.bind(this));

		this.engine.send("uci");
		for (let key of Object.keys(config.options)) {
			this.engine.setoption(key, config.options[key]);
		}
		this.engine.setoption("VerboseMoveStats", true);			// Required for LogLiveStats to work.
		this.engine.setoption("LogLiveStats", true);				// "Secret" Lc0 command.
		this.engine.setoption("MultiPV", 500);
		this.engine.setoption("SmartPruningFactor", 0);
		this.engine.setoption("ScoreType", "centipawn");			// The default, but the user can't be allowed to override this.
		this.engine.setoption("UCI_ShowWDL", true);
		this.engine.setoption("UCI_Chess960", true);				// We always use Chess 960 mode now, for consistency.
		this.engine.send("ucinewgame");
	};

	// --------------------------------------------------------------------------------------------
	// Settings etc...

	renderer.toggle = function(option) {

		// Cases with their own handler...

		if (option === "flip") {
			this.toggle_flip();
			return;
		}

		// Normal cases...

		config[option] = !config[option];
		config_io.save(config);

		this.info_handler.must_draw_infobox();

		// Cases that have additional actions after...

		if (option === "searchmoves_buttons") {
			if (!config.searchmoves_buttons) {		// We turned it off.
				this.searchmoves = [];
				this.go_or_halt();					// If running, we resend the engine the new "go" command without searchmoves.
			}
		}

		if (option === "autoplay") {
			if (config.autoplay) {					// We turned it on.
				this.go_or_halt();					// Since autoplay requires a "bestmove" message, give the engine a chance to send one.
			}
		}
	};

	renderer.toggle_flip = function() {				// config.flip should not be directly set, call this function instead.

		config.flip = !config.flip;

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 4; y++) {

				let first = document.getElementById(`overlay_${S(x, y)}`);
				let second = document.getElementById(`overlay_${S(7 - x, 7 - y)}`);
				SwapElements(first, second);

				first = document.getElementById(`underlay_${S(x, y)}`);
				second = document.getElementById(`underlay_${S(7 - x, 7 - y)}`);
				SwapElements(first, second);
			}
		}

		this.draw();								// For the canvas stuff.
	};

	renderer.invert_searchmoves = function() {

		if (!config.searchmoves_buttons) {
			return;
		}

		// It's no disaster if the result is wrong somehow, because
		// searchmoves are validated before being sent to Leela.

		let moveset = Object.create(null);

		for (let move of Object.keys(this.info_handler.table)) {
			moveset[move] = true;
		}

		for (let move of this.searchmoves) {
			delete moveset[move];
		}

		this.searchmoves = Object.keys(moveset);
		this.go_or_halt();
	};

	renderer.clear_searchmoves = function() {
		this.searchmoves = [];
		this.go_or_halt();
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

	renderer.console = function(...args) {
		console.log(...args);
	};

	renderer.set_info_font_size = function(n) {

		// While this should probably set the statusbox font size as well,
		// this would cause a need to recalculate infobox.style.height as
		// well as causing other issues if the statusbox gets wide.

		infobox.style["font-size"] = n.toString() + "px";
		config.info_font_size = n;
		config_io.save(config);
	};

	renderer.set_pgn_font_size = function(n) {
		movelist.style["font-size"] = n.toString() + "px";
		fenbox.style["font-size"] = n.toString() + "px";
		config.pgn_font_size = n;
		config.fen_font_size = n;
		config_io.save(config);
	};

	renderer.small_arrows = function() {
		config.arrow_width = 8;
		config.arrowhead_radius = 12;
		config.board_font = "18px Arial";
		config_io.save(config);
	};

	renderer.medium_arrows = function() {
		config.arrow_width = 12;
		config.arrowhead_radius = 18;
		config.board_font = "24px Arial";
		config_io.save(config);
	};

	renderer.large_arrows = function() {
		config.arrow_width = 16;
		config.arrowhead_radius = 24;
		config.board_font = "32px Arial";
		config_io.save(config);
	};

	renderer.giant_arrows = function() {
		config.arrow_width = 24;
		config.arrowhead_radius = 32;
		config.board_font = "40px Arial";
		config_io.save(config);
	};

	renderer.set_board_size = function(sz) {

		// This assumes everything already exists.
		// Derived from the longer version in start.js, which it does not replace.
		// Can be called without sz to simply recalculate everything and save (but this flickers).

		if (sz) {
			config.square_size = Math.floor(sz / 8);
			config.board_size = config.square_size * 8;
		}
		config_io.save(config);

		boardfriends.width = canvas.width = boardsquares.width = config.board_size;
		boardfriends.height = canvas.height = boardsquares.height = config.board_size;

		boardfriends.style.left = canvas.style.left = boardsquares.offsetLeft.toString() + "px";
		boardfriends.style.top = canvas.style.top = boardsquares.offsetTop.toString() + "px";

		for (let y = 0; y < 8; y++) {
			for (let x = 0; x < 8; x++) {
				let td1 = document.getElementById("underlay_" + S(x, y));
				let td2 = document.getElementById("overlay_" + S(x, y));
				td1.width = td2.width = config.square_size;
				td1.height = td2.height = config.square_size;
			}
		}

		let infobox_top = infobox.getBoundingClientRect().top;
		let canvas_bottom = canvas.getBoundingClientRect().bottom;
		infobox.style.height = (canvas_bottom - infobox_top).toString() + "px";

		promotiontable.style.left = (boardsquares.offsetLeft + config.square_size * 2).toString() + "px";
		promotiontable.style.top = (boardsquares.offsetTop + config.square_size * 3.5).toString() + "px";
		promotiontable.style["background-color"] = config.active_square;

		this.draw();
	};

	renderer.save_window_size = function() {
		config.width = window.innerWidth;
		config.height = window.innerHeight;
		config_io.save(config);
	};

	renderer.fire_gc = function() {

		if (!global || !global.gc) {
			alert("Unable.");
			return;
		}

		alert("Firing GC in 5 seconds.");
		setTimeout(global.gc, 5000);
	};

	renderer.save_config = function() {			// Just for the dev menu - everything else can just call config_io.save(config) directly.
		config_io.save(config);
	};

	// --------------------------------------------------------------------------------------------
	// Clicks, drops, mouse stuff...

	renderer.set_active_square = function(new_point) {

		// We do things this way so it's snappy and responsive. We could do it
		// in the canvas instead, but then we'd need a whole canvas redraw
		// every time it changes (or accept the lag). Meh.

		let old_point = this.active_square;

		if (old_point && old_point !== Point(null)) {
			let td = document.getElementById("underlay_" + old_point.s);
			td.style["background-color"] = (old_point.x + old_point.y) % 2 === 0 ? config.light_square : config.dark_square;
		}

		this.active_square = null;

		if (new_point && new_point !== Point(null)) {
			let td = document.getElementById("underlay_" + new_point.s);
			td.style["background-color"] = config.active_square;
			this.active_square = new_point;
		}
	};

	renderer.boardfriends_click = function(event) {

		let s = EventPathString(event, "overlay_");
		let p = Point(s);
		
		if (p === Point(null)) {
			return;
		}

		this.hide_promotiontable();		// Just in case it's up.

		let ocm = this.info_handler.one_click_moves[p.x][p.y];
		let board = this.node.get_board();

		if (!this.active_square && ocm && board.colour(p) !== board.active) {		// Note that we test colour difference
			this.set_active_square(null);											// to disallow castling moves from OCM
			this.move(ocm);															// since the dest is the rook (which
			return;																	// the user might want to click on.)
		}

		if (this.active_square) {
			let move = this.active_square.s + p.s;		// e.g. "e2e4" - note promotion char is handled by renderer.move()
			this.set_active_square(null);
			this.move(move);
			return;
		}

		if (board.active === "w" && board.is_white(p)) {
			this.set_active_square(p);
		}
		if (board.active === "b" && board.is_black(p)) {
			this.set_active_square(p);
		}
	};

	renderer.infobox_click = function(event) {

		let moves = this.info_handler.moves_from_click(event);

		if (!moves || moves.length === 0) {				// We do assume length > 0 below.
			this.maybe_searchmove_click(event);
			return;
		}

		let illegal_reason = this.node.get_board().sequence_illegal(moves);
		if (illegal_reason !== "") {
			console.log("infobox_click(): " + illegal_reason);
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

			let sl = info.stats_list(
				{
					ev: config.sam_ev,
					n: config.sam_n,
					n_abs: config.sam_n_abs,
					of_n: config.sam_of_n,
					wdl: config.sam_wdl,
					p: config.sam_p,
					v: config.sam_v,
					q: config.sam_q,
					d: config.sam_d,
					u: config.sam_u,
					q_plus_u: config.sam_q_plus_u,
				},
				this.info_handler.nodes);

			if (sl.length > 0) {
				stats_node.stats = sl.join(", ");
			}
		}

		this.movelist_handler.draw(this.node);				// Draw the tree with the current node (this.node) as highlight.
		this.movelist_handler.redraw_node(stats_node);		// Redraw the stats node, which might not have been drawn (if draw was lazy).
	};

	renderer.maybe_searchmove_click = function(event) {

		let sm = this.info_handler.searchmove_from_click(event);

		if (!sm) {
			return;
		}

		if (this.searchmoves.includes(sm)) {
			this.searchmoves = this.searchmoves.filter(move => move !== sm);
		} else {
			this.searchmoves.push(sm);
		}

		this.go_or_halt();									// If we're running, send a new go message with the updated searchmoves.
	};

	renderer.movelist_click = function(event) {

		let node = this.movelist_handler.node_from_click(event);

		if (!node || node.get_root() !== this.node.get_root()) {
			return;
		}

		if (node !== this.node) {
			this.node = node;
			this.position_changed();
		}
	};

	renderer.show_promotiontable = function(partial_move) {

		promotiontable.innerHTML = "";

		let tr = document.createElement("tr");
		promotiontable.appendChild(tr);

		let pieces = this.node.get_board().active === "w" ? ["Q", "R", "B", "N"] : ["q", "r", "b", "n"];

		for (let piece of pieces) {

			let td = document.createElement("td");
			td.width = config.square_size;
			td.height = config.square_size;
			td.style["background-image"] = images[piece].string_for_bg_style;
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

	renderer.handle_drop = function(event) {

		// Note to self - examining the event in the console can be misleading
		// because the object seems to get changed after it's finished firing
		// or something.

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

			let path = event.path || (event.composedPath && event.composedPath());

			if (path) {
				for (let item of path) {
					if (typeof item.id === "string" && item.id.startsWith("overlay_")) {
						dest = Point(item.id.slice(8, 10));
						break;
					}
				}
			}

			if (source !== Point(null) && dest !== Point(null)) {
				this.move(source.s + dest.s);
			}

			return;
		}
	};

	renderer.mouse_point = function() {
		let overlist = document.querySelectorAll(":hover");
		for (let item of overlist) {
			if (typeof item.id === "string" && item.id.startsWith("overlay_")) {
				let p = Point(item.id.slice(8));
				if (p !== Point(null)) {
					return p;
				} else {
					return null;
				}
			}
		}
		return null;
	};

	// --------------------------------------------------------------------------------------------
	// General draw code...

	renderer.draw_friendlies_in_table = function() {

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
					td.style["background-image"] = images[piece_to_draw].string_for_bg_style;
					td.style["background-size"] = "contain";
					td.draggable = true;
				}
			}
		}
	};

	renderer.draw_move_in_canvas = function() {

		if (typeof config.move_colour_alpha !== "number" || config.move_colour_alpha <= 0) {
			return;
		}

		let move = this.node.move;

		if (typeof move !== "string") {
			return;
		}

		let source = Point(move.slice(0, 2));
		let dest = Point(move.slice(2, 4));

		if (!source || source === Point(null) || !dest || dest === Point(null)) {
			return;
		}

		context.fillStyle = config.move_colour;
		context.globalAlpha = config.move_colour_alpha;

		let cc = CanvasCoords(source.x, source.y);
		context.fillRect(cc.x1, cc.y1, config.square_size, config.square_size);

		cc = CanvasCoords(dest.x, dest.y);
		context.fillRect(cc.x1, cc.y1, config.square_size, config.square_size);

		context.globalAlpha = 1;
	};

	renderer.draw_enemies_in_canvas = function() {

		let board = this.node.get_board();

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {

				if (board.state[x][y] === "" || board.colour(Point(x, y)) === board.active) {
					continue;
				}

				let piece = board.state[x][y];
				let cc = CanvasCoords(x, y);
				context.drawImage(images[piece], cc.x1, cc.y1, config.square_size, config.square_size);
			}
		}
	};

	renderer.hoverdraw = function() {

		if (!config.hover_draw) {
			return false;
		}

		if (performance.now() - this.position_change_time < 1000) {
			return false;
		}

		let overlist = document.querySelectorAll(":hover");

		let div_index = null;

		for (let item of overlist) {
			if (typeof item.id === "string" && item.id.startsWith("infoline_")) {
				div_index = parseInt(item.id.slice("infoline_".length), 10);
				break;
			}
		}

		if (typeof div_index !== "number" || Number.isNaN(div_index)) {
			return false;
		}

		let info = this.info_handler.sorted()[div_index];			// Possibly undefined

		if (!info || Array.isArray(info.pv) === false || info.pv.length === 0) {
			return false;
		}

		if (config.hover_method === 0) {
			return this.hoverdraw_animate(div_index, info);			// Sets this.hoverdraw_div
		} else if (config.hover_method === 1) {
			return this.hoverdraw_single(div_index, overlist);		// Sets this.hoverdraw_div
		} else {
			return false;											// Caller must set this.hoverdraw_div to -1
		}
	};

	renderer.hoverdraw_animate = function(div_index, info) {

		// If the user is hovering over an unexpected div index in the infobox, reset depth...

		if (div_index !== this.hoverdraw_div) {
			this.hoverdraw_div = div_index;
			this.hoverdraw_depth = 0;
		}

		// Sometimes increase depth...

		if (this.tick % config.animate_delay_multiplier === 0) {
			this.hoverdraw_depth++;
		}

		return this.draw_fantasy_from_moves(info.pv.slice(0, this.hoverdraw_depth));	// Relies on slice() being safe if depth > length
	};

	renderer.hoverdraw_single = function(div_index, overlist) {

		this.hoverdraw_div = div_index;

		let hover_item = null;

		for (let item of overlist) {
			if (typeof item.id === "string" && item.id.startsWith("infobox_")) {
				hover_item = item;
				break;
			}
		}

		if (!hover_item) {
			return false;
		}

		let moves = this.info_handler.moves_from_click_n(parseInt(hover_item.id.slice("infobox_".length), 10));

		if (Array.isArray(moves) === false || moves.length === 0) {
			return false;
		}

		return this.draw_fantasy_from_moves(moves);
	};

	renderer.draw_fantasy_from_moves = function(moves) {

		// Don't assume moves is an array of legal moves, or even an array.

		if (Array.isArray(moves) === false) {
			return false;
		}

		let board = this.node.get_board();

		for (let move of moves) {
			let illegal_reason = board.illegal(move);
			if (illegal_reason !== "") {
				return false;
			}
			board = board.move(move);
		}

		this.draw_fantasy(board);
		return true;
	};

	renderer.draw_fantasy = function(board) {

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {

				context.fillStyle = (x + y) % 2 === 0 ? config.light_square : config.dark_square;

				let cc = CanvasCoords(x, y);
				context.fillRect(cc.x1, cc.y1, config.square_size, config.square_size);

				if (board.state[x][y] === "") {
					continue;
				}

				let piece = board.state[x][y];
				context.drawImage(images[piece], cc.x1, cc.y1, config.square_size, config.square_size);
			}
		}
	};

	renderer.draw = function() {

		debug.draw = debug.draw ? debug.draw + 1 : 1;

		// We do the :hover reaction first. This way, we are detecting hover based on the previous cycle's state.
		// This should prevent the sort of flicker that can occur if we try to detect hover based on changes we
		// just made (i.e. if we drew then detected hover instantly).

		context.clearRect(0, 0, canvas.width, canvas.height);
		let did_hoverdraw = this.hoverdraw();

		if (did_hoverdraw) {
			boardfriends.style.display = "none";
			canvas.style.outline = "2px dashed #6cccee";
		} else {
			this.hoverdraw_div = -1;
			boardfriends.style.display = "block";
			canvas.style.outline = "none";
			this.draw_move_in_canvas();
			this.draw_enemies_in_canvas();
			this.info_handler.draw_arrows();
			this.draw_friendlies_in_table();
		}

		this.info_handler.draw_infobox(		// The info handler needs a bit more state than I'd like, but what can you do.
			this.mouse_point(),
			this.active_square,
			this.leela_maybe_running,
			this.node.get_board().active,
			this.searchmoves,
			this.hoverdraw_div,
			Math.max(this.engine.readyok_required, this.engine.bestmove_required));

		debug.draw -= 1;
	};

	renderer.spin = function() {
		this.tick++;
		this.draw();
		if (config.versus !== "" && Math.max(this.engine.readyok_required, this.engine.bestmove_required) > 10) {
			this.set_versus("");		// Stop the engine if we get too far out of sync. See issue #57.
		}
		setTimeout(this.spin.bind(this), config.update_delay);
	};

	return renderer;
}
