"use strict";

// Non-blocking loader objects. The callback is only called if data is successfully gathered.
// Implementation rule: The callback property is non-null iff it's still possible that the load will succeed.
// ------------------------------------------------------------------------------------------------------------------------------

function NewPolyglotBookLoader(filename, callback) {

	let loader = Object.create(null);
	loader.type = "book";

	loader.callback = callback;
	loader.msg = "Loading book...";

	loader.shutdown = function() {
		this.callback = null;
		this.msg = "";
	};

	loader.load = function(filename) {
		fs.readFile(filename, (err, data) => {
			if (err) {
				console.log(err);
			} else if (this.callback) {
				let cb = this.callback; cb(data);
			}
			this.shutdown();
		});
	};

	loader.load(filename);
	return loader;
}

// ------------------------------------------------------------------------------------------------------------------------------

function NewPGNBookLoader(filename, callback) {

	let loader = Object.create(null);
	loader.type = "book";

	loader.callback = callback;
	loader.msg = "Loading book...";
	loader.buf = null;
	loader.book = [];
	loader.pgn_choices = null;
	loader.preparser = null;

	loader.n = 0;

	loader.shutdown = function() {					// Some of this is potentially to the GC's benefit? Who knows.
		this.callback = null;
		this.msg = "";
		this.buf = null;
		this.book = null;
		this.pgn_choices = null;
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
			} else if (this.callback) {				// We might already have aborted
				this.buf = data;
				this.continue();
			}
		});
	};

	loader.continue = function() {

		if (!this.callback) {
			return;
		}

		if (!this.pgn_choices && !this.preparser) {
			this.msg = "Preparsing...";
			this.preparser = NewPGNPreParser(this.buf, (games) => {
				this.pgn_choices = games;
				this.continue();
			});
			return;
		}

		let continuetime = performance.now();

		while (true) {

			if (this.n >= this.pgn_choices.length) {
				this.finish();
				return;
			}

			let o = this.pgn_choices[this.n++];

			try {
				let root = LoadPGNRecord(o);					// Note that this calls DestroyTree() itself if needed.
				this.book = AddTreeToBook(root, this.book);
				DestroyTree(root);
			} catch (err) {
				//
			}

			if (this.n % 100 === 0) {
				if (performance.now() - continuetime > 20) {
					this.msg = `Loading book... ${(100 * (this.n / this.pgn_choices.length)).toFixed(0)}%`;
					setTimeout(() => {this.continue();}, 5);
					return;
				}
			}
		}
	};

	loader.finish = function() {
		if (this.book && this.callback) {
			SortAndDeclutterPGNBook(this.book);
			let cb = this.callback; cb(this.book);
		}
		this.shutdown();
	};

	loader.load(filename);
	return loader;
}

// ------------------------------------------------------------------------------------------------------------------------------

function NewPGNPreParser(buf, callback) {		// Cannot fail unless aborted.

	let loader = Object.create(null);
	loader.type = "pgn";

	loader.callback = callback;
	loader.msg = "Preparsing...";
	loader.games = null;
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

		if (!this.games) {
			this.games = [new_pgn_record()];
		}

		if (!this.splitter && !this.lines) {
			this.msg = "Splitting...";
			this.splitter = NewLineSplitter(this.buf, (lines) => {
				this.lines = lines;
				this.continue();
			});
			return;
		}

		let continuetime = performance.now();

		while (true) {

			if (this.n >= this.lines.length) {
				this.finish();
				return;
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

				this.games[this.games.length - 1].tags[key] = SafeString(value);		// Escape evil characters. IMPORTANT!

			} else {

				this.games[this.games.length - 1].movebufs.push(rawline);

			}

			if (this.n % 1000 === 0) {
				if (performance.now() - continuetime > 20) {
					this.msg = `Preparsing... ${(100 * (this.n / this.lines.length)).toFixed(0)}%`;
					setTimeout(() => {this.continue();}, 5);
					return;
				}
			}
		}
	};

	loader.finish = function() {
		if (this.callback) {
			let cb = this.callback; cb(this.games);
		}
		this.shutdown();
	};

	loader.continue();
	return loader;
}

// ------------------------------------------------------------------------------------------------------------------------------

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
		setTimeout(() => {this.continue();}, 20);	// Just to update these messages.
	};

	loader.load(filename);
	return loader;
}

// ------------------------------------------------------------------------------------------------------------------------------

function NewLineSplitter(buf, callback) {

	let loader = Object.create(null);
	loader.type = "?";

	loader.callback = callback;
	loader.msg = "Splitting...";
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
				this.finish();
				return;
			}

			let ch = this.buf[this.b];
			if (ch === 10) {					// Split on \n
				let line = buf.slice(this.a, this.b);
				this.append(line);
				this.a = this.b + 1;
			}

			this.b++;

			if (this.lines.length % 1000 === 0) {
				if (performance.now() - continuetime > 20) {
					setTimeout(() => {this.continue();}, 5);
					return;
				}
			}
		}
	};

	loader.finish = function() {

		if (this.a !== this.b) {		// We haven't added the last line before EOF.
			let line = this.buf.slice(this.a, this.b);
			this.append(line);
		}

		if (this.callback) {
			let cb = this.callback; cb(this.lines);
		}
		this.shutdown();
	};

	loader.continue();
	return loader;
}
