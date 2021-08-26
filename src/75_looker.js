"use strict";

function NewLooker() {
	let looker = Object.create(null);
	looker.all_dbs = Object.create(null);
	Object.assign(looker, looker_props);
	return looker;
}

let looker_props = {

	lookup_chessdbcn(board) {
		if (!this.all_dbs["chessdbcn"]) {
			return null;
		}
		if (!this.all_dbs["chessdbcn"][board.fen()]) {
			return null;
		}
		return this.all_dbs["chessdbcn"][board.fen()];
	},

	query_chessdbcn(board) {

		if (!board.normalchess) {				// Do nothing for Chess960 positions.
			return;
		}

		if (this.lookup_chessdbcn(board)) {		// Do we already have this position?
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

	handle_chessdbcn_text(board, text) {

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

		if (text.endsWith("\0")) {				// text tends to end with a NUL character.
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
