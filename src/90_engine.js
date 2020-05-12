"use strict";

/* SYNCHRONISATION NOTES

We need to know whether the data we're receiving relates to the current position,
or is obsolete.

We have two systems...

-- Sometimes we send "isready", and ignore all output until receiving "readyok"
-- We expect each "go" command to eventually be followed by a "bestmove" message

Sadly, some engines, including Lc0, send "readyok" at dubious times, meaning we
have to always assume the info could be about the wrong position. Bah! Still,
Leela seems to send "readyok" at roughly the correct time if it is after a
"position" command. But not after a mere "stop" command.

The bestmove tracker should be OK, as long as Leela really does send a
"bestmove" for every "go", and as long as the "bestmove" message is the very
last message it sends about a position. Note that "ucinewgame" causes Leela to
halt its analysis without sending "bestmove", so we must always send "stop"
before sending "ucinewgame".

It seems in practice either one of these is enough. The "bestmove" tracker is
probably more reliable, so we could probably remove the "readyok" tracker.

*/

function NewEngine() {

	let eng = Object.create(null);

	eng.exe = null;
	eng.readyok_required = 0;
	eng.bestmove_required = 0;
	eng.scanner = null;
	eng.err_scanner = null;
	eng.ever_sent = false;
	eng.ever_received_uciok = false;
	eng.go_in_a_row = 0;
	eng.warned_send_fail = false;
	eng.warned_two_go = false;

	eng.send = function(msg) {

		if (!this.exe) {
			return;
		}

		msg = msg.trim();

		if (msg.startsWith("go")) {
			this.bestmove_required++;
			this.go_in_a_row++;
			if (this.go_in_a_row > 1 && !this.warned_two_go) {
				alert(messages.two_go);
				this.warned_two_go = true;
			}
		}

		if (msg === "stop") {
			this.go_in_a_row = 0;
		}

		if (msg === "isready") {
			this.readyok_required++;
		}

		try {
			this.exe.stdin.write(msg);
			this.exe.stdin.write("\n");
			Log("--> " + msg);
			this.ever_sent = true;
		} catch (err) {
			Log("(failed) --> " + msg);
			if (this.ever_sent && !this.warned_send_fail) {
				alert(messages.send_fail);
				this.warned_send_fail = true;
			}
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

		// Precautionary / defensive coding, in case these somehow got changed
		// before setup() is called (impossible at time of writing)...

		this.readyok_required = 0;
		this.bestmove_required = 0;

		try {
			this.exe = child_process.spawn(filepath, args, {cwd: path.dirname(filepath)});
		} catch (err) {
			alert(err);
			return;
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
			Log(". " + line);
			this.err_receive_fn(line);
		});

		this.scanner.on("line", (line) => {

			// Firstly, make sure we correct our sync counters...
			// Do both these things before anything else.

			if (line.includes("uciok")) {
				this.ever_received_uciok = true;
			}

			if (line.includes("bestmove") && this.bestmove_required > 0) {
				this.bestmove_required--;
			}

			if (line.includes("readyok") && this.readyok_required > 0) {
				this.readyok_required--;
			}

			// We want to ignore output that is clearly obsolete...

			if (this.bestmove_required > 1 || (line.includes("bestmove") && this.bestmove_required > 0)) {
				if (config.log_info_lines || line.includes("info") === false) {
					Log("(bestmove desync) < " + line);
				}
				return;
			}

			// We want to ignore all output when waiting for "readyok"...

			if (this.readyok_required > 0) {
				if (config.log_info_lines || line.includes("info") === false) {
					Log("(readyok desync) < " + line);
				}
				return;
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
		setTimeout(() => {
			this.exe.kill();
		}, 2000);
	};
	
	return eng;
}
