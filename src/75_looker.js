"use strict";

// Rate limit strategy - thanks to Sopel:
//
// Have a length-2 queue [item 0, item 1].
// Item 0 (if present) is in-flight.
// Item 1 (if present) is only allowed to start when item 0 concludes.
// If the queue is full, item 1 gets replaced if a new call to position_changed() happens.

function NewLooker() {
	let looker = Object.create(null);
	looker.all_dbs = Object.create(null);
	looker.queue = [];
	Object.assign(looker, looker_props);
	return looker;
}

let looker_props = {

	position_changed: function(board) {

		if (this.queue.length === 0) {
			this.queue.push(board);
			this.send_query(board);
		} else if (this.queue.length === 1) {
			this.queue.push(board);
		} else {
			this.queue[1] = board;
		}
	},

	// It is ESSENTIAL that every call to send_query() eventually generates a call to register_query_complete()
	// so that the item gets removed from the queue.

	send_query: function(board) {

		switch (config.looker_api) {
			case "chessdbcn":
				this.query_chessdbcn(board);
				break;
			default:
				this.register_query_complete();
				break;
		}
	},

	register_query_complete: function() {
		this.queue = this.queue.slice(1);
		if (this.queue.length > 0) {
			this.send_query(this.queue[0]);
		}
	},

	lookup: function(db_name, board) {

		if (typeof db_name !== "string") {
			return null;
		}
		if (!this.all_dbs[db_name]) {
			return null;
		}
		if (!this.all_dbs[db_name][board.fen()]) {
			return null;
		}
		return this.all_dbs[db_name][board.fen()];

	},

	// --------------------------------------------------------------------------------------------
	// chessdb.cn

	query_chessdbcn: function(board) {

		if (!board.normalchess) {					// Do nothing for Chess960 positions.
			this.register_query_complete();
			return;
		}

		if (this.lookup("chessdbcn", board)) {		// Do we already have this position?
			this.register_query_complete();
			return;
		}

		let friendly_fen = board.fen(true);
		let fen_for_web = ReplaceAll(friendly_fen, " ", "%20");

		let url = `http://www.chessdb.cn/cdb.php?action=queryall&board=${fen_for_web}`;

		fetch(url).then(response => {
			if (!response.ok) {
				throw new Error("response.ok was false");
			}
			return response.text();
		}).then(text => {
			this.handle_chessdbcn_text(board, text);
			this.register_query_complete();
		}).catch(error => {
			console.log("Fetch failed:", error);
			this.register_query_complete();
		});

	},

	handle_chessdbcn_text: function(board, text) {

		let fen = board.fen();

		// Get the correct DB, creating it if needed...

		let db = this.all_dbs["chessdbcn"];
		if (!db) {
			db = Object.create(null);
			this.all_dbs["chessdbcn"] = db;
		}

		// Get the correct info object, creating it if needed...

		let o = db[fen];
		if (!o) {
			o = Object.create(null);
			db[fen] = o;
		}

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
						if (val < 0) {
							val = (val / 100).toFixed(2);
						} else if (val > 0) {
							val = "+" + (val / 100).toFixed(2);
						} else {
							val = "0.00";
						}
					}
				}
			}

			if (move && val) {
				o[move] = val;
			}
		}
	}

};
