"use strict";

function NewLooker() {
	let looker = Object.create(null);
	looker.all_dbs = Object.create(null);
	Object.assign(looker, looker_props);
	return looker;
}

let looker_props = {

	position_changed: function(board) {

		switch (config.looker_api) {
			case "chessdbcn":
				this.query_chessdbcn(board);
				break;
			default:
				break;
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
			return;
		}

		if (this.lookup("chessdbcn", board)) {		// Do we already have this position?
			console.log("Skipping");
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
		}).catch(error => {
			console.log("Fetch failed:", error);
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
		// Data is | separated list of entries such as   move:d4e5,score:51,rank:2,note:! (27-00),winrate:53.86

		if (text.endsWith("\0")) {									// text tends to end with a NUL character.
			text = text.slice(0, -1);
		}

		let entries = text.split("|");

		for (let entry of entries) {
			let move = "";
			let val = "";
			let subentries = entry.split(",");
			for (let sub of subentries) {
				sub = sub.trim();
				if (sub.startsWith("move:")) {
					move = sub.split(":")[1].trim();
					move = board.c960_castling_converter(move);		// Ensure castling is e1h1 etc
				}
				if (sub.startsWith("score:")) {
					val = sub.split(":")[1].trim();
				}
			}
			if (move && val) {
				o[move] = val;
			}
		}
	}

};
