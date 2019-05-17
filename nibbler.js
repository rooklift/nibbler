"use strict";

const canvas = document.getElementById("canvas");
const context = canvas.getContext("2d");

const light = "#dadada";
const dark = "#b4b4b4";

let images = Object.create(null);
let loads = 0;

for (let c of Array.from("KkQqRrBbNnPp")) {
	images[c] = new Image();
	if (c === c.toUpperCase()) {
		images[c].src = `./pieces/${c}.png`;
	} else {
		images[c].src = `./pieces/_${c.toUpperCase()}.png`;
	}
	images[c].onload = () => { loads++ };
}

function XY(s) {
	if (s.length !== 2) {
		return [-1, -1];
	}
	s = s.toLowerCase();
	let x = s.charCodeAt(0) - 97;
	let y = 8 - parseInt(s[1], 10);
	if (x < 0 || x > 7 || y < 0 || y > 7 || Number.isNaN(y)) {
		return [-1, -1];
	}
	return [x, y];
}

function S(x, y) {
	if (typeof x !== "number" || typeof y !== "number" || x < 0 || x > 7 || y < 0 || y > 7) {
		return "??";
	}
	let xs = String.fromCharCode(x + 97);
	let ys = String.fromCharCode((8 - y) + 48);
	return xs + ys;
}

function NewPosition(state = null, active = "w", castling = "", enpassant = null, halfmove = 0, fullmove = 1, parent = null) {

	let p = Object.create(null);
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
	
	p.enpassant = [-1, -1];
	if (enpassant) {
		if (typeof enpassant === "string") {
			p.enpassant = XY(enpassant);
		} else {
			p.enpassant[0] = enpassant[0];
			p.enpassant[1] = enpassant[1];
		}
	}

	p.halfmove = halfmove;
	p.fullmove = fullmove;

	p.parent = parent;

	p.copy = () => {
		return NewPosition(p.state, p.active, p.castling, p.enpassant, p.halfmove, p.fullmove, p.parent);
	};

	p.move = (s) => {

		let ret = p.copy();
		ret.parent = p;

		let [x1, y1] = XY(s.slice(0, 2));
		let [x2, y2] = XY(s.slice(2, 4));
		let promotion = s.length > 4 ? s[4] : "q";

		let white_flag = ret.state[x1][y1] === ret.state[x1][y1].toUpperCase();
		let pawn_flag = "Pp".includes(ret.state[x1][y1]);
		let capture_flag = ret.state[x2][y2] !== "";

		if (pawn_flag && x1 !== x2) {		// Make sure capture_flag is set even for e.p. captures
			capture_flag = true;
		}

		// Update castling info...

		if (ret.state[x1][y1] === "K") {
			ret.castling = ret.castling.replace("K", "");
			ret.castling = ret.castling.replace("Q", "");
		}

		if (ret.state[x1][y1] === "k") {
			ret.castling = ret.castling.replace("k", "");
			ret.castling = ret.castling.replace("q", "");
		}

		if ((x1 == 0 && y1 == 0) || (x2 == 0 && y2 == 0)) {
			ret.castling = ret.castling.replace("q", "");
		}

		if ((x1 == 7 && y1 == 0) || (x2 == 7 && y2 == 0)) {
			ret.castling = ret.castling.replace("k", "");
		}

		if ((x1 == 0 && y1 == 7) || (x2 == 0 && y2 == 7)) {
			ret.castling = ret.castling.replace("Q", "");
		}

		if ((x1 == 7 && y1 == 7) || (x2 == 7 && y2 == 7)) {
			ret.castling = ret.castling.replace("K", "");
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

		if (ret.state[x1][y1] === "K" && x1 === 4 && x2 === 6) {
			ret.state[5][7] = "R";
			ret.state[7][7] = "";
		}

		if (ret.state[x1][y1] === "K" && x1 === 4 && x2 === 2) {
			ret.state[3][7] = "R";
			ret.state[0][7] = "";
		}

		if (ret.state[x1][y1] === "k" && x1 === 4 && x2 === 6) {
			ret.state[5][0] = "r";
			ret.state[7][0] = "";
		}

		if (ret.state[x1][y1] === "k" && x1 === 4 && x2 === 2) {
			ret.state[3][0] = "r";
			ret.state[0][0] = "";
		}

		// Handle e.p. captures...

		if (pawn_flag && capture_flag && ret.state[x2][y2] === "") {
			ret.state[x2][y1] = "";
		}

		// Set e.p. square...

		ret.enpassant = [-1, -1];

		if (pawn_flag && y1 === 6 && y2 === 4) {
			ret.enpassant = [x1, 5];
		}

		if (pawn_flag && y1 === 1 && y2 === 3) {
			ret.enpassant = [x1, 2];
		}

		// Actually make the move...

		ret.state[x2][y2] = ret.state[x1][y1];
		ret.state[x1][y1] = "";

		// Handle promotions...

		if (y2 === 0 && pawn_flag) {
			ret.state[x2][y2] = promotion.toUpperCase();
		}

		if (y2 === 7 && pawn_flag) {
			ret.state[x2][y2] = promotion.toLowerCase();
		}

		// Set active player...

		ret.active = white_flag ? "b" : "w";

		return ret;
	};

	return p;
}

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
	let chars = Array.from(tokens[2]);
	for (let c of chars) {
		if ("KQkq".includes(c)) {
			if (ret.castling.includes(c) === false) {
				ret.castling += c;
			}
		} else {
			throw "Invalid FEN - castling rights";
		}
	}

	tokens[3] = tokens[3].toLowerCase();
	ret.enpassant = XY(tokens[3]);				// XY() sanitises bad stuff to [-1, -1]
	
	ret.halfmove = parseInt(tokens[4], 10);
	if (Number.isNaN(ret.halfmove)) {
		throw "Invalid FEN - halfmoves";
	}

	ret.fullmove = parseInt(tokens[5], 10);
	if (Number.isNaN(ret.fullmove)) {
		throw "Invalid FEN - fullmoves";
	}

	return ret;
}

function make_renderer() {

	let renderer = Object.create(null);
	renderer.pos = LoadFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");

	renderer.square_size = () => {
		return 80;
	};

	renderer.draw = () => {

		let rss = renderer.square_size();

		canvas.width = rss * 8;
		canvas.height = rss * 8;

		context.fillStyle = light;
		context.fillRect(0, 0, canvas.width, canvas.height);

		context.fillStyle = dark;

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				if (x % 2 !== y % 2) {
					context.fillRect(x * rss, y * rss, rss, rss);
				}
			}
		}

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				let piece = renderer.pos.state[x][y];
				if (piece !== "") {
					let screen_x = x * rss;
					let screen_y = y * rss;
					context.drawImage(images[piece], screen_x, screen_y, rss, rss);
				}
			}
		}
	};

	renderer.await_loads = () => {
		if (loads < 12) {
			setTimeout(renderer.await_loads, 100);
		} else {
			renderer.go();
		}
	};

	renderer.go = () => {
		renderer.draw();
	};

	renderer.move = (s) => {
		renderer.pos = renderer.pos.move(s);
		renderer.draw();
	};

	renderer.undo = () => {
		if (renderer.pos.parent) {
			renderer.pos = renderer.pos.parent;
			renderer.draw();
		}
	};

	return renderer;
}

let renderer = make_renderer();
renderer.await_loads();

renderer.move("e2e4");
renderer.move("g8f6");