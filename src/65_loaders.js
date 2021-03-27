"use strict";

// Non-blocking loader objects.
// Currently just for books; we can dream about normal PGN files.

function NewPolyglotBookLoader(hub) {

	let loader = Object.create(null);
	loader.type = "book";
	loader.running = false;
	loader.hub = hub;
	loader.starttime = performance.now();

	loader.book = [];
	loader.book.type = "polyglot";
	loader.book_is_sorted = true;
	loader.buf = null;
	loader.n = 0;

	loader.load = function(filename) {
		try {
			this.buf = fs.readFileSync(filename);
		} catch (err) {
			this.abort();
			return;
		}
		this.running = true;
		this.continue();
	};

	loader.abort = function() {
		this.running = false;
		this.buf = null;			// For the GC's benefit
		this.book = null;			// For the GC's benefit
		this.hub.set_special_message(`Book load failed or was aborted.`);
	};

	loader.continue = function() {

		if (!this.running) {
			return;
		}

		let continuetime = performance.now();

		while (true) {

			if (this.n > this.buf.length - 16) {
				this.finish();
				return;
			}

			let slice = this.buf.slice(this.n, this.n + 16);
			let o = ExtractInfo(slice);
			if (this.n > 0 && o.key < this.book[this.book.length - 1].key) {
				this.book_is_sorted = false;
			}
			this.book.push(o);

			this.n += 16;

			if (this.n % 16000 === 0) {
				if (performance.now() - continuetime > 20) {
					this.hub.set_special_message(`Loading... ${(100 * (this.n / this.buf.length)).toFixed(0)}%`);
					setTimeout(() => {this.continue()}, 5);
					return;
				}
			}
		}
	};

	loader.finish = function() {
		this.running = false;
		this.buf = null;
		if (this.book) {
			console.log("Polyglot book was pre-sorted?", this.book_is_sorted);
			if (!this.book_is_sorted) {
				SortPolyglotBook(this.book);
			}
			this.hub.book = this.book;
			this.hub.explorer_objects_cache = null;
			this.hub.send_ack_book();
			this.hub.set_special_message(`Finished loading book (moves: ${this.book.length})`, "green");
		}
		console.log(`Polyglot book load ended after ${(performance.now() - this.starttime).toFixed(0)} ms.`);
		this.book = null;
	};

	return loader;
}

// ------------------------------------------------------------------------------------------------------------------------------

function NewPGNBookLoader(hub) {

	let loader = Object.create(null);
	loader.type = "book";
	loader.running = false;
	loader.hub = hub;
	loader.starttime = performance.now();

	loader.book = [];
	loader.book.type = "pgn";
	loader.pgn_choices = null;
	loader.error_flag = false;
	loader.buf = null;
	loader.n = 0;

	loader.load = function(filename) {
		try {
			this.buf = fs.readFileSync(filename);
		} catch (err) {
			this.abort();
			return;
		}
		this.running = true;
		this.continue();
	};

	loader.abort = function() {
		this.running = false;
		this.buf = null;			// For the GC's benefit
		this.book = null;			// For the GC's benefit
		this.hub.set_special_message(`Book load failed or was aborted.`);
	};

	loader.continue = function() {

		if (!this.running) {
			return;
		}

		let continuetime = performance.now();

		if (!this.pgn_choices) {
			this.pgn_choices = PreParsePGN(this.buf);
		}

		while (true) {

			if (this.n >= this.pgn_choices.length) {
				this.finish();
				return;
			}

			let o = this.pgn_choices[this.n];

			try {
				let root = LoadPGNRecord(o);					// Note that this calls DestroyTree() itself if needed.
				this.book = AddTreeToBook(root, this.book);
				DestroyTree(root);
			} catch (err) {
				this.error_flag = true;
			}

			this.n++;

			if (this.n % 100 === 0) {
				if (performance.now() - continuetime > 20) {
					this.hub.set_special_message(`Loading... ${(100 * (this.n / this.pgn_choices.length)).toFixed(0)}%`);
					setTimeout(() => {this.continue()}, 5);
					return;
				}
			}
		}
	};

	loader.finish = function() {
		this.running = false;
		this.buf = null;
		if (this.book) {
			SortAndDeclutter(this.book);
			this.hub.book = this.book;
			this.hub.explorer_objects_cache = null;
			this.hub.send_ack_book();
			if (this.error_flag) {
				this.hub.set_special_message("Finished loading book (some errors occurred)", "yellow");
			} else {
				this.hub.set_special_message(`Finished loading book (moves: ${this.book.length})`, "green");
			}
		}
		console.log(`PGN book load ended after ${(performance.now() - this.starttime).toFixed(0)} ms.`);
		this.book = null;
	};

	return loader;
}
