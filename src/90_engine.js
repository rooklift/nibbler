"use strict";

/*

We are in one of these states (currently implicit in the logic):
	1. Inactive
	2. Running a search
	3. Changing the search
	4. Ending the search

(1) Inactive................................................................................

	A "bestmove" should not arrive. If the user wants to start a search, we send it and
	enter state 2.

(2) Running a search........................................................................

	A "bestmove" might arrive, in which case the search ends and we go into state 1. The
	"bestmove" line must be passed to hub.receive_bestmove().

	Alternatively, the user may demand a search with new parameters, in which case we send
	"stop" and enter state 3. Or the user may halt, in which case we send "stop" and enter
	state 4.

(3) Changing the search.....................................................................

	A "stop" has been sent and we are waiting for a "bestmove" response. When it arrives,
	we can send the new search and go back to state 2. The "bestmove" line itself can be
	discarded since it is not relevant to the desired search.

	In state 3, if the user changes the desired search, we simply replace the old desired
	search (which never started) with the new desired search (which may be the null search,
	in which case we have entered state 4).

(4) Ending the search.......................................................................

	Just like state 3, except the desired search is the null search. When a "bestmove"
	arrives, we go to state 1.

*/

let NoSearch = Object.freeze({
	node: null,
	limit: null,
	limit_by_time: false,
	searchmoves: Object.freeze([])
});

function SearchParams(node = null, limit = null, limit_by_time = false, searchmoves = null) {

	if (!node) return NoSearch;

	let validated;

	if (Array.isArray(searchmoves)) {
		validated = node.validate_searchmoves(searchmoves);		// returns a new array
	} else {
		validated = [];
	}

	Object.freeze(validated);			// under no circumstances refactor this to freeze the original searchmoves

	return Object.freeze({
		node: node,
		limit: limit,
		limit_by_time: limit_by_time,
		searchmoves: validated
	});
}

function NewEngine(hub) {

	let eng = Object.create(null);

	eng.hub = hub;
	eng.exe = null;
	eng.scanner = null;
	eng.err_scanner = null;

	eng.filepath = "";					// Used to decide what entry in engineconfig to use. Start as "", which has defaults for the dummy engine.

	eng.last_send = null;
	eng.unresolved_stop_time = null;
	eng.ever_received_uciok = false;
	eng.ever_received_readyok = false;
	eng.have_quit = false;
	eng.suppress_cycle_info = null;		// Stupid hack to allow "forget all analysis" to work; info lines from this cycle are ignored.

	eng.known_options = Object.create(null);		// Keys are always lowercase.
	eng.sent_options = Object.create(null);			// Keys are always lowercase. Values are always strings.
	eng.setoption_queue = [];

	eng.warn_send_fail = true;
	eng.leelaish = false;				// Most likely set by hub upon an "id name" line, though can also be set by info_handler.

	eng.search_running = NoSearch;		// The search actually being run right now.
	eng.search_desired = NoSearch;		// The search we want Leela to be running. Often the same object as above.
	eng.search_completed = NoSearch;	// Whatever object search_running was when the last "bestmove" came.

	// -------------------------------------------------------------------------------------------

	eng.send = function(msg, force) {

		// Importantly, setoption messages are normally held back until the engine is not running.

		msg = msg.trim();

		if (msg.startsWith("setoption")) {

			if (this.search_running.node && !force) {
				this.setoption_queue.push(msg);
				return;
			}

			let lower = msg.toLowerCase();
			let i1 = lower.indexOf("name");
			let i2 = lower.indexOf("value");

			if (i1 !== -1 && i2 !== -1 && i2 > i1) {

				let key = lower.slice(i1 + 5, i2 - 1).trim();			// Keys are always lowercase.
				let val = msg.slice(i2 + 6).trim();

				if (key.length > 0) {
					this.sent_options[key] = val;
					this.send_ack_setoption(key);
				}
			}
		}

		// Do this test here so the sent_options / ack stuff happens even when there is no engine
		// loaded, this helps our menu check marks to be correct.

		if (!this.exe) {
			return;
		}

		// Send the message...

		try {
			this.exe.stdin.write(msg);
			this.exe.stdin.write("\n");
			Log("--> " + msg);
			this.last_send = msg;
		} catch (err) {
			Log("(failed) --> " + msg);
			if (this.last_send !== null && this.warn_send_fail) {
				alert(messages.send_fail);
				this.warn_send_fail = false;
			}
		}
	};

	eng.send_desired = function() {

		if (this.search_running.node) {
			throw "send_desired() called but search was running";
		}

		let node = this.search_desired.node;

		if (!node || node.destroyed || node.terminal_reason()) {
			this.search_running = NoSearch;
			this.search_desired = NoSearch;
			return;
		}

		let root_fen = node.get_root().board.fen(!this.in_960_mode());
		let setup = `fen ${root_fen}`;

		if (!this.in_960_mode() && setup === "fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1") {
			setup = "startpos";		// May as well send this format if we're not in 960 mode.
		}

		let moves;

		if (!this.in_960_mode()) {
			moves = node.history_old_format();
		} else {
			moves = node.history();
		}

		if (moves.length === 0) {
			this.send(`position ${setup}`);
		} else {
			this.send(`position ${setup} moves ${moves.join(" ")}`);
		}

		if (config.log_positions) {
			Log(node.board.graphic());
		}

		let s;
		let n = this.search_desired.limit;

		if (!n) {
			s = "go infinite";
		} else if (config.use_movetime) {			// Super-secret option for now. Not saved to config file.
			s = `go movetime ${n}`;
		} else {
			s = `go nodes ${n}`;
		}

		if (config.searchmoves_buttons && this.search_desired.searchmoves.length > 0) {
			s += " searchmoves";
			for (let move of this.search_desired.searchmoves) {
				s += " " + move;
			}
		}

		this.send(s);
		this.search_running = this.search_desired;
		this.suppress_cycle_info = null;
		this.hub.info_handler.engine_cycle++;
		this.hub.info_handler.engine_subcycle++;
	};

	eng.set_search_desired = function(node, limit, limit_by_time, searchmoves) {

		if (!this.ever_received_uciok || !this.ever_received_readyok) {
			console.log("set_search_desired() aborted - too early");
			return;
		}

		let params = SearchParams(node, limit, limit_by_time, searchmoves);

		// It is correct to check these against the *desired* search
		// (which may or may not be the one currently running).

		if (this.search_desired.node === params.node) {
			if (this.search_desired.limit === params.limit) {
				if (this.search_desired.limit_by_time === params.limit_by_time) {
					if (CompareArrays(this.search_desired.searchmoves, params.searchmoves)) {
						return;
					}
				}
			}
		}

		this.search_desired = params;

		// If a search is running, stop it... we will send the new position (if applicable) after receiving bestmove.
		// If no search is running, start the new search immediately.

		if (this.search_running.node) {
			this.send("stop");
			if (!this.unresolved_stop_time) {
				this.unresolved_stop_time = performance.now();
			}
		} else {
			if (this.search_desired.node) {
				this.send_desired();
			}
		}

	};

	eng.send_queued_setoptions = function() {
		for (let msg of this.setoption_queue) {
			this.send(msg, true);					// Use the force flag in case we haven't set search_running to its correct value.
		}
		this.setoption_queue = [];
	};

	eng.send_ucinewgame = function() {				// Engine should be halted before calling this.
		if (!this.ever_received_uciok || !this.ever_received_readyok) {
			console.log("send_ucinewgame() aborted - too early");
			return;				// This is OK. When we actually get these, hub will send ucinewgame.
		}
		this.send("ucinewgame");
	};

	eng.handle_bestmove_line = function(line) {

		this.search_completed = this.search_running;
		this.search_running = NoSearch;

		this.unresolved_stop_time = null;

		// If this.search_desired === this.search_running then the search that just completed is
		// the most recent one requested by the hub; we have nothing to replace it with.
		//
		// Note that, in certain cases (e.g. a halt followed instantly by a resume) search_desired
		// and search_running will have identical properties but be different objects; in that case
		// it is correct to send the desired object as a new search.

		let no_new_search   = this.search_desired === this.search_completed || !this.search_desired.node;
		let report_bestmove = this.search_desired === this.search_completed && this.search_completed.node;

		if (no_new_search) {
			this.search_desired = NoSearch;
			if (report_bestmove) {
				Log("< " + line);
				this.send_queued_setoptions();									// After logging the incoming.
				this.hub.receive_bestmove(line, this.search_completed.node);	// May trigger a new search, so do it last.
			} else {
				Log("(ignore halted) < " + line);
				this.send_queued_setoptions();									// After logging the incoming.
			}
		} else {
			Log("(ignore old) < " + line);
			this.send_queued_setoptions();										// After logging the incoming.
			this.send_desired();
		}
	};

	eng.handle_info_line = function(line) {

		if (line.startsWith("info string ERROR")) {								// Stockfish sends these.
			Log("< " + line);
			this.hub.info_handler.err_receive(line.slice(12));
			return;
		}

		if (!this.search_running.node) {
			if (config.log_info_lines) Log("(ignore !node) < " + line);
			return;
		}

		if (this.search_running.node.destroyed) {
			if (config.log_info_lines) Log("(ignore destroyed) < " + line);
			return;
		}

		// Stockfish has a nasty habit of sending super short PVs when you stop its search.
		// To get around that, we ignore info from SF if it comes during transition.

		if (!this.leelaish && this.search_desired.node !== this.search_running.node) {
			if (config.log_info_lines) Log("(ignore A/B late) < " + line);
			return;
		}

		// Hub can set a cycle to be suppressed (e.g. for the sake of making "forget all analysis" work).
		// This feels a bit sketchy, but will be OK as long as the next "go" is guaranteed to increment the cycle number.

		if (this.suppress_cycle_info === this.hub.info_handler.engine_cycle) {
			if (config.log_info_lines) Log("(ignore suppressed) < " + line);
			return;
		}

		this.hub.info_handler.receive(this, this.search_running.node, line);		// Responsible for logging lines that get this far.
	};

	eng.setoption = function(name, value) {
		let s = `setoption name ${name} value ${value}`;
		this.send(s);
		return s;			// Just so the caller can pop s up as a message if it wants.
	};

	eng.pressbutton = function(name) {
		let s = `setoption name ${name}`;
		this.send(s);
		return s;			// Just so the caller can pop s up as a message if it wants.
	};

	eng.send_ack_setoption = function(name) {
		let key = name.toLowerCase();																// Keys are always stored in lowercase.
		let val = typeof this.sent_options[key] === "string" ? this.sent_options[key] : "";			// Values are strings, if present
		let o = {key, val};
		ipcRenderer.send("ack_setoption", o);
		return o;
	};

	eng.in_960_mode = function() {
		return this.sent_options["uci_chess960"] === "true";				// The string "true" since these values are always strings.
	};

	eng.send_ack_engine = function() {
		ipcRenderer.send("ack_engine", this.filepath);
	};

	eng.setup = function(filepath, args) {		// Returns true on success, false otherwise.

		Log("");
		Log(`Launching ${filepath}`);
		if (args.length > 0) Log(`Args: ${JSON.stringify(args)}`);
		Log("");

		try {
			if (path.basename(filepath).toLowerCase().includes("lc0")) {		// Stupid hack to make Lc0 show all its options.
				if (args.includes("--show-hidden") === false) {
					args = ["--show-hidden"].concat(args);
				}
			}
			this.exe = child_process.spawn(filepath, args, {cwd: path.dirname(filepath)});
		} catch (err) {
			console.log(`engine.setup() failed: ${err.toString()}`);
			return false;
		}

		this.filepath = filepath;
		this.send_ack_engine();			// After this.filepath is set.

		// Main process wants to keep track of what these things are set to (for menu checks).
		// These will all ack the value "" to main.js since no value has been set yet...

		this.sent_options = Object.create(null);		// Blank anything we "sent" up till now.

		for (let key of ["EvalFile", "WeightsFile", "SyzygyPath", "Threads", "Hash", "MultiPV", "Backend", "Temperature", "TempDecayMoves"]) {
			this.send_ack_setoption(key);
		}

		this.exe.once("error", (err) => {
			alert(err);
		});

		this.scanner = readline.createInterface({
			input: this.exe.stdout,
			output: undefined,
			terminal: false
		});

		this.err_scanner = readline.createInterface({
			input: this.exe.stderr,
			output: undefined,
			terminal: false
		});

		this.err_scanner.on("line", (line) => {
			if (this.have_quit) return;
			Log(". " + line);
			this.hub.err_receive(SafeStringHTML(line));
		});

		this.scanner.on("line", (line) => {

			if (this.have_quit) return;

			if (line.startsWith("bestmove")) {
				this.handle_bestmove_line(line);		// Will do logging, possibly adding a reason for rejection.
			} else if (line.startsWith("info")) {
				this.handle_info_line(line);			// Will do logging, possibly adding a reason for rejection.
			} else {
				Log("< " + line);
				if (line.startsWith("option")) {
					let a = line.indexOf(" name ");
					let b = line.indexOf(" type ");
					if (a !== -1 && b != -1) {
						let optname = line.slice(a + 6, b).trim().toLowerCase();
						this.known_options[optname] = line.slice(b + 1);
						if (optname === "uci_chess960") {
							this.setoption("UCI_Chess960", true);		// As a special thing, always set UCI_Chess960 where possible.
						}
					}
				}
				if (line.startsWith("uciok")) {
					this.ever_received_uciok = true;
				}
				if (line.startsWith("readyok")) {
					this.ever_received_readyok = true;
				}
				this.hub.receive_misc(SafeStringHTML(line));
			}

		});

		return true;
	};

	eng.shutdown = function() {				// Note: Don't reuse the engine object.
		this.have_quit = true;
		this.send("quit");
		if (this.exe) {
			setTimeout(() => {
				this.exe.kill();
			}, 2000);
		}
	};

	return eng;
}
