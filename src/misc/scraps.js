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
