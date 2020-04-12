"use strict";

// All our positions have a prototype which contains the methods needed. This is much faster than
// creating each position with methods embedded in itself. Downside is, we have to use the "this"
// keyword. Also note that => functions break "this" in such an object.

const position_prototype = {

	move: function(s) {

		// CHESS960 - FIXME
		// Need to accept Chess960 castling moves, and use alternate pos.castling format.

		// s is some valid UCI move like "d1f3" or "e7e8q".
		// Assumes move is legal - all sorts of weird things can happen if this isn't so.

		// Basic sanity checks only:

		if (typeof s !== "string" || s.length < 4) {
			console.log("position_prototype.move called with arg", s);
			return this;
		}

		let [x1, y1] = XY(s.slice(0, 2));
		let [x2, y2] = XY(s.slice(2, 4));

		if (x1 < 0 || y1 < 0 || x1 > 7 || y1 > 7 || x2 < 0 || y2 < 0 || x2 > 7 || y2 > 7) {
			console.log("position_prototype.move called with arg", s);
			return this;
		}

		if (this.state[x1][y1] === "") {
			console.log("position_prototype.move called with empty source, arg was", s);
			return this;
		}

		let ret = this.copy();

		let promotion_char = s.length > 4 ? s[4].toLowerCase() : "q";
		
		let white_flag = this.is_white(Point(x1, y1));
		let pawn_flag = "Pp".includes(ret.state[x1][y1]);
		let capture_flag = ret.state[x2][y2] !== "";

		if (pawn_flag && x1 !== x2) {		// Make sure capture_flag is set even for enpassant captures
			capture_flag = true;
		}

		// Update castling info...

		if (ret.state[x1][y1] === "K") {
			ret.castling = ReplaceAll(ret.castling, "K", "");
			ret.castling = ReplaceAll(ret.castling, "Q", "");
		}

		if (ret.state[x1][y1] === "k") {
			ret.castling = ReplaceAll(ret.castling, "k", "");
			ret.castling = ReplaceAll(ret.castling, "q", "");
		}

		if ((x1 == 0 && y1 == 0) || (x2 == 0 && y2 == 0)) {
			ret.castling = ReplaceAll(ret.castling, "q", "");
		}

		if ((x1 == 7 && y1 == 0) || (x2 == 7 && y2 == 0)) {
			ret.castling = ReplaceAll(ret.castling, "k", "");
		}

		if ((x1 == 0 && y1 == 7) || (x2 == 0 && y2 == 7)) {
			ret.castling = ReplaceAll(ret.castling, "Q", "");
		}

		if ((x1 == 7 && y1 == 7) || (x2 == 7 && y2 == 7)) {
			ret.castling = ReplaceAll(ret.castling, "K", "");
		}

		// Update halfmove and fullmove...

		if (white_flag === false) {
			ret.fullmove++;
		}

		if (pawn_flag || capture_flag) {
			ret.halfmove = 0;
		} else {
			ret.halfmove++;
		}

		// Handle the rook moves of castling...

		if (ret.state[x1][y1] === "K" || ret.state[x1][y1] === "k") {

			if (s === "e1g1") {
				ret.state[5][7] = "R";
				ret.state[7][7] = "";
			}

			if (s === "e1c1") {
				ret.state[3][7] = "R";
				ret.state[0][7] = "";
			}

			if (s === "e8g8") {
				ret.state[5][0] = "r";
				ret.state[7][0] = "";
			}

			if (s === "e8c8") {
				ret.state[3][0] = "r";
				ret.state[0][0] = "";
			}
		}

		// Handle enpassant captures...

		if (pawn_flag && capture_flag && ret.state[x2][y2] === "") {
			ret.state[x2][y1] = "";
		}

		// Set enpassant square...

		ret.enpassant = Point(null);

		if (pawn_flag && y1 === 6 && y2 === 4) {
			ret.enpassant = Point(x1, 5);
		}

		if (pawn_flag && y1 === 1 && y2 === 3) {
			ret.enpassant = Point(x1, 2);
		}

		// Actually make the move...

		ret.state[x2][y2] = ret.state[x1][y1];
		ret.state[x1][y1] = "";

		// Handle promotions...

		if (y2 === 0 && pawn_flag) {
			ret.state[x2][y2] = promotion_char.toUpperCase();
		}

		if (y2 === 7 && pawn_flag) {
			ret.state[x2][y2] = promotion_char;		// Always lowercase.
		}

		// Swap who the current player is...

		ret.active = white_flag ? "b" : "w";

		return ret;
	},

	illegal: function(s) {

		// Returns "" if the move is legal, otherwise returns the reason it isn't.

		if (typeof s !== "string") {
			return "not a string";
		}

		let [x1, y1] = XY(s.slice(0, 2));
		let [x2, y2] = XY(s.slice(2, 4));

		if (x1 < 0 || y1 < 0 || x1 > 7 || y1 > 7 || x2 < 0 || y2 < 0 || x2 > 7 || y2 > 7) {
			return "off board";
		}

		if (this.active === "w" && this.is_white(Point(x1, y1)) === false) {
			return "wrong colour source";
		}

		if (this.active === "b" && this.is_black(Point(x1, y1)) === false) {
			return "wrong colour source";
		}

		// Colours must not be the same, except for castling.
		// Note that king-onto-rook is the only valid castling move...

		if (this.same_colour(Point(x1, y1), Point(x2, y2))) {
			if (this.state[x1][y1] === "K" && this.state[x2][y2] === "R") {
				return this.illegal_castling(x1, y1, x2, y2);
			} else if (this.state[x1][y1] === "k" && this.state[x2][y2] === "r") {
				return this.illegal_castling(x1, y1, x2, y2);
			} else {
				return "source and destination have same colour";
			}
		}

		if ("Nn".includes(this.state[x1][y1])) {
			if (Math.abs(x2 - x1) + Math.abs(y2 - y1) !== 3) {
				return "illegal knight movement";
			}
			if (Math.abs(x2 - x1) === 0 || Math.abs(y2 - y1) === 0) {
				return "illegal knight movement";
			}
		}

		if ("Bb".includes(this.state[x1][y1])) {
			if (Math.abs(x2 - x1) !== Math.abs(y2 - y1)) {
				return "illegal bishop movement";
			}
		}

		if ("Rr".includes(this.state[x1][y1])) {
			if (Math.abs(x2 - x1) > 0 && Math.abs(y2 - y1) > 0) {
				return "illegal rook movement";
			}
		}

		if ("Qq".includes(this.state[x1][y1])) {
			if (Math.abs(x2 - x1) !== Math.abs(y2 - y1)) {
				if (Math.abs(x2 - x1) > 0 && Math.abs(y2 - y1) > 0) {
					return "illegal queen movement";
				}
			}
		}

		// Pawns...

		if ("Pp".includes(this.state[x1][y1])) {

			if (Math.abs(x2 - x1) === 0) {
				if (this.state[x2][y2] !== "") {
					return "pawn cannot capture forwards";
				}
			}

			if (Math.abs(x2 - x1) > 1) {
				return "pawn cannot move that far sideways";
			}

			if (Math.abs(x2 - x1) === 1) {

				if (this.state[x2][y2] === "") {
					if (this.enpassant !== Point(x2, y2)) {
						return "pawn cannot capture thin air";
					}
				}

				if (Math.abs(y2 - y1) !== 1) {
					return "pawn must move 1 forward when capturing";
				}
			}

			if (this.state[x1][y1] === "P") {
				if (y1 !== 6) {
					if (y2 - y1 !== -1) {
						return "pawn must move forwards 1";
					}
				} else {
					if (y2 - y1 !== -1 && y2 - y1 !== -2) {
						return "pawn must move forwards 1 or 2";
					}
				}
			}

			if (this.state[x1][y1] === "p") {
				if (y1 !== 1) {
					if (y2 - y1 !== 1) {
						return "pawn must move forwards 1";
					}
				} else {
					if (y2 - y1 !== 1 && y2 - y1 !== 2) {
						return "pawn must move forwards 1 or 2";
					}
				}
			}
		}

		// Kings...

		if ("Kk".includes(this.state[x1][y1])) {

			if (Math.abs(y2 - y1) > 1) {
				return "illegal king movement";
			}

			if (Math.abs(x2 - x1) > 1) {
				return "illegal king movement";
			}
		}

		// Check for blockers (pieces between source and dest).

		if ("KQRBPkqrbp".includes(this.state[x1][y1])) {
			if (this.los(x1, y1, x2, y2) === false) {
				return "movement blocked";
			}
		}

		// Check promotion and string lengths...
		// We DO NOT tolerate missing promotion characters.

		if ((y1 === 1 && this.state[x1][y1] === "P") || (y1 === 6 && this.state[x1][y1] === "p")) {

			if (s.length !== 5) {
				return "bad string length";
			}

			let promotion = s[4];

			if (promotion !== "q" && promotion !== "r" && promotion !== "b" && promotion !== "n") {
				return "move requires a valid promotion piece";
			}

		} else {

			if (s.length !== 4) {
				return "bad string length";
			}

		}

		// Check for check...

		let tmp = this.move(s);

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				if (tmp.state[x][y] === "K" && this.active === "w") {
					if (tmp.attacked(Point(x, y), this.active)) {
						return "king in check";
					}
				}
				if (tmp.state[x][y] === "k" && this.active === "b") {
					if (tmp.attacked(Point(x, y), this.active)) {
						return "king in check";
					}
				}
			}
		}

		return "";
	},

	illegal_castling: function(x1, y1, x2, y2) {

		// We can assume a king is on [x1, y1] and a same-colour rook is on [x2, y2]

		if (y1 !== y2) {
			return "cannot castle vertically";
		}

		let colour = this.colour(Point(x1, y1));

		if (colour === "w" && y1 !== 7) {
			return "cannot castle off the back rank"
		}

		if (colour === "b" && y1 !== 0) {
			return "cannot castle off the back rank"
		}

		// Check for the required castling rights character...

		let required_ch;

		if (colour === "w") {
			required_ch = Point(x2, y2).s[0].toUpperCase();
		} else {
			required_ch = Point(x2, y2).s[0];
		}

		if (this.castling.includes(required_ch) === false) {
			return `lost the right to castle - needed ${required_ch}`;
		}

		let king_target_x;
		let rook_target_x;

		if (x1 < x2) {				// Castling kingside
			king_target_x = 6;
			rook_target_x = 5;
		} else {					// Castling queenside
			king_target_x = 2;
			rook_target_x = 3;
		}

		let king_path = NumbersBetween(x1, king_target_x);
		let rook_path = NumbersBetween(x2, rook_target_x);

		// Check for blockers and checks...

		for (let x of king_path) {
			if (x === x1 || x === x2) {
				continue;
			}
			if (this.state[x][y1] !== "") {
				return "castling blocked for king movement";
			}
			if (this.attacked(Point(x, y1), this.active)) {
				return "cannot castle [out of / through / into] check";
			}
		}

		for (let x of rook_path) {
			if (x === x1 || x === x2) {
				continue;
			}
			if (this.state[x][y1] !== "") {
				return "castling blocked for rook movement";
			}
		}

		return "";
	},

	sequence_illegal: function(moves) {

		let pos = this;

		for (let s of moves) {
			let reason = pos.illegal(s);
			if (reason !== "") {
				return `${s} - ${reason}`;
			}
			pos = pos.move(s);
		}

		return "";
	},

	los: function(x1, y1, x2, y2) {		// Returns false if there is no "line of sight" between the 2 points.

		// Check the line is straight....

		if (Math.abs(x2 - x1) > 0 && Math.abs(y2 - y1) > 0) {
			if (Math.abs(x2 - x1) !== Math.abs(y2 - y1)) {
				return false;
			}
		}

		let step_x;
		let step_y;

		if (x1 === x2) step_x = 0;
		if (x1 < x2) step_x = 1;
		if (x1 > x2) step_x = -1;

		if (y1 === y2) step_y = 0;
		if (y1 < y2) step_y = 1;
		if (y1 > y2) step_y = -1;

		let x = x1;
		let y = y1;

		while (true) {

			x += step_x;
			y += step_y;

			if (x === x2 && y === y2) {
				return true;
			}

			if (this.state[x][y] !== "") {
				return false;
			}
		}
	},

	attacked: function(target, my_colour) {

		if (!my_colour) {
			throw "attacked(): no colour given";
		}

		if (!target || target === Point(null)) {
			return false;
		}

		// Attacks along the lines...

		for (let step_x = -1; step_x <= 1; step_x++) {

			for (let step_y = -1; step_y <= 1; step_y++) {

				if (step_x === 0 && step_y === 0) continue;

				if (this.line_attack(target, step_x, step_y, my_colour)) {
					return true;
				}
			}
		}

		// Knights...

		for (let d of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {

			let x = target.x + d[0];
			let y = target.y + d[1];

			if (x < 0 || x > 7 || y < 0 || y > 7) continue;

			if (this.state[x][y] === "") continue;		// Necessary, to prevent "Nn".includes() having false positives
			if ("Nn".includes(this.state[x][y])) {
				if (this.colour(Point(x, y)) === my_colour) continue;
				return true;
			}
		}

		return false;
	},

	line_attack: function(target, step_x, step_y, my_colour) {

		// Is the target square under attack via the line specified by step_x and step_y (which are both -1, 0, or 1) ?

		if (!my_colour) {
			throw "line_attack(): no colour given";
		}

		if (!target || target === Point(null)) {
			return false;
		}

		if (step_x === 0 && step_y === 0) {
			return false;
		}

		let x = target.x;
		let y = target.y;

		let ranged_attackers = "QqRr";					// Ranged attackers that can go in a cardinal direction.
		if (step_x !== 0 && step_y !== 0) {
			ranged_attackers = "QqBb";					// Ranged attackers that can go in a diagonal direction.
		}

		let iteration = 0;

		while (true) {

			iteration++;

			x += step_x;
			y += step_y;

			if (x < 0 || x > 7 || y < 0 || y > 7) {
				return false;
			}

			if (this.state[x][y] === "") {
				continue;
			}

			// So there's something here. Must return now.

			if (this.colour(Point(x, y)) === my_colour) {
				return false;
			}

			// We now know the piece is hostile. This allows us to mostly not care
			// about distinctions between "Q" and "q", "R" and "r", etc.

			// Is it one of the ranged attacker types?

			if (ranged_attackers.includes(this.state[x][y])) {
				return true;
			}

			// Pawns and kings are special cases (attacking iff it's the first iteration)

			if (iteration === 1) {

				if ("Kk".includes(this.state[x][y])) {
					return true;
				}

				if (Math.abs(step_x) === 1) {

					if (this.state[x][y] === "p" && step_y === -1) {	// Black pawn in attacking position
						return true;
					}

					if (this.state[x][y] === "P" && step_y === 1) {		// White pawn in attacking position
						return true;
					}
				}
			}

			return false;
		}
	},

	find: function(piece, startx, starty, endx, endy) {

		// Find all pieces of the specified type (colour-specific).
		// Returned as a list of points.

		for (let val of [startx, starty, endx, endy]) {
			if (typeof val !== "number" || val < 0 || val > 7) {
				startx = 0;
				starty = 0;
				endx = 7;
				endy = 7;
				break;
			}
		}

		let ret = [];

		for (let x = startx; x <= endx; x++) {
			for (let y = starty; y <= endy; y++) {
				if (this.state[x][y] === piece) {
					ret.push(Point(x, y));
				}
			}
		}

		return ret;
	},

	parse_pgn: function(s) {		// Returns a move and an error message.

		// Delete things we don't need...

		s = ReplaceAll(s, "x", "");
		s = ReplaceAll(s, "+", "");
		s = ReplaceAll(s, "#", "");
		s = ReplaceAll(s, "!", "");
		s = ReplaceAll(s, "?", "");

		// If the string contains any dots it'll be something like "1.e4" or "1...e4"

		let lio = s.lastIndexOf(".");
		if (lio !== -1) {
			s = s.slice(lio + 1);
		}

		// Fix castling with zeroes...

		s = ReplaceAll(s, "0-0", "O-O");
		s = ReplaceAll(s, "0-0-0", "O-O-O");

		if (s.toUpperCase() === "O-O") {
			if (this.active === "w") {
				if (this.state[4][7] === "K" && this.illegal("e1g1") === "") {
					return ["e1g1", ""];
				} else {
					return ["", "illegal castling"];
				}
			} else {
				if (this.state[4][0] === "k" && this.illegal("e8g8") === "") {
					return ["e8g8", ""];
				} else {
					return ["", "illegal castling"];
				}
			}
		}

		if (s.toUpperCase() === "O-O-O") {
			if (this.active === "w") {
				if (this.state[4][7] === "K" && this.illegal("e1c1") === "") {
					return ["e1c1", ""];
				} else {
					return ["", "illegal castling"];
				}
			} else {
				if (this.state[4][0] === "k" && this.illegal("e8c8") === "") {
					return ["e8c8", ""];
				} else {
					return ["", "illegal castling"];
				}
			}
		}

		// Just in case, delete any "-" characters (after handling castling, of course)...

		s = ReplaceAll(s, "-", "");

		// Save promotion string, if any, then delete it from s...

		let promotion = "";

		if (s[s.length - 2] === "=") {
			promotion = s[s.length - 1].toLowerCase();
			s = s.slice(0, -2);
		}

		let piece;

		// If the piece isn't specified (with an uppercase letter) then it's a pawn move.
		// Let's add P to the start of the string to keep the string format consistent.

		if ("KQRBNP".includes(s[0]) === false) {
			s = "P" + s;
		}

		piece = s[0];

		if (this.active === "b") {
			piece = piece.toLowerCase();
		}

		// The last 2 characters specify the target point. We've removed all trailing
		// garbage that could interfere with this fact.

		let dest = Point(s.slice(s.length - 2, s.length));

		// Any characters between the piece and target should be disambiguators...

		let disambig = s.slice(1, -2);

		let startx = 0;
		let endx = 7;

		let starty = 0;
		let endy = 7;

		for (let c of Array.from(disambig)) {
			if (c >= "a" && c <= "h") {
				startx = c.charCodeAt(0) - 97;
				endx = startx;
			}
			if (c >= "1" && c <= "8") {
				starty = 7 - (c.charCodeAt(0) - 49);
				endy = starty;
			}
		}

		// If it's a pawn and hasn't been disambiguated then it is moving forwards...

		if (piece === "P" || piece === "p") {
			if (disambig.length === 0) {
				startx = dest.x;
				endx = dest.x;
			}
		}

		let sources = this.find(piece, startx, starty, endx, endy);

		if (sources.length === 0) {
			return ["", "piece not found"];
		}

		let possible_moves = [];

		for (let source of sources) {
			possible_moves.push(source.s + dest.s + promotion);
		}

		let valid_moves = [];

		for (let move of possible_moves) {
			if (this.illegal(move) === "") {
				valid_moves.push(move);
			}
		}

		if (valid_moves.length === 1) {
			return [valid_moves[0], ""];
		}

		if (valid_moves.length === 0) {
			return ["", "piece found but move illegal"];
		}

		if (valid_moves.length > 1) {
			return ["", `ambiguous moves: [${valid_moves}]`];
		}
	},

	piece: function(point) {
		if (!point || point === Point(null)) return "";
		return this.state[point.x][point.y];
	},

	is_white: function(point) {
		let piece = this.piece(point);
		if (piece === "") {
			return false;
		}
		return "KQRBNP".includes(piece);
	},

	is_black: function(point) {
		let piece = this.piece(point);
		if (piece === "") {
			return false;
		}
		return "kqrbnp".includes(piece);
	},

	is_empty: function(point) {
		return this.piece(point) === "";
	},

	colour: function(point) {
		if (this.is_white(point)) return "w";
		if (this.is_black(point)) return "b";
		return "";
	},

	same_colour: function(point1, point2) {
		return this.colour(point1) === this.colour(point2);
	},

	movegen: function() {

		// Super-crude brute-force, but it does work.
		// Probably best to never use this, but it might be useful in debugging.

		let moves = [];

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				let source = Point(x, y);
				if (this.colour(source) !== this.active) {
					continue;
				}
				for (let i = 0; i < 8; i++) {
					for (let j = 0; j < 8; j++) {
						let dest = Point(i, j);
						let move = source.s + dest.s;
						if ((this.piece(source) === "P" && dest.y === 0) || (this.piece(source) === "p" && dest.y === 7)) {
							for (let c of "qrbn") {
								if (this.illegal(move + c) === "") {
									moves.push(move + c);
								}
							}
						}
						if (this.illegal(move) === "") {
							moves.push(move);
						}
					}
				}
			}
		}

		return moves;
	},

	nice_movegen: function() {
		return this.movegen().map(s => this.nice_string(s));
	},

	nice_string: function(s) {

		// CHESS960 - FIXME
		// Castling logic.

		// Given some raw (but valid) UCI move string, return a nice human-readable
		// string for display in the browser window. This string should never be
		// examined by the caller, merely displayed.

		let source = Point(s.slice(0, 2));
		let dest = Point(s.slice(2, 4));

		if (source === Point(null) || dest === Point(null)) {
			return "??";
		}

		let piece = this.piece(source);

		if (piece === "") {
			return "??";
		}

		let check = "";
		let next_board = this.move(s);
		let opponent_king_char = this.active === "w" ? "k" : "K";
		let opponent_king_square = this.find(opponent_king_char)[0];	// Might be undefined on corrupt board...

		if (opponent_king_square && next_board.attacked(opponent_king_square, next_board.colour(opponent_king_square))) {
			check = "+";
		}

		if ("KkQqRrBbNn".includes(piece)) {

			if ("Kk".includes(piece)) {
				if (s === "e1g1" || s === "e8g8") {
					return `O-O${check}`;
				}
				if (s === "e1c1" || s === "e8c8") {
					return `O-O-O${check}`;
				}
			}

			// Would the move be ambiguous?
			// IMPORTANT: note that the actual move will not necessarily be valid_moves[0].

			let possible_sources = this.find(piece);
			let possible_moves = [];
			let valid_moves = [];

			for (let foo of possible_sources) {
				possible_moves.push(foo.s + dest.s);		// e.g. "g1f3" - note we are only dealing with pieces, so no worries about promotion
			}

			for (let move of possible_moves) {
				if (this.illegal(move) === "") {
					valid_moves.push(move);
				}
			}

			if (valid_moves.length > 2) {

				// Full disambiguation.

				if (this.piece(dest) === "") {
					return piece.toUpperCase() + source.s + dest.s + check;
				} else {
					return piece.toUpperCase() + source.s + "x" + dest.s + check;
				}
			}

			if (valid_moves.length === 2) {

				// Partial disambiguation.

				let source1 = Point(valid_moves[0].slice(0, 2));
				let source2 = Point(valid_moves[1].slice(0, 2));

				let disambiguator;

				if (source1.x === source2.x) {
					disambiguator = source.s[1];		// Note source (the true source), not source1
				} else {
					disambiguator = source.s[0];		// Note source (the true source), not source1
				}

				if (this.piece(dest) === "") {
					return piece.toUpperCase() + disambiguator + dest.s + check;
				} else {
					return piece.toUpperCase() + disambiguator + "x" + dest.s + check;
				}
			}

			// No disambiguation.

			if (this.piece(dest) === "") {
				return piece.toUpperCase() + dest.s + check;
			} else {
				return piece.toUpperCase() + "x" + dest.s + check;
			}
		}

		// So it's a pawn. Pawn moves are never ambiguous.

		let ret;

		if (source.x === dest.x) {
			ret = dest.s;
		} else {
			ret = source.s[0] + "x" + dest.s;
		}

		if (s.length > 4) {
			ret += "=";
			ret += s[4].toUpperCase();
		}

		ret += check;

		return ret;
	},

	next_number_string: function() {
		if (this.active === "w") {
			return `${this.fullmove}.`;
		} else {
			return `${this.fullmove}...`;
		}
	},

	fen: function() {

		// CHESS960 - FIXME
		// Need to deal with the special FEN format for castling rights.

		let s = "";

		for (let y = 0; y < 8; y++) {

			let x = 0;
			let blanks = 0;

			while (true) {

				if (this.state[x][y] === "") {
					blanks++;
				} else {
					if (blanks > 0) {
						s += blanks.toString();
						blanks = 0;
					}
					s += this.state[x][y];
				}

				x++;

				if (x >= 8) {
					if (blanks > 0) {
						s += blanks.toString();
					}
					if (y < 7) {
						s += "/";
					}
					break;
				}
			}
		}

		let ep_string = this.enpassant === Point(null) ? "-" : this.enpassant.s;
		let castling_string = this.castling === "" ? "-" : this.castling;

		return s + ` ${this.active} ${castling_string} ${ep_string} ${this.halfmove} ${this.fullmove}`;
	},

	set_castling_rights(s) {				// s is likely the castling string from a FEN

		this.castling = "";

		let dict = Object.create(null);		// Will contain keys like "A" to "H" and "a" to "h"

		// WHITE

		let wk_location = this.find("K", 1, 7, 6, 7)[0];		// Possibly undefined...

		if (wk_location) {					// White king OK to castle if it's between b1 and g1 inclusive...
											// Note that on a1 or h1, it must have moved.

			for (let ch of s) {
				if ("ABCDEFGH".includes(ch)) {
					let point = Point(ch.toLowerCase() + "1");
					if (this.piece(point) === "R") {
						dict[ch] = true;
					}
				}
			}

			for (let ch of s) {
				if (ch === "Q") {
					let left_rooks = this.find("R", 0, 7, wk_location.x - 1, 7);
					for (let rook of left_rooks) {
						dict[rook.s[0].toUpperCase()] = true;
					}
				}

				if (ch === "K") {
					let right_rooks = this.find("R", wk_location.x + 1, 7, 7, 7);
					for (let rook of right_rooks) {
						dict[rook.s[0].toUpperCase()] = true;
					}
				}
			}
		}

		// BLACK

		let bk_location = this.find("k", 1, 0, 6, 0)[0];

		if (bk_location) {

			for (let ch of s) {
				if ("abcdefgh".includes(ch)) {
					let point = Point(ch + "8");
					if (this.piece(point) === "r") {
						dict[ch] = true;
					}
				}
			}

			for (let ch of s) {
				if (ch === "q") {
					let left_rooks = this.find("r", 0, 0, bk_location.x - 1, 0);
					for (let rook of left_rooks) {
						dict[rook.s[0]] = true;
					}
				}

				if (ch === "k") {
					let right_rooks = this.find("r", bk_location.x + 1, 0, 7, 0);
					for (let rook of right_rooks) {
						dict[rook.s[0]] = true;
					}
				}
			}
		}

		for (let ch of "ABCDEFGHabcdefgh") {
			if (dict[ch]) {
				this.castling += ch;
			}
		}

		// FIXME: check at most 1 castling possibility on left and right of each king.
	},

	copy: function() {
		return NewPosition(this.state, this.active, this.castling, this.enpassant, this.halfmove, this.fullmove);
	},
};

function NewPosition(state = null, active = "w", castling = "", enpassant = null, halfmove = 0, fullmove = 1) {

	let p = Object.create(position_prototype);

	p.state = [];					// top-left is 0,0

	for (let x = 0; x < 8; x++) {
		p.state.push([]);
		for (let y = 0; y < 8; y++) {
			if (state) {
				p.state[x].push(state[x][y]);
			} else {
				p.state[x].push("");
			}
		}
	}

	p.active = active;
	p.castling = castling;
	
	if (enpassant) {
		p.enpassant = enpassant;
	} else {
		p.enpassant = Point(null);
	}

	p.halfmove = halfmove;
	p.fullmove = fullmove;

	return p;
}
