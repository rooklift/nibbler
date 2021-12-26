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
// where moves is a map of string --> object

function NewLooker() {
	let looker = Object.create(null);
	looker.running = null;
	looker.pending = null;
	looker.all_dbs = Object.create(null);
	looker.last_send_time = 0;
	looker.bans = Object.create(null);			// db --> time of last rate-limit
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

		let query = {							// Since queries are objects, different queries can always be told apart.
			board: board,
			db_name: config.looker_api
		};

		if (!this.running) {							
			this.send_query(query);
		} else {
			this.pending = query;
		}
	},

	send_query: function(query) {

		this.running = query;

		// It is ESSENTIAL that every call to send_query() eventually generates a call to query_complete()
		// so that the item gets removed from the queue. While we don't really need to use promises, doing
		// it as follows lets me just have a single place where query_complete() is called. I guess.

		this.query_api(query).catch(error => {
			console.log("Query failed:", error);
		}).finally(() => {
			this.query_complete(query);
		});
	},

	query_complete: function(query) {

		if (this.running !== query) {			// Possible if clear_queue() was called.
			return;
		}

		let next_query = this.pending;

		this.running = null;
		this.pending = null;

		if (next_query) {
			this.send_query(next_query);
		}
	},

	get_db: function(db_name) {					// Creates it if needed.

		if (typeof db_name !== "string") {
			return null;
		}

		if (!this.all_dbs[db_name]) {
			this.all_dbs[db_name] = Object.create(null);
		}

		return this.all_dbs[db_name];
	},

	new_entry: function(db_name, board) {		// Creates a new (empty) entry in the database (to be populated elsewhere) and returns it.

		let entry = {
			type: db_name,
			moves: {},
		};

		let db = this.get_db(db_name);
		db[board.fen()] = entry;
		return entry;
	},

	lookup: function(db_name, board) {

		// Return the full entry for a position. When repeatedly called with the same params, this should
		// return the same object (unless it changes of course). Returns null if not available.

		let db = this.get_db(db_name);
		if (db) {								// Remember get_db() can return null.
			let ret = db[board.fen()];
			if (ret) {
				return ret;
			}
		}
		return null;							// I guess we tend to like null over undefined. (Bad habit?)
	},

	set_ban: function(db_name) {
		this.bans[db_name] = performance.now();
	},

	query_api(query) {		// Returns a promise, which is solely used by the caller to attach some cleanup catch/finally()

		if (this.lookup(query.db_name, query.board)) {							// We already have a result for this board.
			return Promise.resolve();											// Consider this case a satisfactory result.
		}

		if (this.bans[query.db_name]) {
			if (performance.now() - this.bans[query.db_name] < 60000) {			// No requests within 1 minute of the ban.
				return Promise.resolve();										// Consider this case a satisfactory result.
			}
		}

		let friendly_fen = query.board.fen(true);
		let fen_for_web = ReplaceAll(friendly_fen, " ", "%20");

		let url;

		if (query.db_name === "chessdbcn") {
			url = `http://www.chessdb.cn/cdb.php?action=queryall&json=1&board=${fen_for_web}`;
		} else if (query.db_name === "lichess_masters") {
			url = `http://explorer.lichess.ovh/masters?topGames=0&fen=${fen_for_web}`;
		} else if (query.db_name === "lichess_plebs") {
			url = `http://explorer.lichess.ovh/lichess?variant=standard&topGames=0&recentGames=0&fen=${fen_for_web}`;
		} else {
			return Promise.reject(new Error("Bad db_name"));
		}

		return Delay(this.last_send_time + 1000 - performance.now()).then(() => {
			this.last_send_time = performance.now();
			return fetch(url);
		}).then(response => {
			if (response.status === 429) {										// rate limit hit
				this.set_ban(query.db_name);
				throw new Error("rate limited");
			}
			if (!response.ok) {													// ok means status in range 200-299
				throw new Error("response.ok was false");
			}
			return response.json();
		}).then(raw_object => {
			this.handle_response_object(query, raw_object);
		});
	},

	handle_response_object: function(query, raw_object) {

		let board = query.board;
		let o = this.new_entry(query.db_name, board);

		// If the raw_object is invalid, now's the time to return - after the empty object
		// has been stored in the database, so we don't do this lookup again.

		if (typeof raw_object !== "object" || raw_object === null || Array.isArray(raw_object.moves) === false) {
			return;			// This can happen e.g. if the position is checkmate.
		}

		// Our Lichess moves need to know the total number of games so they can return valid stats.
		// While the total is available as raw_object.white + raw_object.black + raw_object.draws,
		// it's probably better to sum up the items that we're given.

		let lichess_position_total = 0;

		if (query.db_name === "lichess_masters" || query.db_name === "lichess_plebs") {
			for (let raw_item of raw_object.moves) {
				lichess_position_total += raw_item.white + raw_item.black + raw_item.draws;
			}
		}

		// Now add moves to the entry...

		for (let raw_item of raw_object.moves) {

			let move = raw_item.uci;
			move = board.c960_castling_converter(move);

			if (query.db_name === "chessdbcn") {
				o.moves[move] = new_chessdbcn_move(board, raw_item);
			} else if (query.db_name === "lichess_masters" || query.db_name === "lichess_plebs") {
				o.moves[move] = new_lichess_move(board, raw_item, lichess_position_total);
			}
		}

		// Note that even if we get no info, we still leave the empty object o in the database,
		// and this allows us to know that we've done this search already.
	},
};


// Below are some functions which use the info a server sends about a single move to create our
// own object containing just what we need (and with a prototype containing some useful methods).


function new_chessdbcn_move(board, raw_item) {			// The object with info about a single move in a chessdbcn object.
	let ret = Object.create(chessdbcn_move_props);
	ret.active = board.active;
	ret.score = raw_item.score / 100;
	return ret;
}

let chessdbcn_move_props = {

	text: function(pov) {								// pov can be null for current

		let score = this.score;

		if ((pov === "w" && this.active === "b") || (pov === "b" && this.active === "w")) {
			score = 0 - this.score;
		}

		let s = score.toFixed(2);
		if (s !== "0.00" && s[0] !== "-") {
			s = "+" + s;
		}

		return `API: <span class="blue">${s}</span>`;
	},

	sort_score: function() {
		return this.score;
	},
};

function new_lichess_move(board, raw_item, position_total) {		// The object with info about a single move in a lichess object.
	let ret = Object.create(lichess_move_props);
	ret.active = board.active;
	ret.white = raw_item.white;
	ret.black = raw_item.black;
	ret.draws = raw_item.draws;
	ret.total = raw_item.white + raw_item.draws + raw_item.black;
	ret.position_total = position_total;
	return ret;
}

let lichess_move_props = {

	text: function(pov) {								// pov can be null for current

		let actual_pov = pov ? pov : this.active;
		let wins = actual_pov === "w" ? this.white : this.black;
		let ev = (wins + (this.draws / 2)) / this.total;

		let win_string = (ev * 100).toFixed(1);
		let weight_string = (100 * this.total / this.position_total).toFixed(0);

		return `API win: <span class="blue">${win_string}%</span> freq: <span class="blue">${weight_string}%</span> [${NString(this.total)}]`;
	},

	sort_score: function() {
		return this.total;
	},
};


// The classic Promise example, with an actual use in our code...


function Delay(ms) {

	if (typeof ms !== "number" || ms <= 0) {
		return Promise.resolve();
	}

	return new Promise((resolve, reject) => {
		setTimeout(() => {
			resolve();
		}, ms);
	});
}
