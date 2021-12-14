"use strict";

// Rate limit strategy - thanks to Sopel:
//
// .running holds the item in-flight.
// .pending holds a single item to send after.
//
// Note: Don't store the retrieved info in the node.table, because the logic
// there is already a bit convoluted with __touched, __ghost and whatnot (sadly).
//
// Note: format of entries in the DB is {type: "foo", moves: {}}
// where moves is a map of string --> something

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

		if (!config.looker_api || !board.normalchess) {
			return;
		}

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

		if (!config.looker_api || this.lookup(config.looker_api, query.board)) {
			this.query_complete(query);
			return;
		}

		switch (config.looker_api) {
			case "chessdbcn":
				this.query_chessdbcn(query);
				break;
			case "lichess_masters":
				this.query_lichess_masters(query);
				break;
			default:
				this.query_complete(query);
				break;
		}
	},

	query_complete: function(query) {

		if (!query) {
			throw "query_complete requires query arg";
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

	get_db: function(db_name) {			// Creates it if needed.

		if (typeof db_name !== "string") {
			return null;
		}

		if (!this.all_dbs[db_name]) {
			this.all_dbs[db_name] = Object.create(null);
		}

		return this.all_dbs[db_name];
	},

	lookup: function(db_name, board) {

		// When repeatedly called with the same params, this should
		// return the same object (unless it changes of course).

		let db = this.get_db(db_name);
		if (db) {						// Remember get_db() can return null.
			let ret = db[board.fen()];
			if (ret) {
				return ret;
			}
		}
		return null;					// I guess we tend to like null over undefined. (Bad habit?)
	},

	// --------------------------------------------------------------------------------------------
	// lichess masters

	query_lichess_masters: function(query) {

		let board = query.board;

		let friendly_fen = board.fen(true);
		let fen_for_web = ReplaceAll(friendly_fen, " ", "%20");

		let url = `http://explorer.lichess.ovh/masters?variant=standard&fen=${fen_for_web}`;

		fetch(url).then(response => {
			if (!response.ok) {
				throw "response.ok was false";
			}
			return response.json();
		}).then(raw_object => {
			this.handle_lichess_masters_object(query, raw_object);
			this.query_complete(query);
		}).catch(error => {
			console.log("Fetch failed:", error);
			this.query_complete(query);
		});

	},

	handle_lichess_masters_object(query, raw_object) {

		if (typeof raw_object !== "object" || raw_object === null || Array.isArray(raw_object.moves) === false) {
			console.log("Invalid object...");
			console.log(raw_object);
			return;
		}

		let board = query.board;
		let fen = board.fen();

		let db = this.get_db("lichess_masters");

		let o = {type: "lichess_masters", moves: {}};
		db[fen] = o;

		for (let item of raw_object.moves) {

			let move = item.uci;
			move = board.c960_castling_converter(move);

			let move_object = Object.create(lichess_move_props);
			move_object.active = board.active;
			move_object.white = item.white;
			move_object.black = item.black;
			move_object.draws = item.draws;
			move_object.total = item.white + item.draws + item.black;

			o.moves[move] = move_object;
		}

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
				throw "response.ok was false";
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

		let db = this.get_db("chessdbcn");

		// Create or recreate the info object. Recreation ensures that the infobox drawer can
		// tell that it's a new object if it changes (and a redraw is needed).

		let o = {type: "chessdbcn", moves: {}};
		db[fen] = o;

		// Parse the data...
		// Data is | separated list of entries such as      move:d4e5,score:51,rank:2,note:! (27-00),winrate:53.86

		if (text.endsWith("\0")) {									// text tends to end with a NUL character.
			text = text.slice(0, -1);
		}

		let entries = text.split("|");

		for (let entry of entries) {

			let move = null;
			let score = null;
			let subentries = entry.split(",");

			for (let sub of subentries) {

				sub = sub.trim();

				if (sub.startsWith("move:")) {
					move = sub.split(":")[1].trim();
					move = board.c960_castling_converter(move);		// Ensure castling is e1h1 etc
				}

				if (sub.startsWith("score:")) {
					score = parseInt(sub.split(":")[1].trim(), 10);
					if (Number.isNaN(score)) {
						score = null;
					} else {
						score /= 100;
					}
				}
			}

			if (move && typeof score === "number") {

				let move_object = Object.create(chessdbcn_move_props);
				move_object.active = board.active;
				move_object.score = score;

				o.moves[move] = move_object;
			}
		}

		// Note that even if we get no info, we still leave the empty object o in the database,
		// and this allows us to know that we've done this search already.
	}

};



let chessdbcn_move_props = {	// The props for a single move in a chessdbcn object.

	text: function(pov) {		// pov can be null for current

		let score = this.score;

		if ((pov === "w" && this.active === "b") || (pov === "b" && this.active === "w")) {
			score = 0 - this.score;
		}

		let s = score.toFixed(2);
		if (s !== "0.00" && s[0] !== "-") {
			s = "+" + s;
		}

		return `API: ${s}`;
	},
};

let lichess_move_props = {		// The props for a single move in a lichess object.

	text: function(pov) {		// pov can be null for current

		let actual_pov = pov ? pov : this.active;
		let wins = actual_pov === "w" ? this.white : this.black;
		let ev = (wins + (this.draws / 2)) / this.total;

		return `API: ${(ev * 100).toFixed(1)}% [${NString(this.total)}]`;
	},

};

