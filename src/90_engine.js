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

	Just like state 3, except the desired search is the null search.

*/

let NoSearch = Object.freeze({
	node: null,
	limit: null,
	searchmoves: Object.freeze([])
});

function SearchParams(node = null, limit = null, searchmoves = null) {

	if (!node) return NoSearch;

	let validated;

	if (Array.isArray(searchmoves)) {
		validated = node.validate_searchmoves(searchmoves);		// returns a new array
	} else {
		validated = [];
	}

	Object.freeze(validated);		// under no circumstances refactor this to freeze the original searchmoves

	return Object.freeze({
		node: node,
		limit: limit,
		searchmoves: validated
	});
}

function NewEngine() {

	let eng = Object.create(null);

	eng.hub = null;
	eng.exe = null;
	eng.scanner = null;
	eng.err_scanner = null;

	eng.last_send = null;
	eng.unresolved_stop_time = null;
	eng.ever_received_uciok = false;
	eng.have_quit = false;

	eng.warned_send_fail = false;

	eng.search_running = NoSearch;		// The search actually being run right now.
	eng.search_desired = NoSearch;		// The search we want Leela to be running. Often the same object as above.

	// -------------------------------------------------------------------------------------------

	eng.send = function(msg) {

		if (!this.exe) {
			return;
		}

		msg = msg.trim();

		if (msg.startsWith("setoption") && msg.includes("WeightsFile")) {
			let i = msg.indexOf("value") + 5;
			ipcRenderer.send("ack_weightsfile", msg.slice(i).trim());
		}

		try {
			this.exe.stdin.write(msg);
			this.exe.stdin.write("\n");
			Log("--> " + msg);
			this.last_send = msg;
		} catch (err) {
			Log("(failed) --> " + msg);
			if (this.last_send !== null && !this.warned_send_fail) {
				alert(messages.send_fail);
				this.warned_send_fail = true;
			}
		}
	};

	eng.send_desired = function() {

		if (this.search_running.node) {
			throw "send_desired() called but search was running";
		}

		let node = this.search_desired.node;

		if (!node || node.destroyed || node.terminal_reason() !== "") {
			this.search_running = NoSearch;
			this.search_desired = NoSearch;
			return;
		}

		let root_fen = node.get_root().board.fen(false);
		let setup = `fen ${root_fen}`;
		let moves = node.history();

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
	};

	eng.set_search_desired = function(node, limit, searchmoves) {

		let params = SearchParams(node, limit, searchmoves);

		// It is correct to check these against the *desired* search
		// (which may or may not be the one currently running).

		if (this.search_desired.node === params.node) {
			if (this.search_desired.limit === params.limit) {
				if (CompareArrays(this.search_desired.searchmoves, params.searchmoves)) {
					return;
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

	eng.handle_bestmove_line = function(line) {

		this.unresolved_stop_time = null;

		// If this.search_desired === this.search_running then the search that just completed
		// is the most recent one requested by the hub; we have nothing to replace it with.

		let no_new_search = this.search_desired === this.search_running || !this.search_desired.node;

		if (no_new_search) {

			let completed_search = this.search_running;
			this.search_running = NoSearch;
			this.search_desired = NoSearch;
			this.hub.receive_bestmove(line, completed_search.node);		// May trigger a new search, so do it last.

		} else {

			this.search_running = NoSearch;
			this.send_desired();

		}
	};

	eng.setoption = function(name, value) {
		let s = `setoption name ${name} value ${value}`;
		this.send(s);
		return s;			// Just so the renderer can pop s up as a message if it wants.
	};

	eng.setup = function(filepath, args, hub) {

		Log("");
		Log(`Launching ${filepath}`);
		Log("");

		this.hub = hub;

		try {
			this.exe = child_process.spawn(filepath, args, {cwd: path.dirname(filepath)});
		} catch (err) {
			alert(err);
			return;
		}

		ipcRenderer.send("ack_engine_start", filepath);
		ipcRenderer.send("ack_weightsfile", null);

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
			debug.err_line = debug.err_line ? debug.err_line + 1 : 1;
			Log(". " + line);
			this.hub.err_receive(line);
			debug.err_line -= 1
		});

		this.scanner.on("line", (line) => {

			if (this.have_quit) return;
			debug.line = debug.line ? debug.line + 1 : 1;

			if (line.includes("uciok")) {
				this.ever_received_uciok = true;
			}

			if (config.log_info_lines || line.includes("info") === false) {
				Log("< " + line);
			}

			if (line.startsWith("bestmove")) {
				this.handle_bestmove_line(line);
			} else if (line.startsWith("info")) {
				this.hub.info_handler.receive(line, this.search_running.node);
			} else {
				this.hub.receive_misc(line);
			}

			debug.line -= 1;

		});
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
