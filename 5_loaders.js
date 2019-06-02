"use strict";

function LoadFEN(fen) {

	let ret = NewPosition();

	fen = fen.replace("\t", " ");
	fen = fen.replace("\n", " ");
	fen = fen.replace("\r", " ");

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

	ret.castling = "";
	if (tokens[2].includes("K")) ret.castling += "K";
	if (tokens[2].includes("Q")) ret.castling += "Q";
	if (tokens[2].includes("k")) ret.castling += "k";
	if (tokens[2].includes("q")) ret.castling += "q";

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

	return ret;
}

function LoadPGN(pgn) {

	let pos = LoadFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");

	let lines = pgn.split("\n");
	lines = lines.map(s => s.trim());

	let parenthesis_depth = 0;
	let inside_brace = false;				// "Brace comments do not nest"

	let all_tokens = [];

	for (let line of lines) {

		if (line.startsWith("%")) {
			continue;
		}

		if (line.startsWith("[")) {
			continue;
		}

		let tokens = line.split(" ");
		tokens = tokens.filter(s => s !== "");
		tokens = tokens.map(s => s.trim());

		for (let token of tokens) {

			if (token.startsWith("{")) {
				inside_brace = true;		// "Brace comments do not nest"
			}

			if (inside_brace) {
				if (token.endsWith("}")) {
					inside_brace = false;
				}
				continue;		// note this - always continuing regardless of whether status changed
			}

			if (token.startsWith("(")) {
				parenthesis_depth++;
			}

			// FIXME: if a token starts with "((" or ends with "))" etc we need to consider it to be
			// a change in depth of 2 or more. We really need to do byte level pre-parsing of the file.

			if (parenthesis_depth > 0) {
				if (token.endsWith(")")) {
					parenthesis_depth--;
				}
				continue;		// as above
			}

			all_tokens.push(token);
		}
	}

	for (let token of all_tokens) {

		if (token === "1/2-1/2" || token === "1-0" || token === "0-1" || token === "*") {
			break;
		}

		if (token.endsWith(".")) {
			continue;
		}

		let [move, error] = pos.parse_pgn(token);

		if (error !== "") {
			throw `${token} -- ${error}`;
		}

		pos = pos.move(move);

	}

	return pos;
}
