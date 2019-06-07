"use strict";

function NewEngineController(path) {

	// Full of closures.

	let controller = Object.create(null);

	let info_table = NewInfoTable();
	let failed = false;
	let running = false;
	let pos = null;
	let readyok_required = 0;
	let output_queue = [];

	let exe = child_process.spawn(config.path);
	exe.on("error", (err) => {
		failed = true;
	});

	let scanner = readline.createInterface({
		input: exe.stdout,
		output: undefined,
		terminal: false
	});

	scanner.on("line", (line) => {
		if (line.includes("readyok") && readyok_required > 0) {
			readyok_required--;
		}
		if (readyok_required > 0) {
			Log("(ignored) < " + line);
			return;
		}
		Log("< " + line);
		receive(line);
	});

	let send = (msg) => {
		try {
			msg = msg.trim();
			exe.stdin.write(msg);
			exe.stdin.write("\n");
			Log("--> " + msg);
			if (msg === "isready") {
				readyok_required++;
			}
		} catch (err) {
			// pass
		}
	};

	let controller.set_pos = (p) => {

		pos = p;

		output_queue.push("stop");
		output_queue.push("isready");


