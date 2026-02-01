"use strict";

function LoadFEN(fen) {
	return load_fen(fen);
}

function load_fen(fen) {

	if (fen.length > 200) {
		throw new Error(`Invalid FEN - length was ${fen.length}`);
	}

	let ret = new_board();

	fen = ReplaceAll(fen, "\t", " ");
	fen = ReplaceAll(fen, "\n", " ");
	fen = ReplaceAll(fen, "\r", " ");

	let tokens = fen.split(" ").filter(z => z !== "");

	if (tokens.length === 1) tokens.push("w");
	if (tokens.length === 2) tokens.push("-");
	if (tokens.length === 3) tokens.push("-");
	if (tokens.length === 4) tokens.push("0");
	if (tokens.length === 5) tokens.push("1");

	if (tokens.length !== 6) {
		throw new Error(`Invalid FEN - token count was ${tokens.length}`);
	}

	if (tokens[0].endsWith("/")) {									// Some FEN writer does this
		tokens[0] = tokens[0].slice(0, -1);
	}

	let rows = tokens[0].split("/");

	if (rows.length > 8) {
		throw new Error(`Invalid FEN - too many rows (${rows.length})`);
	}

	let white_kings = 0;
	let black_kings = 0;

	for (let y = 0; y < rows.length; y++) {

		let x = 0;

		for (let c of rows[y]) {

			if (x > 7) {
				throw new Error(`Invalid FEN - too many columns`);
			}

			if (["1", "2", "3", "4", "5", "6", "7", "8"].includes(c)) {
				x += parseInt(c, 10);
				continue;
			}

			if ((c === "P" || c === "p") && (y === 0 || y === 7)) {
				throw new Error(`Invalid FEN - pawn on back rank`);
			}

			if (["K", "k", "Q", "q", "R", "r", "B", "b", "N", "n", "P", "p"].includes(c)) {
				ret.set(char_to_piece[c], x, y);
				x++;
				if (c === "K") white_kings++;
				if (c === "k") black_kings++;
				continue;
			}

			throw new Error(`Invalid FEN - unknown piece ${c}`);
		}
	}

	ret.active = tokens[1].toLowerCase() === "b" ? "b" : "w";

	ret.halfmove = parseInt(tokens[4], 10);
	if (Number.isNaN(ret.halfmove)) {
		throw new Error(`Invalid FEN - halfmoves was ${tokens[4]}`);
	}

	ret.fullmove = parseInt(tokens[5], 10);
	if (Number.isNaN(ret.fullmove)) {
		throw new Error(`Invalid FEN - fullmoves was ${tokens[5]}`);
	}

	if (white_kings !== 1 || black_kings !== 1) {
		throw new Error(`Invalid FEN - number of kings`);
	}

	if (ret.attacked(ret.inactive(), ret.inactive_king_index())) {
		throw new Error(`Invalid FEN - non-mover's king in check`);
	}

	// Some hard things. Do these in the right order!

	ret.castling = castling_rights(ret, tokens[2]);
	ret.__maybe_set_enpassant(tokens[3]);					// Requires ret.active to be correct.
	ret.normalchess = is_normal_chess(ret);					// Requires ret.castling to be correct.

	return ret;
}

function castling_rights(board, s) {						// s is the castling string from a FEN

	let dict = Object.create(null);							// Will contain keys like "A" to "H" and "a" to "h"

	// WHITE

	let [wkx, wky] = i_to_xy(board.wk);

	if (wky === 7) {

		for (let ch of s) {
			if (["A", "B", "C", "D", "E", "F", "G", "H"].includes(ch)) {
				if (board.get(ch.toLowerCase() + "1") === R) {
					dict[ch] = true;
				}
			}
			if (ch === "Q") {
				if (board.get("a1") === R) {				// Compatibility with regular Chess FEN.
					dict.A = true;
				} else {
					for (let col of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
						let piece = board.get(col + "1");
						if (piece === K) {					// Found the king before a rook, so there won't be queenside castling.
							break;
						}
						if (piece === R) {
							dict[col.toUpperCase()] = true;
						}
					}
				}
			}
			if (ch === "K") {
				if (board.get("h1") === R) {				// Compatibility with regular Chess FEN.
					dict.H = true;
				} else {
					for (let col of ["h", "g", "f", "e", "d", "c", "b", "a"]) {		// Note reverse order...
						let piece = board.get(col + "1");
						if (piece === K) {					// Found the king before a rook, so there won't be kingside castling.
							break;
						}
						if (piece === R) {
							dict[col.toUpperCase()] = true;
						}
					}
				}
			}
		}
	}

	// BLACK

	let [bkx, bky] = i_to_xy(board.bk);

	if (bky === 0) {

		for (let ch of s) {
			if (["a", "b", "c", "d", "e", "f", "g", "h"].includes(ch)) {
				if (board.get(ch + "8") === r) {
					dict[ch] = true;
				}
			}
			if (ch === "q") {
				if (board.get("a8") === r) {
					dict.a = true;
				} else {
					for (let col of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
						let piece = board.get(col + "8");
						if (piece === k) {
							break;
						}
						if (piece === r) {
							dict[col] = true;
						}
					}
				}
			}
			if (ch === "k") {
				if (board.get("h8") === r) {
					dict.h = true;
				} else {
					for (let col of ["h", "g", "f", "e", "d", "c", "b", "a"]) {
						let piece = board.get(col + "8");
						if (piece === k) {
							break;
						}
						if (piece === r) {
							dict[col] = true;
						}
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

	// FIXME: check at most 1 castling possibility on left and right of each king?
	// At the moment we support more arbitrary castling rights, maybe that's OK.
}

function is_normal_chess(board) {
	for (let ch of "bcdefgBCDEFG") {
		if (board.castling.includes(ch)) {
			return false;
		}
	}
	if (board.castling.includes("A") || board.castling.includes("H")) {
		if (board.get("e1") !== K) {
			return false;
		}
	}
	if (board.castling.includes("a") || board.castling.includes("h")) {
		if (board.get("e8") !== k) {
			return false;
		}
	}
	return true;
}
