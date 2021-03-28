"use strict";

// Non-blocking loader objects. Currently just for books.
// ------------------------------------------------------------------------------------------------------------------------------

function NewPolyglotBookLoader(hub) {

	// In 2.0.1 this was vastly more complex, then I realised one can "simply"
	// use the raw buffer as the book.

	let loader = Object.create(null);
	loader.type = "book";

	loader.hub = hub;
	loader.aborted = false;
	loader.starttime = performance.now();

	loader.load = function(filename) {
		fs.readFile(filename, (err, data) => {		// If no encoding is specified, then the raw buffer is returned.
			if (err) {
				console.log(err);
				return;
			}
			if (this.aborted) {
				return;
			}
			this.hub.book = data;
			this.hub.explorer_objects_cache = null;
			this.hub.send_ack_book();
			this.hub.set_special_message(`Finished loading book (moves: ${Math.floor(data.length / 16)})`, "green");
			console.log(`Polyglot book load ended after ${(performance.now() - this.starttime).toFixed(0)} ms.`);
		});
	};

	loader.abort = function() {
		this.aborted = true;
		this.hub.set_special_message(`Book load failed or was aborted.`);
	};

	return loader;
}

// ------------------------------------------------------------------------------------------------------------------------------

function NewPGNBookLoader(hub) {

	let loader = Object.create(null);
	loader.type = "book";

	loader.hub = hub;
	loader.can_continue = false;
	loader.starttime = performance.now();
	loader.book = [];
	loader.pgn_choices = null;
	loader.error_flag = false;
	loader.buf = null;
	loader.n = 0;

	loader.load = function(filename) {
		fs.readFile(filename, (err, data) => {
			if (err) {
				this.hub.set_special_message(`Book load failed or was aborted.`);
				return;
			}
			this.buf = data;
			this.can_continue = true;
			this.continue();
		});
	};

	loader.abort = function() {
		this.can_continue = false;
		this.buf = null;			// For the GC's benefit
		this.book = null;			// For the GC's benefit
		this.hub.set_special_message(`Book load failed or was aborted.`);
	};

	loader.continue = function() {

		if (!this.can_continue) {
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
					setTimeout(() => {this.continue();}, 5);
					return;
				}
			}
		}
	};

	loader.finish = function() {
		this.can_continue = false;
		this.buf = null;
		if (this.book) {
			SortAndDeclutterPGNBook(this.book);
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
