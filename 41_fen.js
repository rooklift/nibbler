"use strict";

function LoadFEN(fen) {

	let ret = NewPosition();

	fen = ReplaceAll(fen, "\t", " ");
	fen = ReplaceAll(fen, "\n", " ");
	fen = ReplaceAll(fen, "\r", " ");

	let tokens = fen.split(" ").filter(s => s !== "");

	if (tokens.length !== 6) {
		throw "Invalid FEN - token count";
	}

	let rows = tokens[0].split("/");

	if (rows.length !== 8) {
		throw "Invalid FEN - board row count";
	}

	for (let y = 0; y < 8; y++) {

		let chars = Array.from(rows[y]);

		let x = 0;

		for (let c of chars) {

			if (x > 7) {
				throw "Invalid FEN - row length";
			}

			if ("12345678".includes(c)) {
				x += parseInt(c, 10);
				continue;
			}

			if ("KkQqRrBbNnPp".includes(c)) {
				ret.state[x][y] = c;
				x++;
				continue;
			}

			throw "Invalid FEN - unknown piece";
		}

		if (x !== 8) {
			throw "Invalid FEN - row length";
		}
	}

	tokens[1] = tokens[1].toLowerCase();
	if (tokens[1] !== "w" && tokens[1] !== "b") {
		throw "Invalid FEN - active player";
	}
	ret.active = tokens[1];

	tokens[3] = tokens[3].toLowerCase();
	ret.enpassant = Point(tokens[3]);
	
	ret.halfmove = parseInt(tokens[4], 10);
	if (Number.isNaN(ret.halfmove)) {
		throw "Invalid FEN - halfmoves";
	}

	ret.fullmove = parseInt(tokens[5], 10);
	if (Number.isNaN(ret.fullmove)) {
		throw "Invalid FEN - fullmoves";
	}

	// Some more validity checks...

	let white_kings = 0;
	let black_kings = 0;

	for (let x = 0; x < 8; x++) {
		for (let y = 0; y < 8; y++) {
			if (ret.state[x][y] === "K") white_kings++;
			if (ret.state[x][y] === "k") black_kings++;
		}
	}

	if (white_kings !== 1 || black_kings !== 1) {
		throw "Invalid FEN - number of kings";
	}

	for (let x = 0; x < 8; x++) {
		for (let y of [0, 7]) {
			if (ret.state[x][y] === "P" || ret.state[x][y] === "p") {
				throw "Invalid FEN - pawn position";
			}
		}
	}

	let opponent_king_char = ret.active === "w" ? "k" : "K";
	let opponent_king_square = ret.find(opponent_king_char)[0];

	if (ret.attacked(opponent_king_square, ret.colour(opponent_king_square))) {
		throw "Invalid FEN - non-mover's king in check";
	}

	// Some hard things. Do these in the right order!

	ret.castling = CastlingRights(ret, tokens[2]);
	ret.normalchess = IsNormalChessPosition(ret);		// Note the renderer may change this anyway.

	return ret;
}


function CastlingRights(board, s) {						// s is the castling string from a FEN

	let dict = Object.create(null);						// Will contain keys like "A" to "H" and "a" to "h"

	// WHITE

	let wk_location = board.find("K", 0, 7, 7, 7)[0];	// Will be undefined if not on back rank.

	if (wk_location) {

		for (let ch of s) {
			if (["A", "B", "C", "D", "E", "F", "G", "H"].includes(ch)) {
				let point = Point(ch.toLowerCase() + "1");
				if (board.piece(point) === "R") {
					dict[ch] = true;
				}
			}
		}

		for (let ch of s) {
			if (ch === "Q") {
				if (board.state[0][7] === "R") {		// Compatibility with regular Chess FEN.
					dict["A"] = true;
				} else {
					let left_rooks = board.find("R", 0, 7, wk_location.x, 7);
					for (let rook of left_rooks) {
						dict[rook.s[0].toUpperCase()] = true;
					}
				}
			}
			if (ch === "K") {
				if (board.state[7][7] === "R") {
					dict["H"] = true;
				} else {
					let right_rooks = board.find("R", wk_location.x, 7, 7, 7);
					for (let rook of right_rooks) {
						dict[rook.s[0].toUpperCase()] = true;
					}
				}
			}
		}
	}

	// BLACK

	let bk_location = board.find("k", 0, 0, 7, 0)[0];

	if (bk_location) {

		for (let ch of s) {
			if (["a", "b", "c", "d", "e", "f", "g", "h"].includes(ch)) {
				let point = Point(ch + "8");
				if (board.piece(point) === "r") {
					dict[ch] = true;
				}
			}
		}

		for (let ch of s) {
			if (ch === "q") {
				if (board.state[0][0] === "r") {
					dict["a"] = true;
				} else {
					let left_rooks = board.find("r", 0, 0, bk_location.x, 0);
					for (let rook of left_rooks) {
						dict[rook.s[0]] = true;
					}
				}
			}

			if (ch === "k") {
				if (board.state[7][0] === "r") {
					dict["h"] = true;
				} else {
					let right_rooks = board.find("r", bk_location.x, 0, 7, 0);
					for (let rook of right_rooks) {
						dict[rook.s[0]] = true;
					}
				}
			}
		}
	}

	let ret = "";

	for (let ch of "ABCDEFGHabcdefgh") {
		if (dict[ch]) {
			ret += ch;
		}
	}

	return ret;

	// FIXME: check at most 1 castling possibility on left and right of each king.
}


function IsNormalChessPosition(board) {

	// Maybe this should be a position method.

	for (let ch of "bcdefgBCDEFG") {

		if (board.castling.includes(ch)) {
			return false;
		}

		if (board.castling.includes("A") || board.castling.includes("H")) {
			if (board.state[4][7] !== "K") {
				return false;
			}
		}

		if (board.castling.includes("a") || board.castling.includes("h")) {
			if (board.state[4][0] !== "k") {
				return false;
			}
		}
	}

	// So it can be considered a normal Chess position.

	return true;
}
