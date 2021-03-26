"use strict";

function NewPolyglotBookLoader(hub) {

	let loader = Object.create(null);
	loader.type = "polyglot";
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

	loader.finish = function() {
		this.running = false;
		this.buf = null;
		if (this.book) {
			if (!this.book_is_sorted) {
				this.book.sort((a, b) => {
					if (a.key < b.key) return -1;
					if (a.key > b.key) return 1;
					return 0;
				});
				this.book_is_sorted = true;
			}
			this.hub.book = this.book;
			this.hub.send_ack_book();
			this.hub.set_special_message(`Finished loading book (moves: ${this.book.length})`, "green");
		} else {
			this.hub.set_special_message(`Book load failed or was aborted.`);
		}
		console.log(`Polyglot book load ended after ${performance.now() - this.starttime} ms.`);
		this.book = null;
	};

	loader.abort = function() {
		this.book = null;
		this.finish();
	};

	loader.continue = function() {

		if (!this.buf || !this.book) {
			return;
		}

		let starttime = performance.now();

		while (true) {

			if (this.n > this.buf.length - 16) {
				this.finish();
				return;
			}

			let slice = Uint8Array.from(this.buf.slice(this.n, this.n + 16));
			let o = ExtractInfo(slice);
			if (this.n > 0 && o.key < this.book[this.book.length - 1]) {
				this.book_is_sorted = false;
			}
			this.book.push(o);

			this.n += 16;

			if (this.n % 1000 === 0) {
				if (performance.now() - starttime > 10) {
					this.hub.set_special_message(`Loading... ${(100 * (this.n / this.buf.length)).toFixed(0)}%`);
					setTimeout(() => {this.continue()}, 0);
					return;
				}
			}
		}
	};

	return loader;
}
