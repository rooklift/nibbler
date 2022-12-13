"use strict";

// Non-blocking loader objects.
//
// Implementation rule: The callback property is non-null iff it's still possible that the load will succeed.
// If callback === null this implies that shutdown() has already been called at least once.
//
// Also, every loader starts itself via setTimeout so that the caller can finish whatever it was doing first.
// This prevents some weird inconsistency with order-of-events (whether it matters I don't know).
// ------------------------------------------------------------------------------------------------------------------------------

function NewFastPGNLoader(foo, callback) {

	// foo is allowed to be filepath or Buffer

	if (typeof foo !== "string" && foo instanceof Buffer === false) {
		throw "NewFastPGNLoader() bad call";
	}

	let loader = Object.create(null);
	loader.type = "pgn";
	loader.starttime = performance.now();

	loader.callback = callback;
	loader.msg = "Loading PGN...";
	loader.buf = null;
	loader.indices = [];

	loader.off = 0;
	loader.phase = 1;
	loader.search = Buffer.from("\n\n[");
	loader.fix = 2;										// Where the [ char will be

	loader.shutdown = function() {
		this.callback = null;
		this.msg = "";
		this.buf = null;
		this.indices = null;
	};

	loader.load = function(foo) {
		if (this.callback) {
			if (foo instanceof Buffer) {
				this.buf = foo;
				this.continue();
			} else {
				fs.readFile(foo, (err, data) => {
					if (this.callback) {				// Must test again, because this is later.
						if (err) {
							let cb = this.callback; cb(err, null);
							this.shutdown();
						} else {
							this.buf = data;
							this.continue();
						}
					}
				});
			}
		}
	};

	loader.continue = function() {

		if (!this.callback) {
			return;
		}

		if (this.indices.length === 0 && this.buf.length > 0) {
			this.indices.push(0);
		}

		let continuetime = performance.now();

		while (true) {

			let index = this.buf.indexOf(this.search, this.off);

			if (index === -1) {
				if (this.phase === 1) {
					this.phase = 2;
					this.search = Buffer.from("\n\r\n[");
					this.fix = 3;
					this.off = 0;
					continue;
				} else {
					break;
				}
			}

			this.indices.push(index + this.fix);
			this.off = index + 1;

			if (this.indices.length % 100 === 0) {
				if (performance.now() - continuetime > 10) {
					this.msg = `Loading PGN... ${this.indices.length} games`;
					setTimeout(() => {this.continue();}, 10);
					return;
				}
			}
		}

		// Once, after the while loop is broken...

		this.indices.sort((a, b) => a - b);

		let ret = new_pgndata(this.buf, this.indices);
		let cb = this.callback; cb(null, ret);
		this.shutdown();
	};

	setTimeout(() => {loader.load(foo);}, 0);
	return loader;
}

// ------------------------------------------------------------------------------------------------------------------------------

function NewPolyglotBookLoader(filename, callback) {

	let loader = Object.create(null);
	loader.type = "book";
	loader.starttime = performance.now();

	loader.callback = callback;
	loader.msg = "Loading book...";

	loader.shutdown = function() {
		this.callback = null;
		this.msg = "";
	};

	loader.load = function(filename) {
		if (this.callback) {
			fs.readFile(filename, (err, data) => {
				if (this.callback) {					// Must test again, because this is later.
					if (err) {
						let cb = this.callback; cb(err, null);
						this.shutdown();
					} else {
						let cb = this.callback; cb(null, data);
						this.shutdown();
					}
				}
			});
		}
	};

	setTimeout(() => {loader.load(filename);}, 0);
	return loader;
}

// ------------------------------------------------------------------------------------------------------------------------------

function NewPGNBookLoader(filename, callback) {

	let loader = Object.create(null);
	loader.type = "book";
	loader.starttime = performance.now();

	loader.callback = callback;
	loader.msg = "Loading book...";
	loader.buf = null;
	loader.book = [];
	loader.pgndata = null;
	loader.fastloader = null;

	loader.n = 0;

	loader.shutdown = function() {
		this.callback = null;
		this.msg = "";
		this.buf = null;
		this.book = null;
		this.pgndata = null;
		if (this.fastloader) {
			this.fastloader.shutdown();
			this.fastloader = null;
		}
	};

	loader.load = function(filename) {
		if (this.callback) {
			this.fastloader = NewFastPGNLoader(filename, (err, pgndata) => {
				if (this.callback) {					// Must test again, because this is later.
					if (err) {
						let cb = this.callback; cb(err, null);
						this.shutdown();
					} else {
						this.pgndata = pgndata;
						this.continue();
					}
				}
			});
		}
	};

	loader.continue = function() {

		if (!this.callback) {
			return;
		}

		let continuetime = performance.now();
		let count = this.pgndata.count();

		while (true) {

			if (this.n >= count) {
				break;
			}

			let o = this.pgndata.getrecord(this.n++);

			try {
				let root = LoadPGNRecord(o);					// Note that this calls DestroyTree() itself if it must throw.
				this.book = AddTreeToBook(root, this.book);
				DestroyTree(root);
			} catch (err) {
				//
			}

			if (performance.now() - continuetime > 10) {
				this.msg = `Loading book... ${(100 * (this.n / count)).toFixed(0)}%`;
				setTimeout(() => {this.continue();}, 10);
				return;
			}
		}

		// Once, after the while loop is broken...

		SortAndDeclutterPGNBook(this.book);
		let ret = this.book;						// Just in case I ever replace the direct cb() with a setTimeout (shutdown would cause this.book to be null).
		let cb = this.callback; cb(null, ret);
		this.shutdown();
	};

	setTimeout(() => {loader.load(filename);}, 0);
	return loader;
}
