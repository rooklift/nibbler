"use strict";

function NewRenderer() {

	let renderer = Object.create(null);

	renderer.engine = NewEngine(renderer);						// Just a dummy object with no exe. Fixed by start.js later.
	renderer.tree = NewTreeHandler();
	renderer.grapher = NewGrapher();
	renderer.info_handler = NewInfoHandler();

	// Various state we have to keep track of...

	renderer.book = null;
	renderer.pgn_choices = null;								// All games found when opening a PGN file.
	renderer.friendly_draws = New2DArray(8, 8, null);			// What pieces are drawn in boardfriends. Used to skip redraws.
	renderer.enemy_draws = New2DArray(8, 8, null);				// What pieces are drawn in boardsquares. Used to skip redraws.
	renderer.dirty_squares = New2DArray(8, 8, null);			// What squares have some coloured background.
	renderer.active_square = null;								// Clicked square.
	renderer.hoverdraw_div = -1;
	renderer.hoverdraw_depth = 0;
	renderer.tick = 0;											// How many draw loops we've been through.
	renderer.position_change_time = performance.now();			// Time of the last position change. Used for cooldown on hover draw.
	renderer.node_to_clean = renderer.tree.node;				// The next node to be cleaned up (done when exiting it).
	renderer.leela_lock_node = null;							// Non-null only when in "analysis_locked" mode.

	// -------------------------------------------------------------------------------------------------------------------------

	renderer.behave = function(reason) {		// reason should be "position" or "behaviour"

		// Called when position changes.
		// Called when behaviour changes.
		//
		// Each branch should do one of the following:
		//
		//		Call __go() to start a new search
		//		Call __halt() to ensure the engine isn't running
		//		Nothing, iff the correct search is already running

		switch (config.behaviour) {

		case "halt":

			this.__halt();
			break;

		case "analysis_free":
		case "auto_analysis":

			// Note that the 2nd part of the condition is needed because changing behaviour can change what node_limit()
			// returns, therefore we might already be running a search for the right node but with the wrong limit.
			// THIS IS TRUE THROUGHOUT THIS FUNCTION.

			if (this.engine.search_desired.node !== this.tree.node || this.engine.search_desired.limit !== this.node_limit()) {
				this.__go(this.tree.node);
			}
			break;

		case "analysis_locked":

			// Moving shouldn't trigger anything, except that re-entering the correct node changes behaviour to halt
			// iff the search is completed.

			if (reason === "position") {

				if (this.tree.node === this.leela_lock_node) {
					if (!this.engine.search_desired.node) {
						this.set_behaviour_direct("halt");
					}
				}

				break;		// No further actions when reason === "position"
			}

			if (this.engine.search_desired.node !== this.leela_lock_node || this.engine.search_desired.limit !== this.node_limit()) {
				this.__go(this.leela_lock_node);
			}
			break;

		case "self_play":
		case "play_white":
		case "play_black":

			if ((config.behaviour === "self_play") ||
				(config.behaviour === "play_white" && this.tree.node.board.active === "w") ||
				(config.behaviour === "play_black" && this.tree.node.board.active === "b")) {

				if (this.book) {

					let moves = this.book[this.tree.node.board.fen(false, true)];

					if (Array.isArray(moves) && moves.length > 0) {

						let move = RandChoice(moves);

						if (this.tree.node.board.illegal(move) === "" && this.tree.node.terminal_reason() === "") {

							this.__halt();
							let correct_node = this.tree.node;
							let correct_behaviour = config.behaviour;

							// Use a setTimeout to prevent recursion (since move() will cause a call to behave())

							setTimeout(() => {
								if (this.tree.node === correct_node && config.behaviour === correct_behaviour) {
									this.move(move);
								}
							}, 0);

							break;
						}
					}
				}

				// If we get here we didn't play a book move...

				if (this.engine.search_desired.node !== this.tree.node || this.engine.search_desired.limit !== this.node_limit()) {
					this.__go(this.tree.node);
				}

			} else {			// Play single colour mode, wrong colour.

				this.__halt();

			}

			break;
		}
	};

	renderer.position_changed = function(new_game_flag, avoid_confusion) {

		// Called right after this.tree.node is changed, meaning we are now drawing a different position.

		this.escape();

		this.hoverdraw_div = -1;
		this.position_change_time = performance.now();
		fenbox.value = this.tree.node.board.fen(true);

		if (new_game_flag) {
			this.node_to_clean = null;
			this.leela_lock_node = null;
			this.set_behaviour("halt");					// Will cause "stop" to be sent.
			this.engine.send("ucinewgame");				// Must happen after "stop" is sent.
			this.send_title();
			if (!this.engine.in_960_mode() && this.tree.node.board.normalchess === false) {
				alert(messages.c960_warning);
			}
		}

		if (this.tree.node.table.already_autopopulated === false) {
			this.tree.node.table.autopopulate(this.tree.node);
		}

		// When entering a position, clear its searchmoves, unless it's the analysis_locked node.

		if (this.leela_lock_node !== this.tree.node) {
			this.tree.node.searchmoves = [];
		}

		// Caller can tell us the change would cause user confusion for some modes...

		if (avoid_confusion) {
			if (["play_white", "play_black", "self_play", "auto_analysis"].includes(config.behaviour)) {
				this.set_behaviour("halt");
			}
		}

		this.maybe_infer_info();						// Before node_exit_cleanup() so that previous ghost info is available when moving forwards.
		this.behave("position");
		this.draw();

		this.node_exit_cleanup();						// This feels like the right time to do this.
		this.node_to_clean = this.tree.node;
	};

	renderer.set_behaviour = function(s) {

		// Don't do anything if behaviour is already correct. But
		// "halt" always triggers a behave() call for safety reasons,
		// and "analysis_locked" needs to check if we're in a new position.

		if (s === config.behaviour) {
			switch (s) {
			case "halt":
				break;					// i.e. do NOT immediately return
			case "analysis_locked":
				if (this.leela_lock_node !== this.tree.node) {
					break;				// i.e. do NOT immediately return
				} else {
					return;
				}
			default:
				return;
			}
		}

		this.set_behaviour_direct(s);
		this.behave("behaviour");
	};

	renderer.set_behaviour_direct = function(s) {
		this.leela_lock_node = (s === "analysis_locked") ? this.tree.node : null;
		config.behaviour = s;
	};

	renderer.handle_search_params_change = function() {

		// If there's already a search desired, we can just let __go() figure out what the new parameters should be.
		// If they match what is already desired then set_search_desired() will ignore the call.

		if (this.engine.search_desired.node) {
			this.__go(this.engine.search_desired.node);
		}

		// If there's no search desired, changing params probably shouldn't start one. As of 1.8.3, when a search
		// completes due to hitting the (normal) node limit, behaviour gets changed back to "halt" in one way or
		// another.

	};

	renderer.play_this_colour = function() {
		if (this.tree.node.board.active === "w") {
			this.set_behaviour("play_white");
		} else {
			this.set_behaviour("play_black");
		}
	};

	// -------------------------------------------------------------------------------------------------------------------------

	renderer.maybe_infer_info = function() {

		// This function creates "ghost" info in the info table when possible and necessary;
		// such info is inferred from ancestral info. It is also deleted upon leaving the node.
		//
		// The whole thing is a bit sketchy, maybe.

		if (config.behaviour === "play_white" || config.behaviour === "play_black") {
			return;
		}

		let node = this.tree.node;

		if (node.terminal_reason()) {
			return;
		}
		if (!node.parent) {
			return;
		}

		for (let info of Object.values(node.table.moveinfo)) {
			if (info.__touched) {
				return;
			}
		}

		// So the current node has no real info.

		let moves = [node.move];
		let ancestor = null;

		let foo = node.parent;

		while (foo) {

			for (let info of Object.values(foo.table.moveinfo)) {
				if (info.__touched) {
					ancestor = foo;
					break;
				}
			}

			if (!ancestor) {
				moves.push(foo.move);
				foo = foo.parent;
			} else {
				break;
			}
		}

		if (!ancestor) {
			return;
		}

		// So we found the closest ancestor with info.

		moves.reverse();

		let oldinfo = ancestor.table.moveinfo[moves[0]];

		if (!oldinfo) {
			return;
		}

		if (Array.isArray(oldinfo.pv) === false || oldinfo.pv.length <= moves.length) {
			return;
		}

		let pv = Array.from(oldinfo.pv);

		for (let n = 0; n < moves.length; n++) {
			if (pv[n] !== moves[n]) {
				return;
			}
		}

		// So, everything matches and we can use the PV...

		let nextmove = pv[moves.length];
		pv = pv.slice(moves.length);

		let new_info = NewInfo(node.board, nextmove);

		new_info.__ghost = true;
		new_info.__touched = true;
		new_info.pv = pv;
		new_info.nice_pv_cache = null;
		new_info.subcycle = 1;		// Crude hack, makes draw_infobox() make other moves gray.
		new_info.q = oldinfo.q;
		new_info.cp = oldinfo.cp;
		new_info.multipv = 1;

		// Flip our evals if the colour changes...

		if (oldinfo.board.active !== node.board.active) {
			if (typeof new_info.q === "number") {
				new_info.q *= -1;
			}
			if (typeof new_info.cp === "number") {
				new_info.cp *= -1;
			}
		}

		node.table.moveinfo[nextmove] = new_info;
	};

	renderer.node_exit_cleanup = function() {

		if (!this.node_to_clean || this.node_to_clean.destroyed) {
			return;
		}

		// Remove ghost info; which is only allowed in the node we're currently looking at...
		// By remove, I mean, replace it with a neutral info object.

		for (let key of Object.keys(this.node_to_clean.table.moveinfo)) {
			if (this.node_to_clean.table.moveinfo[key].__ghost) {
				this.node_to_clean.table.moveinfo[key] = NewInfo(this.node_to_clean.board, key);
			}
		}

	};

	// -------------------------------------------------------------------------------------------------------------------------

	renderer.move = function(s) {							// It is safe to call this with illegal moves.

		if (typeof s !== "string") {
			console.log(`renderer.move(${s}) - bad argument`);
			return false;
		}

		let board = this.tree.node.board;
		let source = Point(s.slice(0, 2));

		if (!source) {
			console.log(`renderer.move(${s}) - invalid source`);
			return false;
		}

		// First deal with old-school castling in Standard Chess...

		s = board.c960_castling_converter(s);

		// If a promotion character is required and not present, show the promotion chooser and return
		// without committing to anything.

		if (s.length === 4) {
			if ((board.piece(source) === "P" && source.y === 1) || (board.piece(source) === "p" && source.y === 6)) {
				let illegal_reason = board.illegal(s + "q");
				if (illegal_reason) {
					console.log(`renderer.move(${s}) - ${illegal_reason}`);
				} else {
					this.show_promotiontable(s);
				}
				return false;
			}
		}

		// The promised legality check...

		let illegal_reason = board.illegal(s);
		if (illegal_reason) {
			console.log(`renderer.move(${s}) - ${illegal_reason}`);
			return false;
		}

		this.tree.make_move(s);
		this.position_changed();
		return true;
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

		switch (config.behaviour) {

		case "play_white":
		case "play_black":
		case "self_play":
		case "auto_analysis":

			cfg_value = config.search_nodes_special;
			break;

		default:

			cfg_value = config.search_nodes;
			break;

		}

		// Should match the system in engine.js.

		if (typeof cfg_value === "number" && cfg_value >= 1) {
			return cfg_value;
		} else {
			return null;
		}
	};

	renderer.play_info_index = function(n) {
		let info_list = SortedMoveInfo(this.tree.node);
		if (typeof n === "number" && n >= 0 && n < info_list.length) {
			if (info_list[n].__touched) {
				this.move(info_list[n].move);
			}
		}
	};

	// Note that the various tree.methods() return whether or not the current node changed.

	renderer.return_to_lock = function() {
		if (config.behaviour === "analysis_locked") {
			if (this.tree.set_node(this.leela_lock_node)) {		// Fool-proof against null / destroyed.
				this.position_changed(false, true);
			}
		}
	};

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

	renderer.previous_sibling = function() {
		if (this.tree.previous_sibling()) {
			this.position_changed(false, true);
		}
	};

	renderer.next_sibling = function() {
		if (this.tree.next_sibling()) {
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
		clipboard.writeText(this.tree.node.board.fen(true) + "\n" + statusbox.innerText + "\n\n" + s);
	};

	// -------------------------------------------------------------------------------------------------------------------------
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
			if (filename === __dirname || filename === ".") {		// Can happen when extra args are passed to main process. Silently return.
				return;
			}
			if (fs.existsSync(filename) === false) {				// Can happen when extra args are passed to main process. Silently return.
				return;
			}
			buf = fs.readFileSync(filename);
		} catch (err) {
			alert(err);
			return;
		}
		console.log(`Loading PGN: ${filename}`);
		this.load_pgn_buffer(buf);
	};

	renderer.load_book = function(filename) {

		this.book = null;

		let buf;
		try {
			buf = fs.readFileSync(filename);
		} catch (err) {
			alert(err);
			this.send_ack_book();
			return;
		}
		console.log(`Loading PGN as book: ${filename}`);

		let new_pgn_choices = PreParsePGN(buf);

		let start_time = performance.now();
		let error_flag = false;

		for (let o of new_pgn_choices) {
			try {
				let root = LoadPGNRecord(o);
				this.book = GenerateBook(root, this.book);
				DestroyTree(root);
			} catch (err) {
				error_flag = true;
			}
		}

		if (error_flag) {
			this.set_special_message("Finished loading book (some errors occurred)", "yellow");
		} else {
			this.set_special_message("Finished loading book", "green");
		}
		console.log(`Book generation took ${(performance.now() - start_time).toFixed(0)} ms.`);
		this.send_ack_book();
	};

	renderer.load_pgn_from_string = function(s) {
		let buf = Buffer.from(s);
		console.log(`Loading PGN from string...`);
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

		let start_time = performance.now();

		let root_node;

		try {
			root_node = LoadPGNRecord(o);
		} catch (err) {
			alert(err);
			return false;
		}

		this.tree.replace_tree(root_node);
		this.position_changed(true, true);

		console.log(`PGN parsing took ${(performance.now() - start_time).toFixed(0)} ms.`);

		return true;
	};

	renderer.show_pgn_chooser = function() {

		if (!this.pgn_choices) {
			alert("No PGN loaded");
			return;
		}

		this.hide_promotiontable();		// Just in case it's up.
		this.set_behaviour("halt");

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
				s = `${padding}${n + 1}. <span class="blue">${p.tags.White || "Unknown"}</span> - ${p.tags.Black || "Unknown"}`;
			} else if (p.tags.Result === "0-1") {
				s = `${padding}${n + 1}. ${p.tags.White || "Unknown"} - <span class="blue">${p.tags.Black || "Unknown"}</span>`;
			} else {
				s = `${padding}${n + 1}. ${p.tags.White || "Unknown"} - ${p.tags.Black || "Unknown"}`;
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

	// -------------------------------------------------------------------------------------------------------------------------
	// Engine stuff...

	renderer.receive_bestmove = function(s, relevant_node) {

		this.update_graph_eval(relevant_node);		// Now's the last chance to update our graph eval for this node.

		switch (config.behaviour) {

		case "self_play":
		case "play_white":
		case "play_black":

			if (relevant_node !== this.tree.node) {
				LogBoth(`(ignored bestmove, relevant_node !== hub.tree.node, config.behaviour was "${config.behaviour}")`);
				this.set_behaviour("halt");
				break;
			}

			let tokens = s.split(" ").filter(z => z !== "");
			let ok = this.move(tokens[1]);

			if (!ok) {
				LogBoth(`BAD BESTMOVE (${tokens[1]}) IN POSITION ${this.tree.node.board.fen(true)}`);
				this.set_special_message(`WARNING! Bad bestmove (${tokens[1]}) received!`, "yellow", 15000);
			} else {
				if (this.tree.node.terminal_reason()) {
					this.set_behaviour("halt");
				}
			}

			break;

		case "auto_analysis":

			if (relevant_node !== this.tree.node) {
				LogBoth(`(ignored bestmove, relevant_node !== hub.tree.node, config.behaviour was "${config.behaviour}")`);
				this.set_behaviour("halt");
				break;
			}

			if (this.tree.next()) {
				this.position_changed(false, false);
			} else {
				this.set_behaviour("halt");
			}

			break;

		case "analysis_free":			// We hit the node limit.

			this.set_behaviour("halt");
			break;

		case "analysis_locked":

			// We hit the node limit. If the node we're looking at isn't the locked node, don't
			// change behaviour. (It will get changed when we enter the locked node.)

			if (this.tree.node === this.leela_lock_node) {
				this.set_behaviour("halt");
			}
			break;

		}
	};

	renderer.receive_misc = function(s) {

		if (s.startsWith("id name")) {

			// Note that we do need to set the leelaish flag on the engine here (rather than relying on the
			// autodetection in info.js) so that hub.set_ab_engine_multipv() works even if we've never received info.

			this.engine.leelaish = false;

			for (let name of config.leelaish_names) {
				if (s.includes(name)) {
					this.engine.leelaish = true;
					break;
				}
			}

			// Pass unknown engines to the error handler to be displayed...

			if (!s.includes("Lc0") && !s.includes("Ceres") && !s.includes("Stockfish")) {
				this.info_handler.err_receive(s.slice("id name".length).trim());
			}

			return;
		}

		if (s.startsWith("uciok")) {
			this.set_behaviour("halt");					// Up till now, set_search_desired() was ignoring our calls.
			this.engine_send_all_options();				// Relies on the engine.leelaish flag being correct.
			this.engine.send("ucinewgame");				// Relies on the engine not running.
			return;
		}

		// Misc messages. Treat ones that aren't valid UCI as errors to be passed along...

		if (!s.startsWith("id") &&
			!s.startsWith("readyok") &&
			!s.startsWith("option") &&
			!s.startsWith("bestmove") &&				// These messages shouldn't reach this function
			!s.startsWith("info")						// These messages shouldn't reach this function
		) {
			this.info_handler.err_receive(s);
		}
	};

	renderer.err_receive = function(s) {

		// Some highlights... this is obviously super-fragile based on the precise strings Leela sends.

		if (s.startsWith("Found configuration file: ")) {
			this.info_handler.err_receive(HighlightString(s, "Found configuration file: ", "blue"));
			return;
		}

		if (s.startsWith("Loading Syzygy tablebases from ")) {
			this.info_handler.err_receive(HighlightString(s, "Loading Syzygy tablebases from ", "blue"));
			return;
		}

		if (s.startsWith("Loading weights file from: ")) {
			this.info_handler.err_receive(HighlightString(s, "Loading weights file from: ", "blue"));
			return;
		}

		if (s.startsWith("Found pb network file: ")) {
			this.info_handler.err_receive(HighlightString(s, "Found pb network file: ", "blue"));
			return;
		}

		this.info_handler.err_receive(s);
	};

	// The go and halt methods should not be called directly.

	renderer.__halt = function() {
		this.engine.set_search_desired(null);
	};

	renderer.__go = function(node) {

		this.hide_pgn_chooser();

		if (!node || node.destroyed || node.terminal_reason()) {
			this.engine.set_search_desired(null);
			return;
		}

		this.engine.set_search_desired(node, this.node_limit(), node.searchmoves);

	};

	renderer.soft_engine_reset = function() {
		this.set_behaviour("halt");					// Will cause "stop" to be sent.
		this.engine.send("ucinewgame");				// Must happen after "stop" is sent.
	};

	renderer.forget_analysis = function() {
		CleanTree(this.tree.root);
		this.tree.node.table.autopopulate(this.tree.node);
		this.set_behaviour("halt");					// Will cause "stop" to be sent.
		this.engine.send("ucinewgame");				// Must happen after "stop" is sent.
		this.engine.suppress_cycle_info = this.info_handler.engine_cycle;			// Ignore further info updates from this cycle.
	};

	renderer.set_ab_engine_multipv = function(val) {
		config.ab_engine_multipv = val;				// This is stored outside the normal options object, it's too special, various things access it.
		config_io.save(config);
		this.set_uci_option("MultiPV", val);		// Gets suppressed for Leelaish engines by suppressed_options_lc0 list.
	};

	renderer.set_uci_option = function(name, val, save_to_cfg) {					// Uses maybe_setoption() to filter unacceptable options
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
		this.halt_if_maybe_setoption_will_succeed(name, val);
		let sent = this.engine.maybe_setoption(name, val);
		this.set_special_message(sent, "blue");
	};

	renderer.set_uci_option_permanent = function(name, val) {
		this.set_uci_option(name, val, true);
	};

	renderer.halt_if_maybe_setoption_will_succeed = function(name, val) {			// Maybe needs a nicer name...
		if (this.engine.maybe_setoption_fail_reason(name, val) === "") {
			this.set_behaviour("halt");
		}
	};

	renderer.toggle_uci_option = function(name, save_to_cfg) {
		this.set_uci_option(name, !config.options[name], save_to_cfg);
	};

	renderer.disable_syzygy = function() {
		delete config.options["SyzygyPath"];
		config_io.save(config);
		this.restart_engine();
	};

	renderer.switch_weights = function(filename) {
		this.info_handler.stderr_log = "";							// Avoids having confusing stale messages
		this.set_uci_option_permanent("WeightsFile", filename);
	};

	renderer.adjust_node_limit = function(direction, special_flag) {

		let cfg_value = special_flag ? config.search_nodes_special : config.search_nodes;

		if (direction > 0) {

			if (typeof cfg_value !== "number" || cfg_value <= 0) {				// Already unlimited
				this.set_node_limit_generic(null, special_flag);
				return;
			}

			for (let i = 0; i < limit_options.length; i++) {
				if (limit_options[i] > cfg_value) {
					this.set_node_limit_generic(limit_options[i], special_flag);
					return;
				}
			}

			this.set_node_limit_generic(null, special_flag);

		} else {

			if (typeof cfg_value !== "number" || cfg_value <= 0) {				// Unlimited; reduce to highest finite option
				this.set_node_limit_generic(limit_options[limit_options.length - 1], special_flag);
				return;
			}

			for (let i = limit_options.length - 1; i >= 0; i--) {
				if (limit_options[i] < cfg_value) {
					this.set_node_limit_generic(limit_options[i], special_flag);
					return;
				}
			}

			this.set_node_limit_generic(1, special_flag);
		}
	};

	renderer.set_node_limit = function(val) {
		this.set_node_limit_generic(val, false);
	};

	renderer.set_node_limit_special = function(val) {
		this.set_node_limit_generic(val, true);
	};

	renderer.set_node_limit_generic = function(val, special_flag) {

		if (typeof val !== "number" || val <= 0) {
			val = null;
		}

		let msg_start = special_flag ? "Special node limit" : "Node limit";
		let ack_type = special_flag ? "ack_special_node_limit" : "ack_node_limit";

		if (val) {
			this.set_special_message(`${msg_start} now ${CommaNum(val)}`, "blue");
		} else {
			this.set_special_message(`${msg_start} removed!`, "blue");
		}

		if (special_flag) {
			config.search_nodes_special = val;
		} else {
			config.search_nodes = val;
		}
		config_io.save(config);
		this.handle_search_params_change();

		if (val) {
			ipcRenderer.send(ack_type, CommaNum(val));
		} else {
			ipcRenderer.send(ack_type, "Unlimited");
		}
	};

	renderer.switch_engine = function(filename) {
		this.set_behaviour("halt");
		config.path = filename;
		config_io.save(config);
		this.engine_start(config.path, config.args);
	};

	renderer.restart_engine = function() {
		this.set_behaviour("halt");
		this.engine_start(config.path, config.args);
	};

	renderer.engine_start = function(filepath, args) {

		this.engine.shutdown();						// Don't reuse engine objects, not even a dummy object
		this.engine = NewEngine(this);				// that had no exe (sync issues due to fake "go" sends)

		this.info_handler.reset_engine_info();
		this.info_handler.must_draw_infobox();		// To displace the new stderr log that appears.

		if (typeof filepath !== "string" || fs.existsSync(filepath) === false) {

			if (!config.failure) {					// Only show the following if there isn't a bigger problem...
				this.err_receive(`<span class="blue">${messages.engine_not_present}</span>`);
				this.err_receive("");
			}
			return;
		}

		if (Array.isArray(args) === false) {
			args = [];
		}

		this.engine.setup(filepath, args, this);
		this.engine.send("uci");
	};

	renderer.engine_send_all_options = function() {

		// Relies on the engine.leelaish flag being correct.
		// Also, the engine should be halted before calling this.

		for (let key of Object.keys(standard_engine_options)) {
			this.engine.maybe_setoption(key, standard_engine_options[key]);
		}

		let delayed_hash_val = null;

		for (let key of Object.keys(config.options)) {
			if (key.toLowerCase() !== "hash") {			// "It is recommended to set Hash after setting Threads."
				this.engine.maybe_setoption(key, config.options[key]);
			} else {
				delayed_hash_val = config.options[key];
			}
		}

		if (delayed_hash_val !== null) {
			this.engine.maybe_setoption("Hash", delayed_hash_val);
		}

		// The following use setoption() not maybe_setoption().

		if (this.engine.leelaish) {
			this.engine.setoption("MultiPV", 500);
		} else {
			this.engine.setoption("MultiPV", config.ab_engine_multipv);
		}
	};

	// -------------------------------------------------------------------------------------------------------------------------
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
			this.tree.node.searchmoves = [];		// This is reasonable regardless of which way the toggle went.
			this.handle_search_params_change();
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

	renderer.set_arrow_filter = function(type, value) {
		config.arrow_filter_type = type;
		config.arrow_filter_value = value;
		config_io.save(config);
		this.draw();
	};

	renderer.invert_searchmoves = function() {

		if (!config.searchmoves_buttons || Array.isArray(this.tree.node.searchmoves) === false) {
			return;
		}

		// It's no disaster if the result is wrong somehow, because
		// searchmoves are validated before being sent to Leela.

		let moveset = Object.create(null);

		for (let move of Object.keys(this.tree.node.table.moveinfo)) {
			moveset[move] = true;
		}

		for (let move of this.tree.node.searchmoves) {
			delete moveset[move];
		}

		this.tree.node.searchmoves = Object.keys(moveset);
		this.tree.node.searchmoves.sort();
		this.handle_search_params_change();
	};

	renderer.clear_searchmoves = function() {
		this.tree.node.searchmoves = [];
		this.handle_search_params_change();
	};

	renderer.escape = function() {					// Set things into a clean state.
		this.hide_pgn_chooser();
		this.hide_promotiontable();
		if (this.active_square) {
			this.set_active_square(null);
			if (config.click_spotlight) {
				this.draw_canvas_arrows();
			}
		}
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

	renderer.change_piece_set = function(directory) {
		if (directory) {
			if (images.validate_folder(directory) === false) {
				alert(messages.invalid_pieces_directory);
				return;
			}
			images.load_from(directory);
		} else {
			directory = null;
			images.load_from(path.join(__dirname, "pieces"));
		}
		this.friendly_draws = New2DArray(8, 8, null);
		this.enemy_draws = New2DArray(8, 8, null);
		config["override_piece_directory"] = directory;
		config_io.save(config);
	};

	renderer.change_background = function(file, config_save = true) {
		if (file && fs.existsSync(file)) {
			let img = new Image();
			img.src = file;			// Automagically gets converted to "file:///C:/foo/bar/whatever.png"
			boardsquares.style["background-image"] = `url("${img.src}")`;
		} else {
			boardsquares.style["background-image"] = background(config.light_square, config.dark_square, config.square_size);
		}
		if (config_save) {
			config.override_board = file;
			config_io.save(config);
		}
	};

	renderer.rebuild_sizes = function() {

		// This assumes everything already exists.
		// Derived from the longer version in start.js, which it does not replace.

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

	renderer.query_sync_status = function() {
		try {
			let running = this.engine.search_running.node ? "node " + this.engine.search_running.node.id.toString() : null;
			let desired = this.engine.search_desired.node ? "node " + this.engine.search_desired.node.id.toString() : null;
			alert(`Running: ${running}\nDesired: ${desired}`);
		} catch (err) {
			alert(err);
		}
	};

	renderer.query_dropped_inputs = function() {
		alert(`Total dropped inputs: ${total_dropped_inputs}`);		// This is a global variable in start.js
	};

	renderer.log_ram = function() {
		console.log(`RAM after ${Math.floor(performance.now() / 1000)} seconds:`);
		for (let foo of Object.entries(process.memoryUsage())) {
			let type = foo[0] + " ".repeat(12 - foo[0].length);
			let mb = foo[1] / (1024 * 1024);
			let mb_rounded = Math.floor(mb * 1000) / 1000;			// 3 d.p.
			console.log(type, "(MB)", mb_rounded);
		}
	};

	renderer.save_config = function() {			// Just for the dev menu - everything else can just call config_io.save(config) directly.
		config_io.save(config);
	};

	renderer.run_script = function(filename) {

		const disallowed = ["position", "go", "stop", "ponderhit", "quit"];

		let buf;
		try {
			buf = fs.readFileSync(filename);
		} catch (err) {
			alert(err);
			return;
		}

		this.set_behaviour("halt");

		let s = buf.toString();
		let lines = s.split("\n").map(z => z.trim()).filter(z => z !== "");

		if (!config.allow_arbitrary_scripts) {
			for (let line of lines) {
				for (let d of disallowed) {
					if (line.startsWith(d)) {
						this.set_special_message(`${messages.invalid_script}`, "yellow");
						console.log(`Refused to run script: ${filename}`);
						return;
					}
				}
			}
		}

		console.log(`Running script: ${filename}`);

		for (let line of lines) {
			if (config.allow_arbitrary_scripts) {
				this.engine.send(line, true);			// Force mode, so setoptions don't get held back
			} else {
				this.engine.send(line);
			}
			console.log(line);
		}
		this.set_special_message(`${path.basename(filename)}: Sent ${lines.length} lines`, "blue");
	};

	renderer.generate_simple_book = function() {		// For https://github.com/rooklift/lc0_lichess
		let histories = this.tree.root.end_nodes().map(end => end.history_old_format());
		let text_lines = histories.map(h => "\t\"" + h.join(" ") + "\"");
		console.log("[\n" + text_lines.join(",\n") + "\n]");
	};

	renderer.set_logfile = function(filename) {		// Arg can be null to stop logging.
		config.logfile = null;
		Log("Stopping log.");			// This will do nothing, but calling Log() forces it to close any open file.
		config.logfile = filename;
		config_io.save(config);
		this.send_ack_logfile();
	};

	renderer.unload_book = function() {
		this.book = null;
		this.send_ack_book();
	};

	renderer.send_ack_logfile = function() {
		ipcRenderer.send("ack_logfile", config.logfile);
	};

	renderer.send_ack_book = function() {
		ipcRenderer.send("ack_book", this.book ? true : false);		// Don't send the object...
	};

	renderer.send_ack_setoption = function(name) {
		this.engine.send_ack_setoption_to_main_process(name);
	};

	// -------------------------------------------------------------------------------------------------------------------------
	// Clicks, drops, mouse stuff...

	renderer.set_active_square = function(new_point) {

		// We do this immediately so it's snappy and responsive, rather than waiting for the next draw cycle. But we don't
		// want to actually call draw() here since whatever called this may well end up triggering a draw anyway.

		let old_point = this.active_square;

		if (old_point) {
			let td = document.getElementById("underlay_" + old_point.s);
			td.style["background-color"] = "transparent";
			this.dirty_squares[old_point.x][old_point.y] = 0;		// Lame. This is the constant for EMPTY.
		}

		if (new_point) {
			let td = document.getElementById("underlay_" + new_point.s);
			td.style["background-color"] = config.active_square;
			this.dirty_squares[new_point.x][new_point.y] = 2;		// Lame. This is the constant for ACTIVE.
		}

		this.active_square = new_point ? new_point : null;
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
			let ok = this.move(move);
			if (!ok && config.click_spotlight) {		// No need to worry about spotlight arrows if the move actually happened
				this.draw_canvas_arrows();
			}
			return;
		}

		// So there is no active_square... create one?

		if (board.active === "w" && board.is_white(p)) {
			this.set_active_square(p);
			if (config.click_spotlight) {
				this.draw_canvas_arrows();
			}
		}
		if (board.active === "b" && board.is_black(p)) {
			this.set_active_square(p);
			if (config.click_spotlight) {
				this.draw_canvas_arrows();
			}
		}
	};

	renderer.infobox_click = function(event) {

		if (this.info_handler.clickers_are_valid_for_node(this.tree.node) === false) {
			return;
		}

		let n = EventPathN(event, "infobox_");
		let moves = this.info_handler.moves_from_click_n(n);

		if (!moves || moves.length === 0) {				// We do assume length > 0 below.
			this.maybe_searchmove_click(event);
			return;
		}

		// I doubt moves can be an illegal sequence now but it's not too expensive here...

		let illegal_reason = this.tree.node.board.sequence_illegal(moves);
		if (illegal_reason) {
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

		this.tree.add_move_sequence(moves);
	};

	renderer.maybe_searchmove_click = function(event) {

		let sm = this.info_handler.searchmove_from_click(event);

		if (!sm) {
			return;
		}

		if (this.tree.node.searchmoves.includes(sm)) {
			this.tree.node.searchmoves = this.tree.node.searchmoves.filter(move => move !== sm);
		} else {
			this.tree.node.searchmoves.push(sm);
		}

		this.tree.node.searchmoves.sort();
		this.handle_search_params_change();
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

		if (EventPathString(event, "gobutton")) {
			this.set_behaviour("analysis_free");
			return;
		}

		if (EventPathString(event, "haltbutton")) {
			this.set_behaviour("halt");
			return;
		}

		if (EventPathString(event, "lock_return")) {
			this.return_to_lock();
			return;
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
				let ok = this.move(source.s + dest.s);
				if (!ok && config.click_spotlight) {		// No need to worry about spotlight arrows if the move actually happened
					this.draw_canvas_arrows();
				}
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

	renderer.send_title = function() {
		let title = "Nibbler";
		let root = this.tree.root;
		if (root.tags && root.tags.White && root.tags.White !== "White" && root.tags.Black && root.tags.Black !== "Black") {
			title += `: ${root.tags.White} - ${root.tags.Black}`;
		}
		ipcRenderer.send("set_title", title);
	};

	// -------------------------------------------------------------------------------------------------------------------------
	// General draw code...

	renderer.draw_friendlies_in_table = function(board) {

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {

				let piece_to_draw = "";

				if (board.colour(Point(x, y)) === board.active) {
					piece_to_draw = board.state[x][y];
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
					td.draggable = true;
				}
			}
		}
	};

	renderer.draw_enemies_in_table = function(board) {

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {

				let piece_to_draw = "";

				if (board.colour(Point(x, y)) === OppositeColour(board.active)) {
					piece_to_draw = board.state[x][y];
				}

				if (piece_to_draw === this.enemy_draws[x][y]) {
					continue;
				}

				// So if we get to here, we need to draw...

				this.enemy_draws[x][y] = piece_to_draw;

				let s = S(x, y);
				let td = document.getElementById("underlay_" + s);

				if (piece_to_draw === "") {
					td.style["background-image"] = "none";
				} else {
					td.style["background-image"] = images[piece_to_draw].string_for_bg_style;
				}

				td.draggable = false;
			}
		}
	};

	renderer.draw_move_and_active_squares = function(move, active_square) {

		// These constants are stupidly used in set_active_square() also.

		const EMPTY = 0;
		const HIGHLIGHT = 1;
		const ACTIVE = 2;

		if (!this.dmaas_scratch) {
			this.dmaas_scratch = New2DArray(8, 8, null);
		}

		// First, set each element of the array to indicate what state we want
		// its background-color to be in.

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				this.dmaas_scratch[x][y] = EMPTY;
			}
		}

		let move_points = [];

		if (typeof move === "string") {
			let source = Point(move.slice(0, 2));
			let dest = Point(move.slice(2, 4));
			if (source && dest) {
				move_points = PointsBetween(source, dest);
			}
		}

		for (let p of move_points) {
			this.dmaas_scratch[p.x][p.y] = HIGHLIGHT;
		}

		if (active_square) {
			this.dmaas_scratch[active_square.x][active_square.y] = ACTIVE;
		}

		// Now the dmaas_scratch array has what we actually want.
		// We check whether each square is already so, and change it otherwise.

		for (let x = 0; x < 8; x++) {

			for (let y = 0; y < 8; y++) {

				switch (this.dmaas_scratch[x][y]) {

				case EMPTY:

					if (this.dirty_squares[x][y] !== EMPTY) {
						let s = S(x, y);
						let td = document.getElementById("underlay_" + s);
						td.style["background-color"] = "transparent";
						this.dirty_squares[x][y] = EMPTY;
					}

					break;

				case HIGHLIGHT:

					if (this.dirty_squares[x][y] !== HIGHLIGHT) {
						let s = S(x, y);
						let td = document.getElementById("underlay_" + s);
						td.style["background-color"] = config.move_squares_with_alpha;
						this.dirty_squares[x][y] = HIGHLIGHT;
					}

					break;

				case ACTIVE:

					if (this.dirty_squares[x][y] !== ACTIVE) {
						let s = S(x, y);
						let td = document.getElementById("underlay_" + s);
						td.style["background-color"] = config.active_square;
						this.dirty_squares[x][y] = ACTIVE;
					}

					break;
				}
			}
		}
	};

	renderer.hoverdraw = function() {

		if (!config.hover_draw || this.info_handler.clickers_are_valid_for_node(this.tree.node) === false) {
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

		let info = SortedMoveInfo(this.tree.node)[div_index];		// Possibly undefined

		if (!info || Array.isArray(info.pv) === false || info.pv.length === 0) {
			return false;
		}

		if (config.hover_method === 0) {
			return this.hoverdraw_animate(div_index, info);			// Sets this.hoverdraw_div
		} else if (config.hover_method === 1) {
			return this.hoverdraw_single(div_index, overlist);		// Sets this.hoverdraw_div
		} else if (config.hover_method === 2) {
			return this.hoverdraw_final(div_index, info);			// Sets this.hoverdraw_div
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

	renderer.hoverdraw_final = function(div_index, info) {

		this.hoverdraw_div = div_index;
		return this.draw_fantasy_from_moves(info.pv);

	};

	renderer.draw_fantasy_from_moves = function(moves) {

		// We don't assume moves is an array of legal moves, or even an array.
		// This is probably paranoid at this point but meh.

		if (Array.isArray(moves) === false) {
			return false;
		}

		let board = this.tree.node.board;

		for (let move of moves) {
			let illegal_reason = board.illegal(move);
			if (illegal_reason) {
				return false;
			}
			board = board.move(move);
		}

		let move = moves[moves.length - 1];		// Possibly undefined...

		this.draw_fantasy(board, move);
		return true;
	};

	renderer.draw_fantasy = function(board, move) {
		this.draw_move_and_active_squares(move, null);
		this.draw_enemies_in_table(board);
		boardctx.clearRect(0, 0, canvas.width, canvas.height);		// Clearing the canvas arrows.
		this.draw_friendlies_in_table(board);
	};

	renderer.draw = function() {

		debuggo.draw = debuggo.draw ? debuggo.draw + 1 : 1;

		// We do the :hover reaction first. This way, we are detecting hover based on the previous cycle's state.
		// This should prevent the sort of flicker that can occur if we try to detect hover based on changes we
		// just made (i.e. if we drew then detected hover instantly).

		let did_hoverdraw = this.hoverdraw();

		if (did_hoverdraw) {
			canvas.style.outline = "2px dashed #b4b4b4";
		} else {
			this.hoverdraw_div = -1;
			boardfriends.style.display = "block";
			canvas.style.outline = "none";
			this.draw_move_and_active_squares(this.tree.node.move, this.active_square);
			this.draw_enemies_in_table(this.tree.node.board);
			this.draw_canvas_arrows();
			this.draw_friendlies_in_table(this.tree.node.board);
		}

		this.draw_statusbox();
		this.draw_infobox();

		this.grapher.draw(this.tree.node);

		debuggo.draw -= 1;
	};

	renderer.draw_canvas_arrows = function() {
		boardctx.clearRect(0, 0, canvas.width, canvas.height);
		let arrow_spotlight_square = config.click_spotlight ? this.active_square : null;
		let next_move = (config.next_move_arrow && this.tree.node.children.length > 0) ? this.tree.node.children[0].move : null;
		this.info_handler.draw_arrows(this.tree.node, arrow_spotlight_square, next_move);
	};

	renderer.draw_statusbox = function() {

		let analysing_other = null;

		if (config.behaviour === "analysis_locked" && this.leela_lock_node && this.leela_lock_node !== this.tree.node) {
			if (!this.leela_lock_node.parent) {
				analysing_other = "root";
			} else {
				analysing_other = "position after " + this.leela_lock_node.token(false, true);
			}
		}

		this.info_handler.draw_statusbox(
			this.tree.node,
			this.engine,
			analysing_other
		);
	};

	renderer.draw_infobox = function() {
		this.info_handler.draw_infobox(
			this.tree.node,
			this.mouse_point(),
			this.active_square,
			this.tree.node.board.active,
			this.hoverdraw_div,
			config.behaviour === "halt" || config.always_show_searchmoves);
	};

	renderer.set_special_message = function(s, css_class, duration) {
		this.info_handler.set_special_message(s, css_class, duration);
		this.draw_statusbox();
	};

	renderer.spin = function() {
		debuggo.spin = debuggo.spin ? debuggo.spin + 1 : 1;
		this.tick++;
		this.draw();
		this.update_graph_eval(this.engine.search_running.node);		// Possibly null.
		setTimeout(this.spin.bind(this), config.update_delay);
		debuggo.spin -= 1;
	};

	renderer.update_graph_eval = function(node) {

		if (!node || node.destroyed) {
			return;
		}

		let info = SortedMoveInfo(node)[0];								// Possibly undefined.
		if (info) {
			node.table.update_eval_from_move(info.move);
		}

	};

	return renderer;
}
