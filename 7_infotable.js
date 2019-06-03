"use strict";

function new_info() {

	return {
		cp: -999999,
		move: "??",
		multipv: 999,
		n: 0,				// The draw logic will only ever draw things with non-negative n, so make this 1
		p: "?",
		pv: [],
		pv_string_cache: null,

		pv_string: function(board) {

			// Given the board for which this info is valid, generate a human-readable
			// PV string for display. This should never be examined by the caller,
			// merely displayed.

			if (this.pv_string_cache) {
				return this.pv_string_cache;
			}

			let pv_string = "";

			for (let move of this.pv) {

				if (board.active === "w") {
					pv_string += `<span class="white">`;
				} else {
					pv_string += `<span class="black">`;
				}

				pv_string += board.nice_string(move);
				pv_string += "</span> ";

				if (config.show_pv === false) {
					break;
				}

				board = board.move(move);
			}

			this.pv_string_cache = pv_string.trim();
			return this.pv_string_cache;
		}
	};
}

function NewInfoTable() {			// There's only ever going to be one of these made.

	return {

		clears: 0,
		table: Object.create(null),
	
		clear: function() {
			this.table = Object.create(null);
			Log(`------------------------- info cleared (${++this.clears}) -------------------------`);
		},

		receive: function(s, board) {

			// The current board is sent just so we can check the move is valid.
			// Although the renderer tries to avoid sending invalid moves by
			// syncing with "isready" "readyok" an engine like Stockfish doesn't
			// behave properly, IMO.

			if (s.startsWith("info depth")) {

				// info depth 13 seldepth 48 time 5603 nodes 67686 score cp 40 hashfull 204 nps 12080 tbhits 0 multipv 2
				// pv d2d4 g8f6 c2c4 e7e6 g2g3 f8b4 c1d2 b4e7 g1f3 e8g8 d1c2 a7a6 f1g2 b7b5 e1g1 c8b7 f1c1 b7e4 c2d1 b5c4 c1c4 a6a5 d2e1 h7h6 c4c1 d7d6

				let move = InfoVal(s, "pv");

				if (board.colour(Point(move.slice(0,2))) !== board.active) {
					Log(`Nibbler notes: invalid move received!: ${move}`);
					return;
				}

				let move_info;

				if (this.table[move]) {
					move_info = this.table[move];
				} else {
					move_info = new_info();
					this.table[move] = move_info;
				}

				move_info.move = move;
				move_info.cp = parseInt(InfoVal(s, "cp"), 10);				// Score in centipawns
				move_info.multipv = parseInt(InfoVal(s, "multipv"), 10);	// Leela's ranking of the move, starting at 1

				let new_pv = InfoPV(s);

				if (CompareArrays(new_pv, move_info.pv) === false) {
					move_info.pv_string_cache = null;
					move_info.pv = new_pv;
				}

			} else if (s.startsWith("info string")) {

				// info string d2d4  (293 ) N:   12845 (+121) (P: 20.10%) (Q:  0.09001) (D:  0.000) (U: 0.02410) (Q+U:  0.11411) (V:  0.1006)

				let move = InfoVal(s, "string");

				if (board.colour(Point(move.slice(0,2))) !== board.active) {
					Log(`Nibbler notes: invalid move received!: ${move}`);
					return;
				}

				let move_info;

				if (this.table[move]) {
					move_info = this.table[move];
				} else {
					move_info = new_info();
					this.table[move] = move_info;
				}

				move_info.move = move;
				move_info.n = parseInt(InfoVal(s, "N:"), 10);

				move_info.p = InfoVal(s, "(P:");
				if (move_info.p.endsWith(")")) {
					move_info.p = move_info.p.slice(0, move_info.p.length - 1);
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
					return 1
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
