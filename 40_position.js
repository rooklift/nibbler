"use strict";


//		Note that ALL CASTLING MOVES are expected to be in format KING-TO-ROOK
//		That is, only Chess960 format is allowed.


const position_prototype = {

	move: function(s) {

		// s is some valid UCI move like "d1f3" or "e7e8q". For the most part, this function
		// assumes the move is legal - all sorts of weird things can happen if this isn't so.
		//
		// As an exception, note that position.illegal() does call this to make a temp board
		// that can be used to test for moves that leave the king in check, so this method
		// must "work" for such illegal moves.

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
		
		let white_flag = ret.is_white(Point(x1, y1));
		let pawn_flag = ret.state[x1][y1] === "P" || ret.state[x1][y1] === "p";
		let castle_flag = (ret.state[x2][y2] === "R" && white_flag) || (ret.state[x2][y2] === "r" && white_flag === false);
		let capture_flag = castle_flag === false && ret.state[x2][y2] !== "";

		if (pawn_flag && x1 !== x2) {		// Make sure capture_flag is set even for enpassant captures
			capture_flag = true;
		}

		// Update castling info...

		if (y1 === 7 && ret.state[x1][y1] === "K") {
			ret.__delete_white_castling();
		}

		if (y1 === 0 && ret.state[x1][y1] === "k") {
			ret.__delete_black_castling();
		}

		if (y1 === 7 && ret.state[x1][y1] === "R") {			// White rook moved.
			let ch = String.fromCharCode(x1 + 65);
			ret.__delete_castling_char(ch);
		}

		if (y2 === 7 && ret.state[x2][y2] === "R") {			// White rook was captured (or castled onto).
			let ch = String.fromCharCode(x2 + 65);
			ret.__delete_castling_char(ch);
		}

		if (y1 === 0 && ret.state[x1][y1] === "r") {			// Black rook moved.
			let ch = String.fromCharCode(x1 + 97);
			ret.__delete_castling_char(ch);
		}

		if (y2 === 0 && ret.state[x2][y2] === "r") {			// Black rook was captured (or castled onto).
			let ch = String.fromCharCode(x2 + 97);
			ret.__delete_castling_char(ch);
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

		// Handle the moves of castling...

		if (castle_flag) {

			let k_ch = ret.state[x1][y1];
			let r_ch = ret.state[x2][y2];

			if (x2 > x1) {		// Kingside castling

				ret.state[x1][y1] = "";
				ret.state[x2][y2] = "";
				ret.state[6][y1] = k_ch;
				ret.state[5][y1] = r_ch;

			} else {			// Queenside castling

				ret.state[x1][y1] = "";
				ret.state[x2][y2] = "";
				ret.state[2][y1] = k_ch;
				ret.state[3][y1] = r_ch;

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

		// Actually make the move (except we already did castling)...

		if (castle_flag === false) {
			ret.state[x2][y2] = ret.state[x1][y1];
			ret.state[x1][y1] = "";
		}

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

	__delete_castling_char: function(delete_char) {
		let new_rights = "";
		for (let ch of this.castling) {
			if (ch !== delete_char) {
				new_rights += ch;
			}
		}
		this.castling = new_rights;
	},

	__delete_white_castling: function() {
		let new_rights = "";
		for (let ch of this.castling) {
			if ("a" <= ch && ch <= "h") {		// i.e. black survives
				new_rights += ch;
			}
		}
		this.castling = new_rights;
	},

	__delete_black_castling: function() {
		let new_rights = "";
		for (let ch of this.castling) {
			if ("A" <= ch && ch <= "H") {		// i.e. white survives
				new_rights += ch;
			}
		}
		this.castling = new_rights;
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

		if (["N", "n"].includes(this.state[x1][y1])) {
			if (Math.abs(x2 - x1) + Math.abs(y2 - y1) !== 3) {
				return "illegal knight movement";
			}
			if (Math.abs(x2 - x1) === 0 || Math.abs(y2 - y1) === 0) {
				return "illegal knight movement";
			}
		}

		if (["B", "b"].includes(this.state[x1][y1])) {
			if (Math.abs(x2 - x1) !== Math.abs(y2 - y1)) {
				return "illegal bishop movement";
			}
		}

		if (["R", "r"].includes(this.state[x1][y1])) {
			if (Math.abs(x2 - x1) > 0 && Math.abs(y2 - y1) > 0) {
				return "illegal rook movement";
			}
		}

		if (["Q", "q"].includes(this.state[x1][y1])) {
			if (Math.abs(x2 - x1) !== Math.abs(y2 - y1)) {
				if (Math.abs(x2 - x1) > 0 && Math.abs(y2 - y1) > 0) {
					return "illegal queen movement";
				}
			}
		}

		// Pawns...

		if (["P", "p"].includes(this.state[x1][y1])) {

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

		if (["K", "k"].includes(this.state[x1][y1])) {

			if (Math.abs(y2 - y1) > 1) {
				return "illegal king movement";
			}

			if (Math.abs(x2 - x1) > 1) {
				return "illegal king movement";
			}
		}

		// Check for blockers (pieces between source and dest).

		if (["K", "Q", "R", "B", "P", "k", "q", "r", "b", "p"].includes(this.state[x1][y1])) {
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
		if (tmp.can_capture_king()) {
			return "king in check";
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
			return "cannot castle off the back rank";
		}

		if (colour === "b" && y1 !== 0) {
			return "cannot castle off the back rank";
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
			if (this.attacked(Point(x, y1), this.active)) {
				return "cannot castle [out of / through / into] check";
			}
			if (x === x1 || x === x2) {
				continue;					// After checking for checks
			}
			if (this.state[x][y1] !== "") {
				return "castling blocked for king movement";
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

		// Check that the king doesn't end up in check anyway...
		// q1nnkbbr/p1pppppp/8/1P6/8/3NN3/1PPPPPPP/rR2KBBR w BHh - 0 5

		let tmp = this.move(Point(x1, y1).s + Point(x2, y2).s);

		if (tmp.attacked(Point(king_target_x, y1), this.active)) {
			return "king ends in check";
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

	can_capture_king: function() {

		// Can the side to move capture the opponent's king? Helper function for illegal() etc.
		// But this is slow, do not use when king location is known - just call attacked() instead.

		let kch = this.active === "w" ? "k" : "K";			// i.e. the INACTIVE king
		let opp_colour = this.active === "w" ? "b" : "w";

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				if (this.state[x][y] === kch) {
					if (this.attacked(Point(x, y), opp_colour)) {
						return true;
					} else {
						return false;
					}
				}
			}
		}

		return false;		// King not actually present...
	},

	king_in_check: function() {

		// Don't call this if the king position is already
		// known since this method uses an expensive find().

		let kch = this.active === "w" ? "K" : "k";
		let king_loc = this.find(kch)[0];

		if (king_loc === undefined) {
			return false;
		}

		return this.attacked(king_loc, this.active);
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

			if (["N", "n"].includes(this.state[x][y])) {
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

		let ranged_attackers = ["Q", "q", "R", "r"];	// Ranged attackers that can go in a cardinal direction.
		if (step_x !== 0 && step_y !== 0) {
			ranged_attackers = ["Q", "q", "B", "b"];	// Ranged attackers that can go in a diagonal direction.
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

				if (["K", "k"].includes(this.state[x][y])) {
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
		// Search range is INCLUSIVE. Result returned as a list of points.
		// You can call this function with just a piece to search the whole board.

		if (startx === undefined) startx = 0;
		if (starty === undefined) starty = 0;
		if (endx === undefined) endx = 7;
		if (endy === undefined) endy = 7;

		// Calling with out of bounds args should also work...

		if (startx < 0) startx = 0;
		if (startx > 7) startx = 7;
		if (starty < 0) starty = 0;
		if (starty > 7) starty = 7;
		if (endx < 0) endx = 0;
		if (endx > 7) endx = 7;
		if (endy < 0) endy = 0;
		if (endy > 7) endy = 7;

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

	find_castling_move: function(long_flag) {		// Returns a (possibly illegal) castling move (e.g. "e1h1") or ""

		let king_loc;

		if (this.active === "w") {
			king_loc = this.find("K", 0, 7, 7, 7)[0];
		} else {
			king_loc = this.find("k", 0, 0, 7, 0)[0];
		}

		if (king_loc === undefined) {
			return "";
		}

		let possible_rights_chars;

		if (this.active === "w") {
			possible_rights_chars = ["A", "B", "C", "D", "E", "F", "G", "H"];
		} else {
			possible_rights_chars = ["a", "b", "c", "d", "e", "f", "g", "h"];
		}

		if (long_flag) {
			possible_rights_chars = possible_rights_chars.slice(0, king_loc.x);
		} else {
			possible_rights_chars = possible_rights_chars.slice(king_loc.x + 1);
		}

		for (let ch of possible_rights_chars) {
			if (this.castling.includes(ch)) {
				if (this.active === "w") {
					return king_loc.s + ch.toLowerCase() + "1";
				} else {
					return king_loc.s + ch + "8";
				}
			}
		}

		return "";
	},

	parse_pgn: function(s) {		// Returns a UCI move and an error message.

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

		s = ReplaceAll(s, "0-0-0", "O-O-O");
		s = ReplaceAll(s, "0-0", "O-O");

		if (s.toUpperCase() === "O-O") {

			let mv = this.find_castling_move(false);

			if (mv !== "" && this.illegal(mv) === "") {
				return [mv, ""];
			} else {
				return ["", "illegal castling"];
			}
		}

		if (s.toUpperCase() === "O-O-O") {

			let mv = this.find_castling_move(true);
			
			if (mv !== "" && this.illegal(mv) === "") {
				return [mv, ""];
			} else {
				return ["", "illegal castling"];
			}
		}

		// Just in case, delete any "-" characters (after handling castling, of course)...

		s = ReplaceAll(s, "-", "");

		// If an = sign is present, save promotion string, then delete it from s...

		let promotion = "";

		if (s[s.length - 2] === "=") {
			promotion = s[s.length - 1].toLowerCase();
			s = s.slice(0, -2);
		}

		// A lax writer might also write the promotion string without an equals sign...

		if (promotion === "") {
			if (["Q", "R", "B", "N", "q", "r", "b", "n"].includes(s[s.length - 1])) {
				promotion = s[s.length - 1].toLowerCase();
				s = s.slice(0, -1);
			}
		}

		// If the piece isn't specified (with an uppercase letter) then it's a pawn move.
		// Let's add P to the start of the string to keep the string format consistent...

		if (["K", "Q", "R", "B", "N", "P"].includes(s[0]) === false) {
			s = "P" + s;
		}

		// Now this works...

		let piece = s[0];

		// We care about the colour of the piece, so make black pieces lowercase...

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

		for (let c of disambig) {
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
		return ["K", "Q", "R", "B", "N", "P"].includes(piece);		// Can't do "KQRBNP".includes() as that catches "".
	},

	is_black: function(point) {
		let piece = this.piece(point);
		return ["k", "q", "r", "b", "n", "p"].includes(piece);		// Can't do "kqrbnp".includes() as that catches "".
	},

	is_empty: function(point) {
		return this.piece(point) === "";
	},

	colour: function(point) {
		let piece = this.piece(point);
		if (piece === "") {
			return "";
		}
		if (["K", "Q", "R", "B", "N", "P"].includes(piece)) {
			return "w";
		}
		return "b";
	},

	same_colour: function(point1, point2) {
		return this.colour(point1) === this.colour(point2);
	},

	movegen: function(one_only = false) {

		let moves = [];

		for (let x = 0; x < 8; x++) {

			for (let y = 0; y < 8; y++) {

				let source = Point(x, y);

				if (this.colour(source) !== this.active) {
					continue;
				}

				let piece = this.state[x][y];

				if (piece !== "K" && piece !== "k") {		// We don't include kings because castling is troublesome.

					for (let slider of movegen_sliders[piece]) {

						// The sliders are lists where, if one move is blocked, every subsequent move in the slider is also
						// blocked. Note that the test is "blocked / offboard". The test is not "is illegal" - sometimes one
						// move will be illegal but a move further down the slider will be legal - e.g. if it blocks a check.

						for (let [dx, dy] of slider) {

							let x2 = x + dx;
							let y2 = y + dy;

							if (x2 < 0 || x2 > 7 || y2 < 0 || y2 > 7) {		// No move further along the slider will be legal.
								break;
							}

							let dest = Point(x2, y2);
							let dest_colour = this.colour(dest);

							if (dest_colour === this.active) {				// No move further along the slider will be legal.
								break;
							}

							let move = source.s + dest.s;

							if ((piece === "P" && dest.y === 0) || (piece === "p" && dest.y === 7)) {
								if (this.illegal(move + "q") === "") {
									moves.push(move + "q");
									if (one_only) {
										return moves;
									}
									moves.push(move + "r");
									moves.push(move + "b");
									moves.push(move + "n");
								}
							} else {
								if (this.illegal(move) === "") {
									moves.push(move);
									if (one_only) {
										return moves;
									}
								}
							}

							if (dest_colour !== "") {						// No move further along the slider will be legal.
								break;
							}
						}
					}

				} else {

					// King moves that involve vertical direction...

					for (let dx of [-1, 0, 1]) {
						for (let dy of [-1, 1]) {
							let x2 = x + dx;
							let y2 = y + dy;
							if (x2 < 0 || x2 > 7 || y2 < 0 || y2 > 7) {
								continue;
							}
							let dest = Point(x2, y2);
							let move = source.s + dest.s;
							if (this.illegal(move) === "") {
								moves.push(move);
								if (one_only) {
									return moves;
								}
							}
						}
					}

					// Horizontal king moves (including castling moves)...

					for (let x2 = 0; x2 < 8; x2++) {
						let dest = Point(x2, y);
						let move = source.s + dest.s;
						if (this.illegal(move) === "") {
							moves.push(move);
							if (one_only) {
								return moves;
							}
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

	no_moves: function() {
		return this.movegen(true).length === 0;
	},

	c960_castling_converter: function(s) {

		// Given some move s, convert it to the new Chess 960 castling format if needed.

		if (s === "e1g1" && this.state[4][7] === "K" && this.castling.includes("G") === false) return "e1h1";
		if (s === "e1c1" && this.state[4][7] === "K" && this.castling.includes("C") === false) return "e1a1";
		if (s === "e8g8" && this.state[4][0] === "k" && this.castling.includes("g") === false) return "e8h8";
		if (s === "e8c8" && this.state[4][0] === "k" && this.castling.includes("c") === false) return "e8a8";
		return s;
	},

	nice_string: function(s) {

		// Given some raw (but valid) UCI move string, return a nice human-readable
		// string for display in the browser window. This string should never be
		// examined by the caller, merely displayed.
		// 
		// Note that as of 1.1.6, all castling moves are expected to be king-onto-rook,
		// that is, Chess960 format.

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
			if (next_board.no_moves()) {
				check = "#";
			} else {
				check = "+";
			}
		}

		if (["K", "k", "Q", "q", "R", "r", "B", "b", "N", "n"].includes(piece)) {

			if (["K", "k"].includes(piece)) {
				if (this.colour(dest) === this.colour(source)) {
					if (dest.x > source.x) {
						return `O-O${check}`;
					} else {
						return `O-O-O${check}`;
					}
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

	fen: function(friendly_flag) {		// friendly_flag - for when the engine isn't the consumer.

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

		// While interally (and when sending to the engine) we always use Chess960 format,
		// we can return a more friendly FEN if asked (and if the position is normal Chess).
		// Relies on our normalchess flag being accurate... (potential for bugs there).

		if (friendly_flag && this.normalchess && castling_string !== "-") {
			let new_castling_string = "";
			if (castling_string.includes("H")) new_castling_string += "K";
			if (castling_string.includes("A")) new_castling_string += "Q";
			if (castling_string.includes("h")) new_castling_string += "k";
			if (castling_string.includes("a")) new_castling_string += "q";
			castling_string = new_castling_string;
		}

		return s + ` ${this.active} ${castling_string} ${ep_string} ${this.halfmove} ${this.fullmove}`;
	},

	copy: function() {
		return NewPosition(this.state, this.active, this.castling, this.enpassant, this.halfmove, this.fullmove, this.normalchess);
	},
};

function NewPosition(state = null, active = "w", castling = "", enpassant = null, halfmove = 0, fullmove = 1, normalchess = false) {

	let p = Object.create(position_prototype);

	p.state = [
		["","","","","","","",""],
		["","","","","","","",""],
		["","","","","","","",""],
		["","","","","","","",""],
		["","","","","","","",""],
		["","","","","","","",""],
		["","","","","","","",""],
		["","","","","","","",""],
	];

	if (state) {
		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				let piece = state[x][y];
				if (piece !== "") {
					p.state[x][y] = piece;
				}
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

	p.normalchess = normalchess;

	return p;
}
