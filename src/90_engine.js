"use strict";

// FIXME - remove leela_node from renderer.js if possible
// FIXME - remove refs to engine.running
// FIXME - searchmoves (and live adjustments)
// FIXME - limits (and live adjustments)

function SearchParams(node = null, limit = null, searchmoves = null) {
	return {
		node: node,
		limit: limit,
		searchmoves: Array.isArray(searchmoves) ? Array.from(searchmoves) : []
	};
}

let NoSearch = Object.freeze(SearchParams());		// i.e. with the null defaults

function NewEngine() {

	let eng = Object.create(null);

	eng.hub = null;
	eng.exe = null;
	eng.scanner = null;
	eng.err_scanner = null;

	eng.last_send = null;
	eng.ever_received_uciok = false;

	eng.warned_send_fail = false;
	eng.warned_invalid_node = false;

	eng.search_running = NoSearch;
	eng.search_desired = NoSearch;
	eng.ignoring_output = false;		// If we send stop because we want to make a new search, ignore engine until after bestmove.

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
		let n = this.search_desired.limit									// was hub.node_limit();

		if (!n) {
			s = "go infinite";
		} else {
			s = `go nodes ${n}`;
		}

		if (config.searchmoves_buttons && this.search_desired.searchmoves.length > 0) {

			this.search_desired.searchmoves = node.validate_searchmoves(this.search_desired.searchmoves);
			s += " searchmoves";
			for (let move of this.search_desired.searchmoves) {
				s += " " + move;
			}
		}

		this.send(s);
		this.search_running = this.search_desired;
	};

	eng.set_search_desired = function(node, limit, searchmoves) {

		if (this.search_desired.node === node) {
			if (this.search_desired.limit === limit) {
				if (CompareArrays(this.search_desired.searchmoves, searchmoves)) {
					return;
				}
			}
		}

		if (!node) {
			this.search_desired = NoSearch;
		} else {
			this.search_desired = SearchParams(node, limit, searchmoves);
		}

		// If a search is running, stop it (we will send the new position after receiving bestmove).
		// If no search is running, start the new search immediately.

		if (this.search_running.node) {
			this.send("stop");
			this.ignoring_output = true;
		} else {
			if (this.search_desired.node) {
				this.send_desired();
			}
		}

	};

	eng.handle_bestmove_line = function(line) {

		let completed_search = this.search_running;
		this.search_running = NoSearch;

		if (this.search_desired === completed_search) {			// Search ended and we have (as yet) nothing to replace it with.
			this.search_desired = NoSearch;
		} else {												// We can start a new search.
			if (this.search_desired.node) {
				this.send_desired();
			} else {
				this.search_desired = NoSearch;
			}
		}

		// This call to hub must be done after the above, because it might itself trigger
		// a new position, which logically must be dealt with after the above.

		if (this.ignoring_output === false) {
			this.hub.receive(line, completed_search.node);
		} else {
			this.ignoring_output = false;
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
			Log(". " + line);
			this.hub.err_receive(line);
		});

		this.scanner.on("line", (line) => {

			if (config.log_info_lines || line.includes("info") === false) {
				Log("< " + line);
			}

			if (line.includes("uciok")) {
				this.ever_received_uciok = true;
			}

			if (line.startsWith("info")) {

				if (this.ignoring_output === false) {
					this.hub.info_handler.receive(line, this.search_running.node);
				}

			} else if (line.includes("bestmove")) {

				this.handle_bestmove_line(line);

			} else {

				this.hub.receive(line, this.search_running.node);

			}

		});
	};

	eng.shutdown = function() {				// Note: Don't reuse the engine object.
		this.receive_fn = () => {};
		this.err_receive_fn = () => {};
		this.send("quit");
		if (this.exe) {
			setTimeout(() => {
				this.exe.kill();
			}, 2000);
		}
	};

	return eng;
}
