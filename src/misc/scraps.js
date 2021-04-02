"use strict";

function NewPGNFileLoader(filename, callback) {

	let loader = Object.create(null);
	loader.type = "pgn";

	loader.callback = callback;
	loader.msg = "Loading PGN...";
	loader.buf = null;
	loader.preparser = null;

	loader.shutdown = function() {
		this.callback = null;
		this.msg = "";
		this.buf = null;
		if (this.preparser) {
			this.preparser.shutdown();
			this.preparser = null;
		}
	};

	loader.load = function(filename) {
		fs.readFile(filename, (err, data) => {
			if (err) {
				console.log(err);
				this.shutdown();
			} else if (this.callback) {					// We might already have aborted
				this.buf = data;
				this.continue();
			}
		});
	};

	loader.continue = function() {

		if (!this.callback) {
			return;
		}

		if (!this.preparser) {
			this.preparser = NewPGNPreParser(this.buf, (games) => {
				if (this.callback) {
					let cb = this.callback; cb(games);
				}
				this.shutdown();
			});
		}

		this.msg = this.preparser.msg;
		setTimeout(() => {this.continue();}, 20);		// Just to update these messages.
	};

	setTimeout(() => {loader.load(filename);}, 0);
	return loader;
}

// ------------------------------------------------------------------------------------------------------------------------------

function NewPGNPreParser(buf, callback) {		// Cannot fail unless aborted.

	let loader = Object.create(null);
	loader.type = "pgn";

	loader.callback = callback;
	loader.msg = "Preparsing...";
	loader.games = [new_pgn_record()];
	loader.lines = null;
	loader.buf = buf;
	loader.splitter = null;

	loader.n = 0;

	loader.shutdown = function() {
		this.callback = null;
		this.msg = "";
		this.games = null;
		this.lines = null;
		this.buf = null;
		if (this.splitter) {
			this.splitter.shutdown();
			this.splitter = null;
		}
	};

	loader.continue = function() {

		if (!this.callback) {
			return;
		}

		if (!this.splitter) {
			this.splitter = NewLineSplitter(this.buf, (lines) => {
				this.lines = lines;
			});
		}

		if (!this.lines) {
			this.msg = this.splitter.msg;
			setTimeout(() => {this.continue();}, 20);
			return;
		}

		let continuetime = performance.now();

		while (true) {

			if (this.n >= this.lines.length) {
				break;
			}

			let rawline = this.lines[this.n++];

			if (rawline.length === 0) {
				continue;
			}

			if (rawline[0] === 37) {			// Percent % sign is a special comment type.
				continue;
			}

			let tagline = "";

			if (rawline[0] === 91) {
				let s = decoder.decode(rawline).trim();
				if (s.endsWith(`"]`)) {
					tagline = s;
				}
			}

			if (tagline !== "") {

				if (this.games[this.games.length - 1].movebufs.length > 0) {
					// We have movetext already, so this must be a new game. Start it.
					this.games.push(new_pgn_record());
				}

				// Parse the tag line...

				tagline = tagline.slice(1, -1);								// So now it's like:		Foo "bar etc"

				let quote_i = tagline.indexOf(`"`);

				if (quote_i === -1) {
					continue;
				}

				let key = tagline.slice(0, quote_i).trim();
				let value = tagline.slice(quote_i + 1).trim();

				if (value.endsWith(`"`)) {
					value = value.slice(0, -1);
				}

				this.games[this.games.length - 1].tags[key] = SafeStringHTML(value);		// Escape evil characters. IMPORTANT!

			} else {

				this.games[this.games.length - 1].movebufs.push(rawline);

			}

			if (this.n % 1000 === 0) {
				if (performance.now() - continuetime > 20) {
					this.msg = `Preparsing... ${(100 * (this.n / this.lines.length)).toFixed(0)}%`;
					setTimeout(() => {this.continue();}, 20);
					return;
				}
			}
		}

		// Once, after the while loop is broken...

		let cb = this.callback; cb(this.games);
		this.shutdown();
	};

	setTimeout(() => {loader.continue();}, 0);		// setTimeout especially required here since there's no async load() function in this one.
	return loader;
}

// ------------------------------------------------------------------------------------------------------------------------------

function NewLineSplitter(buf, callback) {

	// The original sync version of this is in misc/scraps.js and is easier to read.

	let loader = Object.create(null);
	loader.type = "?";

	loader.callback = callback;
	loader.msg = "PGN: Splitting...";
	loader.lines = [];
	loader.buf = buf;

	loader.a = 0;
	loader.b = 0;

	if (buf.length > 3 && buf[0] === 239 && buf[1] === 187 && buf[2] === 191) {
		loader.a = 3;		// 1st slice will skip byte order mark (BOM).
	}

	loader.shutdown = function() {
		this.callback = null;
		this.msg = "";
		this.lines = null;
		this.buf = null;
	};

	loader.append = function(arr) {
		if (arr.length > 0 && arr[arr.length - 1] === 13) {		// Discard \r
			this.lines.push(Buffer.from(arr.slice(0, -1)));
		} else {
			this.lines.push(Buffer.from(arr));
		}
	};

	loader.continue = function() {

		if (!this.callback) {
			return;
		}

		let continuetime = performance.now();

		while (true) {

			if (this.b >= this.buf.length) {
				break;
			}

			if (this.buf[this.b] === 10) {					// Split on \n
				let line = this.buf.slice(this.a, this.b);
				this.append(line);
				this.a = this.b + 1;
			}

			this.b++;

			if (this.lines.length % 1000 === 0) {
				if (performance.now() - continuetime > 20) {
					this.msg = `PGN: Splitting... ${(100 * (this.b / this.buf.length)).toFixed(0)}%`;
					setTimeout(() => {this.continue();}, 20);
					return;
				}
			}
		}

		// Once, after the while loop is broken...

		if (this.a !== this.b) {							// We haven't added the last line before EOF.
			let line = this.buf.slice(this.a, this.b);
			this.append(line);
		}

		let cb = this.callback; cb(this.lines);
		this.shutdown();
	};

	setTimeout(() => {loader.continue();}, 0);		// setTimeout especially required here since there's no async load() function in this one.
	return loader;
}

// ------------------------------------------------------------------------------------------------------------------------------

function split_buffer_alternative(buf) {

	// Split a binary buffer into an array of binary buffers corresponding to lines.

	let lines = [];
	let search = Buffer.from("\n");
	let off = 0;

	if (buf.length > 3 && buf[0] === 239 && buf[1] === 187 && buf[2] === 191) {
		off = 3;								// Skip byte order mark (BOM).
	}

	while (true) {

		let hi = buf.indexOf(search, off);

		if (hi === -1) {
			if (off < buf.length) {
				lines.push(buf.slice(off));
			}
			return lines;
		}

		if (buf[hi - 1] === 13) {				// Discard \r
			lines.push(buf.slice(off, hi - 1));
		} else {
			lines.push(buf.slice(off, hi));
		}

		off = hi + 1;
	}
}
