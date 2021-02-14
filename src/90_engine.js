"use strict";

// FIXME - remove leela_node from renderer.js if possible.

function NewEngine() {

	let eng = Object.create(null);

	eng.exe = null;
	eng.scanner = null;
	eng.err_scanner = null;
	eng.last_send = null;
	eng.ever_received_uciok = false;
	eng.warned_send_fail = false;

	// eng.sent_limit - the node limit of the last "go" we sent (but not affected by "bestmove").
	// Needs to match the values provided by renderer.node_limit().
	// This 3-type var is a bit sketchy, maybe.

	eng.sent_limit = "n/a";		// Positive number for node limit; null for infinite; "n/a" for stopped *by us*.

	eng.node_running = null;
	eng.node_desired = null;	// null when actually running.

	eng.hub = null;

	// -------------------------------------------------------------------------------------------

	eng.send = function(msg) {

		if (!this.exe) {
			return;
		}

		msg = msg.trim();

		this.send_msg_bookkeeping(msg);

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

	eng.send_msg_bookkeeping = function(msg) {

		if (msg.startsWith("go")) {

			if (msg.includes("infinite")) {		// Might not end with infinite due to searchmoves.
				this.sent_limit = null;
			} else {
				let tokens = msg.split(" ").map(z => z.trim()).filter(z => z !== "");
				let i = tokens.indexOf("nodes");
				this.sent_limit = parseInt(tokens[i + 1], 10);
			}

		} else if (msg === "stop") {

			this.sent_limit = "n/a";

		} else if (msg.startsWith("setoption") && msg.includes("WeightsFile")) {

			let i = msg.indexOf("value") + 5;
			ipcRenderer.send("ack_weightsfile", msg.slice(i).trim());

		}
	};

	eng.send_desired = function() {

		let node = this.node_desired;

		if (this.node_running) {
			this.send("stop");
		}

		if (!node || node.destroyed || node.terminal_reason() !== "") {
			this.node_running = null;
			this.node_desired = null;
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
		let n = hub.node_limit();

		if (!n) {
			s = "go infinite";
		} else {
			s = `go nodes ${n}`;
		}

		// FIXME - can't change searchmoves while running.

		if (config.searchmoves_buttons && Array.isArray(node.searchmoves) && node.searchmoves.length > 0) {
			node.validate_searchmoves();	// Leela can crash on illegal searchmoves.
			s += " searchmoves";
			for (let move of node.searchmoves) {
				s += " " + move;
			}
		}

		this.send(s);
		this.node_running = node;
		this.node_desired = null;
	};

	eng.set_node_desired = function(node) {

		// If a search is running, stop it (we will send the new position after receiving bestmove).
		// If no search is running, start the new search immediately.

		if (this.node_running === node) {
			return;
		}

		this.node_desired = node;			// This may be null.

		if (this.node_desired && !this.node_running) {
			this.send_desired();
		} else {
			this.send("stop");
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
				this.hub.info_handler.receive(line, this.node_running);
			} else if (line.includes("bestmove")) {
				let completed_node = this.node_running;
				this.node_running = null;
				if (this.node_desired) {
					this.send_desired();
				}
				this.hub.receive(line, completed_node);
			} else {
				this.hub.receive(line, this.node_running);
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
