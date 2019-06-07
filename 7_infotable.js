"use strict";

function new_info(board, move) {

	return {
		board: board,
		cp: -999999,
		move: move,
		multipv: 999,
		n: 0,				// The draw logic will only ever draw things with non-negative n, so make this 0
		p: "?",
		pv: [],
		nice_pv_cache: null,
		// nice_pv_string_cache: null,		// Can't have this because the pv_string changes as the sort order does.
		winrate: null,

		nice_pv: function() {

			// Human readable moves. Since there's no real guarantee that our
			// moves list is legal, we legality check them. We at least know
			// the initial move is legal, since it's checked on receipt.

			if (this.nice_pv_cache) {
				return this.nice_pv_cache;
			}

			let tmp_board = this.board;

			if (!this.pv || this.pv.length === 0) {
				return [tmp_board.nice_string(this.move)];
			}

			let ret = [];

			for (let move of this.pv) {
				if (tmp_board.illegal(move) !== "") {
					break;
				}
				ret.push(tmp_board.nice_string(move));
				tmp_board = tmp_board.move(move);
			}

			this.nice_pv_cache = ret;
			return this.nice_pv_cache;
		},

		nice_pv_string: function(options, i) {

			// The caller should ensure that i is unique for each move in the moves list,
			// then we can use i to ensure that each move has a unique way of calling
			// renderer.pv_click().

			let nice_pv_list = this.nice_pv();

			let blobs = [];

			// -------------------------------------------------

			if (options.show_winrate) {

				let winrate_string = "?";
				if (typeof this.winrate === "number") {
					winrate_string = this.winrate.toString().slice(0, 5);
					if (winrate_string[1] === ".") {
						winrate_string = winrate_string.slice(1);
					}
					if (winrate_string !== "1" && winrate_string !== "0") {
						while (winrate_string.length < 4) {
							winrate_string += "0";
						}
					}
				}

				blobs.push(`<span class="blue">${winrate_string}</span>`);
			}

			// -------------------------------------------------

			let colour = this.board.active;

			let n = 0;
			for (let move of nice_pv_list) {

				if (colour === "w") {
					blobs.push(`<span class="white" onclick="javascript:renderer.pv_click(${i}, ${n++});">${move}</span>`);
				} else {
					blobs.push(`<span class="pink" onclick="javascript:renderer.pv_click(${i}, ${n++});">${move}</span>`);
				}

				colour = OppositeColour(colour);
			}

			// -------------------------------------------------

			if (options.show_n || options.show_p) {
				
				let tech_elements = [];

				if (options.show_n) {
					tech_elements.push(`N: ${this.n.toString()}`);
				}

				if (options.show_p) {
					tech_elements.push(`P: ${this.p}`);
				}

				blobs.push(`<span class="blue">(${tech_elements.join(" ")})</span>`);
			}

			return blobs.join(" ");
		}
	};
}

function NewInfoTable() {			// There's only ever going to be one of these made I guess.

	return {

		table: Object.create(null),
	
		clear: function() {
			this.table = Object.create(null);
		},

		receive: function(s, board) {

			// Although the renderer tries to avoid sending invalid moves by
			// syncing with "isready" "readyok" an engine like Stockfish doesn't
			// behave properly, IMO. So we use the board to check legality.

			if (s.startsWith("info") && s.indexOf(" pv ") !== -1) {

				// info depth 13 seldepth 48 time 5603 nodes 67686 score cp 40 hashfull 204 nps 12080 tbhits 0 multipv 2
				// pv d2d4 g8f6 c2c4 e7e6 g2g3 f8b4 c1d2 b4e7 g1f3 e8g8 d1c2 a7a6 f1g2 b7b5 e1g1 c8b7 f1c1 b7e4 c2d1 b5c4 c1c4 a6a5 d2e1 h7h6 c4c1 d7d6

				let move = InfoVal(s, "pv");
				let move_info;

				if (this.table[move]) {						// We already have move info for this move.
					move_info = this.table[move];
				} else {									// We don't.
					if (board.illegal(move) !== "") {
						Log(`... Nibbler: invalid move received!: ${move}`);
						return;
					}
					move_info = new_info(board, move);
					this.table[move] = move_info;
				}

				let tmp;

				tmp = parseInt(InfoVal(s, "cp"), 10);		// Score in centipawns
				if (Number.isNaN(tmp) === false) {
					move_info.cp = tmp;				
				}

				tmp = parseInt(InfoVal(s, "multipv"), 10);	// Leela's ranking of the move, starting at 1
				if (Number.isNaN(tmp) === false) {
					move_info.multipv = tmp;
				}

				let new_pv = InfoPV(s);

				if (new_pv.length > 0) {
					if (CompareArrays(new_pv, move_info.pv) === false) {
						move_info.nice_pv_cache = null;
						move_info.pv = new_pv;
					}
				}

			} else if (s.startsWith("info string")) {

				// info string d2d4  (293 ) N:   12845 (+121) (P: 20.10%) (Q:  0.09001) (D:  0.000) (U: 0.02410) (Q+U:  0.11411) (V:  0.1006)

				let move = InfoVal(s, "string");

				let move_info;

				if (this.table[move]) {						// We already have move info for this move.
					move_info = this.table[move];
				} else {									// We don't.
					if (board.illegal(move) !== "") {
						Log(`... Nibbler: invalid move received!: ${move}`);
						return;
					}
					move_info = new_info(board, move);
					this.table[move] = move_info;
				}

				let tmp = parseInt(InfoVal(s, "N:"), 10);
				if (Number.isNaN(tmp) === false) {
					move_info.n = tmp;
				}

				move_info.p = InfoVal(s, "(P:");			// Worst case here is just empty string, which is OK.

				tmp = InfoVal(s, "(Q:");
				tmp = parseFloat(tmp);
				if (Number.isNaN(tmp) === false) {
					move_info.winrate = (tmp + 1) / 2;
				}
			}
		},

		sorted: function() {

			let info_list = [];

			for (let key of Object.keys(this.table)) {
				info_list.push(this.table[key]);
			}

			info_list.sort((a, b) => {

				// multipv ranking - lower is better...

				if (a.multipv < b.multipv) {
					return -1;
				}
				if (a.multipv > b.multipv) {
					return 1;
				}

				// node count - higher is better...

				if (a.n < b.n) {
					return 1;
				}
				if (a.n > b.n) {
					return -1;
				}

				// centipawn score - higher is better...

				if (a.cp < b.cp) {
					return 1;
				}
				if (a.cp > b.cp) {
					return -1;
				}

				return 0;
			});

			return info_list;
		}
	};
}
