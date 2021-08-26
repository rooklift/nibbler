"use strict";

// Rate limit strategy - thanks to Sopel:
//
// .running holds the item in-flight.
// .pending holds a single item to send after.
//
// Note: Don't store the retrieved info in the node.table, because the logic
// there is already a bit convoluted with __touched, __ghost and whatnot (sadly).

function NewLooker() {
	let looker = Object.create(null);
	looker.running = null;
	looker.pending = null;
	looker.all_dbs = Object.create(null);
	Object.assign(looker, looker_props);
	return looker;
}

let looker_props = {

	clear_queue: function() {
		this.running = null;
		this.pending = null;
	},

	add_to_queue: function(board) {
		if (!this.running) {
			this.running = {board};				// Embed in an object so different queries can always be told apart.
			this.send_query(this.running);		// And send that object we just stored, not a new one.
		} else {
			this.pending = {board};				// As above.
		}
	},

	// It is ESSENTIAL that every call to send_query() eventually generates a call to query_complete()
	// so that the item gets removed from the queue.

	send_query: function(query) {

		if (!config.looker_api || !query.board.normalchess || this.lookup(config.looker_api, query.board)) {
			this.query_complete(query);
			return;
		}

		switch (config.looker_api) {
			case "chessdbcn":
				this.query_chessdbcn(query);
				break;
			default:
				this.query_complete(query);
				break;
		}
	},

	query_complete: function(query) {

		if (!query) {
			throw new Error("query_complete requires query arg");
		}

		if (this.running !== query) {
			return;
		}

		this.running = this.pending;
		this.pending = null;

		if (this.running) {
			this.send_query(this.running);
		}
	},

	lookup: function(db_name, board) {

		if (typeof db_name !== "string" || !this.all_dbs[db_name]) {
			return null;
		}

		let ret = this.all_dbs[db_name][board.fen()];

		if (!ret) {
			return null;
		}

		return ret;

	},

	// --------------------------------------------------------------------------------------------
	// chessdb.cn

	query_chessdbcn: function(query) {

		let board = query.board;

		let friendly_fen = board.fen(true);
		let fen_for_web = ReplaceAll(friendly_fen, " ", "%20");

		let url = `http://www.chessdb.cn/cdb.php?action=queryall&board=${fen_for_web}`;

		fetch(url).then(response => {
			if (!response.ok) {
				throw new Error("response.ok was false");
			}
			return response.text();
		}).then(text => {
			this.handle_chessdbcn_text(query, text);
			this.query_complete(query);
		}).catch(error => {
			console.log("Fetch failed:", error);
			this.query_complete(query);
		});

	},

	handle_chessdbcn_text: function(query, text) {

		let board = query.board;
		let fen = board.fen();

		// Get the correct DB, creating it if needed...

		let db = this.all_dbs["chessdbcn"];
		if (!db) {
			db = Object.create(null);
			this.all_dbs["chessdbcn"] = db;
		}

		// Create or recreate the info object. Recreation ensures that the infobox drawer can
		// tell that it's a new object if it changes (and a redraw is needed).

		let o = Object.create(null);
		db[fen] = o;

		// Parse the data...
		// Data is | separated list of entries such as      move:d4e5,score:51,rank:2,note:! (27-00),winrate:53.86

		if (text.endsWith("\0")) {									// text tends to end with a NUL character.
			text = text.slice(0, -1);
		}

		let entries = text.split("|");

		for (let entry of entries) {

			let move = null;
			let val = null;
			let subentries = entry.split(",");

			for (let sub of subentries) {

				sub = sub.trim();

				if (sub.startsWith("move:")) {
					move = sub.split(":")[1].trim();
					move = board.c960_castling_converter(move);		// Ensure castling is e1h1 etc
				}

				if (sub.startsWith("score:")) {
					val = parseInt(sub.split(":")[1].trim(), 10);
					if (Number.isNaN(val)) {
						val = null;
					} else {
						val /= 100;
					}
				}
			}

			if (move && typeof val === "number") {
				o[move] = val;
			}
		}

		// Note that even if we get no info, we still leave the empty object o in the database,
		// and this allows us to know that we've done this search already.
	}

};
