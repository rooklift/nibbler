"use strict";

function NewRenderer() {

	let renderer = Object.create(null);

	renderer.engine = NewEngine();								// Still needs its setup() called.
	renderer.tree = NewTreeHandler();
	renderer.grapher = NewGrapher();
	renderer.info_handler = NewInfoHandler();

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
	renderer.nogo_reason = null;								// Whether we declined to send "go" due to stalemate / checkmate.
	renderer.leela_position = null;								// The position we last sent to Leela.
	renderer.searchmoves = [];									// Moves that we're compelling Leela to search.

	// We use various and multiple means to ensure that we are actually synced up with Lc0 when
	// interpreting Lc0 output. Regardless, we also don't trust moves to be legal.

	// --------------------------------------------------------------------------------------------

	renderer.position_changed = function(new_game_flag, maybe_stop_versus) {

		this.position_change_time = performance.now();

		// maybe_stop_versus is for cases where auto-played moves would be surprising to the
		// user. Note that it's OK to directly set config.versus here because we're about to
		// call go_or_halt().

		if (maybe_stop_versus) {
			if (config.versus.length === 1 || (config.versus === "wb" && config.autoplay)) {
				if (this.node_limit()) {
					config.versus = "";
					config.autoplay = 0;
				}
			}
		}

		this.searchmoves = [];
		this.hoverdraw_div = -1;
		this.escape();

		this.go_or_halt(new_game_flag);

		this.draw();
		fenbox.value = this.tree.node.board.fen(true);

		if (new_game_flag) {
			let title = "Nibbler";
			let root = this.tree.root;
			if (root.tags && root.tags.White && root.tags.White !== "White" && root.tags.Black && root.tags.Black !== "Black") {
				title += `: ${root.tags.White} - ${root.tags.Black}`;
			}
			ipcRenderer.send("set_title", title);
		}
	};

	renderer.set_versus = function(s) {				// config.versus should not be directly set, as go_or_halt() needs to be called too.
		if (typeof s !== "string") s = "";
		config.versus = "";
		if (s.includes("W") || s.includes("w")) config.versus += "w";
		if (s.includes("B") || s.includes("b")) config.versus += "b";
		if (config.versus !== "wb") {									// autoplay can only be on if "wb"
			config.autoplay = 0;
		}
		this.go_or_halt();
	};

	renderer.start_autoplay = function(type = 1) {			// Leela evaluating both sides, and moving or going forwards in the PGN.
		config.autoplay = type;
		this.set_versus("wb");
	};

	renderer.move = function(s) {							// It is safe to call this with illegal moves.

		if (typeof s !== "string") {
			console.log(`renderer.move(${s}) - bad argument`);
			return;
		}

		let board = this.tree.node.board;
		let source = Point(s.slice(0, 2));

		if (!source) {
			console.log(`renderer.move(${s}) - invalid source`);
			return;
		}

		// First deal with old-school castling in Standard Chess...

		s = board.c960_castling_converter(s);

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

		this.tree.make_move(s);
		this.position_changed();
		return;
	};

	renderer.random_move = function() {
		let legals = this.tree.node.board.movegen();
		if (legals.length > 0) {
			this.move(RandChoice(legals));
		}
	};

	renderer.node_limit = function() {

		// Given the current state of the config, what is the node limit?

		let cfg_value;

		if (config.versus.length === 1) {
			cfg_value = config.search_nodes_special;
		} else if (config.autoplay) {
			cfg_value = config.search_nodes_special;
		} else {
			cfg_value = config.search_nodes;
		}

		if (typeof cfg_value === "number" && cfg_value >= 1) {
			return cfg_value;
		} else {
			return null;
		}
	};

	renderer.play_info_index = function(n) {
		let info_list = this.info_handler.sorted(this.tree.node);
		if (typeof n === "number" && n >= 0 && n < info_list.length) {
			this.move(info_list[n].move);
		}
	};

	// Note that the various tree.methods() return whether or not the current node changed.

	renderer.prev = function() {
		if (this.tree.prev()) {
			this.position_changed(false, true);
		}
	};

	renderer.next = function() {
		if (this.tree.next()) {
			this.position_changed(false, true);
		}
	};

	renderer.goto_root = function() {
		if (this.tree.goto_root()) {
			this.position_changed(false, true);
		}
	};

	renderer.goto_end = function() {
		if (this.tree.goto_end()) {
			this.position_changed(false, true);
		}
	};

	renderer.return_to_main_line = function() {
		if (this.tree.return_to_main_line()) {
			this.position_changed(false, true);
		}
	};

	renderer.delete_node = function() {
		if (this.tree.delete_node()) {
			this.position_changed(false, true);
		}
	};

	renderer.promote_to_main_line = function() {
		this.tree.promote_to_main_line();
	};

	renderer.promote = function() {
		this.tree.promote();
	};

	renderer.delete_other_lines = function() {
		this.tree.delete_other_lines();
	};

	renderer.delete_children = function() {
		this.tree.delete_children();
	};

	renderer.delete_siblings = function() {
		this.tree.delete_siblings();
	};

	renderer.load_from_fenbox = function(s) {

		s = s.trim();

		if (s === this.tree.node.board.fen(true)) {
			return;
		}

		let abnormal = false;

		// Allow loading a Chess 960 position by giving its ID:

		if (s.length <= 3) {
			let n = parseInt(s, 10);
			if (Number.isNaN(n) === false && n < 960) {
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

		let board;

		try {

			board = LoadFEN(s);

			// If the FEN loader thought it looked like normal chess, we must
			// override it if the caller passed the abnormal flag. Note that
			// it is never permissible to go in the opposite direction... if
			// the loader thought it was abnormal, we never say it's normal.

			if (abnormal) {
				board.normalchess = false;
			}

		} catch (err) {
			alert(err);
			return;
		}

		this.tree.replace_tree(NewRoot(board));
		this.position_changed(true, true);
	};

	renderer.new_game = function() {
		this.load_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
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
		PGNToClipboard(this.tree.node);
	};

	renderer.save = function(filename) {
		SavePGN(filename, this.tree.node);
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

		let root_node;

		try {
			root_node = LoadPGNRecord(o);
		} catch (err) {
			alert(err);
			return false;
		}

		this.tree.replace_tree(root_node);
		this.position_changed(true, true);

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
		return config.versus.includes(this.tree.node.board.active);
	};

	renderer.receive = function(s) {

		debug.receive = debug.receive ? debug.receive + 1 : 1;

		if (s.startsWith("info")) {

			if (this.leela_position === this.tree.node.board) {		// Test may fail if we changed position without informing
				this.info_handler.receive(s, this.tree.node);		// Leela - which we commonly do if we're halting Leela.
			}

		} else if (s.startsWith("error")) {

			// If this comes at the start, we want to display it in the infobox, but if we're already
			// drawing the infobox for real, we'll need to flash it up in the status box instead...

			if (this.info_handler.ever_received_info) {
				this.info_handler.set_special_message(s, "red");
			}
			this.info_handler.err_receive(s);

		} else if (s.startsWith("id name")) {

			if (s.includes("Lc0")) {
				for (let n = 10; n < messages.min_version; n++) {
					if (s.includes(`v0.${n}`)) {
						this.info_handler.err_receive("");
						this.info_handler.err_receive(`<span class="blue">${messages.obsolete_leela}</span>`);
						this.info_handler.err_receive("");
					}
				}
			} else {
				this.info_handler.err_receive(s.slice("id name".length).trim());
			}

		} else if (s.startsWith("bestmove")) {

			// When in versus / self-play / auto-eval mode, use "bestmove" to detect that analysis is finished.
			//
			// Note about synchronisation: Any "bestmove" will be ignored by engine.js unless it's the final one due.
			// This means that, in situations where we say "stop" then immediately say "go", the bestmove we get from
			// the "stop" will be ignored. This works well, I think.

			if (this.leela_position === this.tree.node.board) {				// See notes on leela_position above.

				if (config.autoplay || (config.versus === this.tree.node.board.active)) {

					// We need to update our node's graph eval now (while we still can). We used to use
					// the bestmove itself to decide what info to update from, but that causes issues
					// when Temperature is not 0, as the bestmove may not actually be best...

					this.update_node_eval();

					switch (config.autoplay) {

					case 0:									// Versus mode (if config.autoplay === 0 then we got here via config.versus, above)
					case 1:									// Actual self-play

						let tokens = s.split(" ");
						this.move(tokens[1]);
						break;

					case 2:									// "Evaluate line" mode

						if (this.tree.next()) {
							this.position_changed(false, false);
						} else {
							this.set_versus("");
						}
						break;

					}
				}
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
		}

		this.leela_maybe_running = false;
		this.nogo_reason = null;

		if (new_game_flag) {
			this.engine.send("ucinewgame");			// Shouldn't be sent when engine is running.
		}
	};

	renderer.__go = function(new_game_flag) {

		this.validate_searchmoves();				// Leela can crash on illegal searchmoves.
		this.hide_pgn_chooser();

		this.__halt(new_game_flag);

		let board = this.tree.node.board;

		if (this.tree.node.children.length === 0) {
			if (board.no_moves()) {
				if (board.king_in_check()) {
					this.nogo_reason = "Checkmate";
					this.tree.node.eval = board.active === "w" ? 0 : 1;
					return;
				} else {
					this.nogo_reason = "Stalemate";
					this.tree.node.eval = 0.5;
					return;
				}
			}
			if (board.insufficient_material()) {
				this.nogo_reason = "Insufficient Material";
				this.tree.node.eval = 0.5;
				return;
			}
			if (board.halfmove >= 100) {
				this.nogo_reason = "50 Move Rule";
				this.tree.node.eval = 0.5;
				return;
			}
			if (this.tree.node.is_triple_rep()) {
				this.nogo_reason = "Triple Repetition";
				this.tree.node.eval = 0.5;
				return;
			}
		}

		let root_fen = this.tree.root.board.fen(false);
		let setup = `fen ${root_fen}`;

		// Leela seems to time "readyok" correctly after "position" commands.
		// After sending "isready" we'll ignore Leela output until "readyok" comes.

		this.engine.send(`position ${setup} moves ${this.tree.node.history().join(" ")}`);
		this.engine.send("isready");

		let s;

		if (!this.node_limit()) {
			s = "go infinite";
		} else {
			s = `go nodes ${this.node_limit()}`;
		}

		if (this.searchmoves.length > 0) {
			s += " searchmoves";
			for (let move of this.searchmoves) {
				s += " " + move;
			}
		}

		this.engine.send(s);
		this.leela_position = board;
		this.leela_maybe_running = true;
	};

	renderer.validate_searchmoves = function() {

		if (!config.searchmoves_buttons) {
			this.searchmoves = [];
			return;
		}

		let valid_list = [];
		let board = this.tree.node.board;

		for (let move of this.searchmoves) {
			if (board.illegal(move) === "") {
				valid_list.push(move);
			}
		}

		this.searchmoves = valid_list;
	};

	renderer.reset_leela_cache = function() {
		this.tree.node.clear_table();
		this.go_or_halt(true);
	};

	renderer.set_uci_option = function(name, val, save_to_cfg) {
		this.__halt();
		if (save_to_cfg) {
			if (val === null || val === undefined) {
				delete config.options[name];
			} else {
				config.options[name] = val;
			}
			config_io.save(config);
		}
		if (val === null || val === undefined) {
			val = "";
		}
		let sent = this.engine.setoption(name, val);
		this.info_handler.set_special_message(sent, "blue");
		this.go_or_halt();
	};

	renderer.set_uci_option_permanent = function(name, val) {
		this.set_uci_option(name, val, true);
	};

	renderer.switch_weights = function(filename) {
		this.info_handler.stderr_log = "";							// Avoids having confusing stale messages
		this.set_uci_option("WeightsFile", filename, true);
	};

	renderer.set_node_limit = function(val) {
		config.search_nodes = val;
		config_io.save(config);
		this.go_or_halt();
	};

	renderer.set_node_limit_special = function(val) {
		config.search_nodes_special = val;
		config_io.save(config);
		this.go_or_halt();
	};

	renderer.switch_engine = function(filename) {
		this.set_versus("");
		config.path = filename;
		config_io.save(config);
		this.engine_start(config.path, config.args, config.options);
	};

	renderer.engine_start = function(filepath, args, options, send_normal_options = true) {

		if (this.engine.exe) {				// We already have an engine connection (possibly non-functioning, but still...)
			this.engine.shutdown();
			this.engine = NewEngine();
		}

		this.info_handler.reset_engine_info();

		if (typeof filepath !== "string" || fs.existsSync(filepath) === false) {

			if (!config.failure) {			// Only show the following if there isn't a bigger problem...
				this.err_receive(`<span class="blue">${messages.engine_not_present}</span>`);
				this.err_receive("");
			}
			return;
		}

		if (Array.isArray(args) === false) {
			args = [];
		}

		this.engine.setup(filepath, args, this.receive.bind(this), this.err_receive.bind(this));

		if (typeof options !== "object" || options === null) {
			options = {};
		}

		this.engine.send("uci");
		for (let key of Object.keys(options)) {
			this.engine.setoption(key, options[key]);
		}

		this.engine.setoption("UCI_Chess960", true);	// We always use Chess 960 mode now, for consistency.

		if (send_normal_options) {
			for (let key of Object.keys(leela_normal_options)) {
				this.engine.setoption(key, leela_normal_options[key]);
			}
		}
		
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

		for (let move of Object.keys(this.tree.node.table.info)) {
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

	renderer.set_info_font_size = function(n) {
		infobox.style["font-size"] = n.toString() + "px";
		statusbox.style["font-size"] = n.toString() + "px";
		config.info_font_size = n;
		config.status_font_size = n;
		config_io.save(config);
		this.rebuild_sizes();
	};

	renderer.set_graph_height = function(sz) {
		config.graph_height = sz;
		config_io.save(config);
		this.rebuild_sizes();
		this.grapher.draw(this.tree.node, true);
	};

	renderer.set_board_size = function(sz) {
		config.square_size = Math.floor(sz / 8);
		config.board_size = config.square_size * 8;
		config_io.save(config);
		this.rebuild_sizes();
	};

	renderer.rebuild_sizes = function() {

		// This assumes everything already exists.
		// Derived from the longer version in start.js, which it does not replace.
		// Can be called without sz to simply recalculate everything and save (but this flickers).

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

		// Making the heights of the right side divs is something I never figured out with CSS...

		if (config.graph_height <= 0) {
			graphbox.style.display = "none";
		} else {
			graphbox.style.height = config.graph_height.toString() + "px";
			graph.style.height = config.graph_height.toString() + "px";
			graphbox.style.display = "";
		}

		let infobox_top = infobox.getBoundingClientRect().top;
		let canvas_bottom = canvas.getBoundingClientRect().bottom;
		let graph_top = canvas_bottom - (graphbox.getBoundingClientRect().bottom - graphbox.getBoundingClientRect().top);

		let infobox_margin_adjustment = config.graph_height <= 0 ? 0 : 10;		// Bottom margin irrelevant if no graph.
		infobox.style.height = (graph_top - infobox_top - infobox_margin_adjustment).toString() + "px";

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
		} else {
			global.gc();
		}
	};

	renderer.show_sync_status = function() {
		alert(`readyok: ${this.engine.readyok_required}, bestmove: ${this.engine.bestmove_required}`);
	};

	renderer.show_versus_state = function() {
		alert(`versus: "${config.versus}", autoplay: ${config.autoplay}`);
	};

	renderer.log_ram = function() {
		console.log(`RAM after ${Math.floor(performance.now() / 1000)} seconds:`);
		for (let foo of Object.entries(process.memoryUsage())) {
			let type = foo[0] + " ".repeat(12 - foo[0].length);
			let mb = foo[1] / (1024 * 1024);
			let mb_rounded = Math.floor(mb * 1000) / 1000;		// 3 d.p.
			console.log(type, "(MB)", mb_rounded);
		}
	};

	renderer.save_config = function() {			// Just for the dev menu - everything else can just call config_io.save(config) directly.
		config_io.save(config);
	};

	renderer.run_script = function(filename) {
		let buf;
		try {
			buf = fs.readFileSync(filename);
		} catch (err) {
			alert(err);
			return;
		}
		let s = buf.toString();
		let lines = s.split("\n").map(z => z.trim()).filter(z => z !== "");

		this.set_versus("");
		this.engine_start(lines[0], null, null, false);
		for (let line of lines.slice(1)) {
			this.engine.send(line);
		}
	};

	// --------------------------------------------------------------------------------------------
	// Clicks, drops, mouse stuff...

	renderer.set_active_square = function(new_point) {

		// We do things this way so it's snappy and responsive. We could do it
		// in the canvas instead, but then we'd need a whole canvas redraw
		// every time it changes (or accept the lag). Meh.

		let old_point = this.active_square;

		if (old_point) {
			let td = document.getElementById("underlay_" + old_point.s);
			td.style["background-color"] = (old_point.x + old_point.y) % 2 === 0 ? config.light_square : config.dark_square;
		}

		this.active_square = null;

		if (new_point) {
			let td = document.getElementById("underlay_" + new_point.s);
			td.style["background-color"] = config.active_square;
			this.active_square = new_point;
		}
	};

	renderer.boardfriends_click = function(event) {

		let s = EventPathString(event, "overlay_");
		let p = Point(s);
		
		if (!p) {
			return;
		}

		this.hide_promotiontable();		// Just in case it's up.

		let ocm = this.info_handler.one_click_moves[p.x][p.y];
		let board = this.tree.node.board;

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

		let illegal_reason = this.tree.node.board.sequence_illegal(moves);
		if (illegal_reason !== "") {
			console.log("infobox_click(): " + illegal_reason);
			return;
		}

		// Normal version...

		if (!config.serious_analysis_mode) {
			this.tree.make_move_sequence(moves);
			this.position_changed(false, true);
			return;
		}

		// OK, so we're in Serious Analysis Mode (tm). We don't change our place in the tree.
		// But we do save some statistics into the node of the first move made...

		this.tree.add_move_sequence(moves);

		let stats_node = this.tree.get_node_from_move(moves[0]);
		let info = this.tree.node.table.info[moves[0]];		// info for the first move in our clicked line.

		if (info) {

			let sl = info.stats_list(
				{
					ev: config.sam_ev,
					n: config.sam_n,
					n_abs: config.sam_n_abs,
					of_n: config.sam_of_n,
					wdl: config.sam_wdl,
					p: config.sam_p,
					m: config.sam_m,
					v: config.sam_v,
					q: config.sam_q,
					d: config.sam_d,
					u: config.sam_u,
					s: config.sam_s,
				},
				this.tree.node.table.nodes);

			if (sl.length > 0) {
				stats_node.stats = sl.join(", ");
			}
		}

		this.tree.dom_redraw_node(stats_node);
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
		if (this.tree.handle_click(event)) {
			this.position_changed(false, true);
		}
	};

	renderer.winrate_click = function(event) {

		let node = this.grapher.node_from_click(this.tree.node, event);

		if (!node) {
			return;
		}

		if (this.tree.set_node(node)) {
			this.position_changed(false, true);
		}
	};

	renderer.statusbox_click = function(event) {
		let val = EventPathString(event, "gobutton");
		if (val) {
			this.set_versus("wb");
		}
	};

	renderer.show_promotiontable = function(partial_move) {

		promotiontable.innerHTML = "";

		let tr = document.createElement("tr");
		promotiontable.appendChild(tr);

		let pieces = this.tree.node.board.active === "w" ? ["Q", "R", "B", "N"] : ["q", "r", "b", "n"];

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

			let source = Point(text_data.slice(8, 10));		// Possibly null
			let dest = null;

			let path = event.path || (event.composedPath && event.composedPath());

			if (path) {
				for (let item of path) {
					if (typeof item.id === "string" && item.id.startsWith("overlay_")) {
						dest = Point(item.id.slice(8, 10));
						break;
					}
				}
			}

			if (source && dest) {
				this.move(source.s + dest.s);
			}

			return;
		}
	};

	renderer.mouse_point = function() {
		let overlist = document.querySelectorAll(":hover");
		for (let item of overlist) {
			if (typeof item.id === "string" && item.id.startsWith("overlay_")) {
				return Point(item.id.slice(8));		// Possibly null
			}
		}
		return null;
	};

	renderer.dom_test = function() {

		movelist.insertAdjacentHTML("beforeend", `<span> Hello </span>`);

		// let element = document.createElement("span");
		// element.innerHTML = " Hello ";
		// movelist.insertAdjacentElement("beforeend", element);
	};

	// --------------------------------------------------------------------------------------------
	// General draw code...

	renderer.draw_friendlies_in_table = function() {

		let position = this.tree.node.board;

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

		let move = this.tree.node.move;

		if (typeof move !== "string") {
			return;
		}

		let source = Point(move.slice(0, 2));
		let dest = Point(move.slice(2, 4));

		if (!source || !dest) {
			return;
		}

		boardctx.fillStyle = config.move_colour;
		boardctx.globalAlpha = config.move_colour_alpha;

		let cc = CanvasCoords(source.x, source.y);
		boardctx.fillRect(cc.x1, cc.y1, config.square_size, config.square_size);

		cc = CanvasCoords(dest.x, dest.y);
		boardctx.fillRect(cc.x1, cc.y1, config.square_size, config.square_size);

		boardctx.globalAlpha = 1;
	};

	renderer.draw_enemies_in_canvas = function() {

		let board = this.tree.node.board;

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {

				if (board.state[x][y] === "" || board.colour(Point(x, y)) === board.active) {
					continue;
				}

				let piece = board.state[x][y];
				let cc = CanvasCoords(x, y);
				boardctx.drawImage(images[piece], cc.x1, cc.y1, config.square_size, config.square_size);
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

		let info = this.info_handler.sorted(this.tree.node)[div_index];			// Possibly undefined

		if (!info || Array.isArray(info.pv) === false || info.pv.length === 0) {
			return false;
		}

		if (config.hover_method === 0) {
			return this.hoverdraw_animate(div_index, info);			// Sets this.hoverdraw_div
		} else if (config.hover_method === 1 || config.hover_method === 2) {
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

		let moves;

		if (config.hover_method === 1) {
			moves = this.info_handler.moves_from_click_n(parseInt(hover_item.id.slice("infobox_".length), 10));
		} else if (config.hover_method === 2) {
			moves = this.info_handler.entire_pv_from_click_n(parseInt(hover_item.id.slice("infobox_".length), 10));
		}

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

		let board = this.tree.node.board;

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

				boardctx.fillStyle = (x + y) % 2 === 0 ? config.light_square : config.dark_square;

				let cc = CanvasCoords(x, y);
				boardctx.fillRect(cc.x1, cc.y1, config.square_size, config.square_size);

				if (board.state[x][y] === "") {
					continue;
				}

				let piece = board.state[x][y];
				boardctx.drawImage(images[piece], cc.x1, cc.y1, config.square_size, config.square_size);
			}
		}
	};

	renderer.draw = function() {

		debug.draw = debug.draw ? debug.draw + 1 : 1;

		// We do the :hover reaction first. This way, we are detecting hover based on the previous cycle's state.
		// This should prevent the sort of flicker that can occur if we try to detect hover based on changes we
		// just made (i.e. if we drew then detected hover instantly).

		boardctx.clearRect(0, 0, canvas.width, canvas.height);
		let did_hoverdraw = this.hoverdraw();

		let arrow_spotlight_square = config.click_spotlight ? this.active_square : null;

		if (did_hoverdraw) {
			boardfriends.style.display = "none";
			canvas.style.outline = "2px dashed #6cccee";
		} else {
			this.hoverdraw_div = -1;
			boardfriends.style.display = "block";
			canvas.style.outline = "none";
			this.draw_move_in_canvas();
			this.draw_enemies_in_canvas();
			this.info_handler.draw_arrows(this.tree.node, arrow_spotlight_square, null);
			this.draw_friendlies_in_table();
		}

		this.info_handler.draw_statusbox(
			this.tree.node,
			this.nogo_reason,
			this.searchmoves,
			this.engine.ever_received_uciok,
			Math.max(this.engine.readyok_required, this.engine.bestmove_required));

		this.info_handler.draw_infobox(
			this.tree.node,
			this.mouse_point(),
			this.active_square,
			this.tree.node.board.active,
			this.searchmoves,
			this.hoverdraw_div);

		this.grapher.draw(this.tree.node, !config.ugly_graph_performance_hack);

		debug.draw -= 1;
	};

	renderer.spin = function() {
		this.tick++;
		this.draw();
		this.update_node_eval();
		if (config.versus !== "" && Math.max(this.engine.readyok_required, this.engine.bestmove_required) > 10) {
			this.set_versus("");			// Stop the engine if we get too far out of sync. See issue #57.
		}
		setTimeout(this.spin.bind(this), config.update_delay);
	};

	renderer.update_node_eval = function() {
		let info_list = this.info_handler.sorted(this.tree.node);
		if (info_list.length > 0) {
			this.tree.node.update_eval_from_info(info_list[0]);
		}
	};

	return renderer;
}
