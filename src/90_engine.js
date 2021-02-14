"use strict";

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

	// Positive number for node limit; null for infinite; "n/a" for stopped *by us*.

	eng.sent_limit = "n/a";

	// -------------------------------------------------------------------------------------------

	eng.send = function(msg) {

		if (!this.exe) {
			return;
		}

		msg = msg.trim();

		if (msg === "stop" && this.last_send === "stop") {
			return;
		}

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

	eng.setoption = function(name, value) {
		let s = `setoption name ${name} value ${value}`;
		this.send(s);
		return s;			// Just so the renderer can pop s up as a message if it wants.
	};

	eng.setup = function(filepath, args, receive_fn, err_receive_fn) {

		Log("");
		Log(`Launching ${filepath}`);
		Log("");

		// This is slightly sketchy, the passed functions get saved to our engine
		// object in a way that makes them look like methods of this object. Hmm.
		//
		// Also note, everything is stored as a reference in the object. Not sure
		// if this is needed to stop stuff getting garbage collected...?

		this.receive_fn = receive_fn;
		this.err_receive_fn = err_receive_fn;

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
			this.err_receive_fn(line);
		});

		this.scanner.on("line", (line) => {

			if (line.includes("uciok")) {
				this.ever_received_uciok = true;
			}

			if (line.includes("bestmove")) {
				// FIXME
			}

			if (config.log_info_lines || line.includes("info") === false) {
				Log("< " + line);
			}

			this.receive_fn(line);
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
