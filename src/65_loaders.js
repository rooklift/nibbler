"use strict";

// Non-blocking loader objects. The callback is only called if data is successfully gathered.
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
	loader.search = "\n\n[";
	loader.fix = 2;				// Where the [ char will be

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
				if (this.search === "\n\n[") {
					this.search = "\n\r\n[";
					this.fix = 3;
					this.off = 0;
					continue;
				} else {
					break
				}
			}

			this.indices.push(index + this.fix);
			this.off = index + 1;

			if (this.indices.length % 1000 === 0) {
				if (performance.now() - continuetime > 20) {
					this.msg = `Loading PGN... ${this.indices.length} games`;
					setTimeout(() => {this.continue();}, 20);
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

	loader.filename = filename;
	loader.n = 0;

	loader.shutdown = function() {					// Some of this is potentially to the GC's benefit? Who knows.
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

	loader.continue = function() {

		if (!this.callback) {
			return;
		}

		if (!this.fastloader) {
			this.fastloader = NewFastPGNLoader(this.filename, (err, pgndata) => {
				if (this.callback) {
					if (err) {
						let cb = this.callback; cb(err, null);
						this.shutdown();
					} else {
						this.pgndata = pgndata;
					}
				}
			});
		}

		if (!this.pgndata) {
			this.msg = this.fastloader.msg;
			setTimeout(() => {this.continue();}, 20);
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
				let root = LoadPGNRecord(o);					// Note that this calls DestroyTree() itself if needed.
				this.book = AddTreeToBook(root, this.book);
				DestroyTree(root);
			} catch (err) {
				//
			}

			if (this.n % 100 === 0) {
				if (performance.now() - continuetime > 20) {
					this.msg = `Loading book... ${(100 * (this.n / count)).toFixed(0)}%`;
					setTimeout(() => {this.continue();}, 20);
					return;
				}
			}
		}

		// Once, after the while loop is broken...

		SortAndDeclutterPGNBook(this.book);
		let cb = this.callback; cb(null, this.book);
		this.shutdown();
	};

	setTimeout(() => {loader.continue();}, 0);
	return loader;
}
