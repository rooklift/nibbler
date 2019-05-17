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

function NewPosition() {

	let p = Object.create(null);

	p.board = Object.create(null);		// map of coord --> piece

	for (let x = 1; x <= 8; x++) {
		let letter = String.fromCharCode(x + 96);
		for (let y = 1; y <= 8; y++) {
			let coord = letter + y.toString();
			p.board[coord] = "";
		}
	}

	p.active = "w";
	p.castling = "";
	p.enpassant = "-";

	p.halfmove = 0;						// ply since pawn advance or capture
	p.fullmove = 1;						// traditional move counter - incrememt after Black's turn

	return p;
}

function PositionFromFEN(fen) {

	// rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1

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

	for (let y = 8; y >= 1; y--) {

		let row = rows[8 - y];
		let chars = Array.from(row);

		let x = 1;

		for (let c of chars) {

			if ("12345678".includes(c)) {
				x += parseInt(c, 10);
				continue;
			}

			if ("KkQqRrBbNnPp".includes(c)) {
				let letter = String.fromCharCode(x + 96);
				let coord = letter + y;
				ret.board[coord] = c;
				x++;
				continue;
			}

			throw "Invalid FEN - unknown piece";

		}

		if (x !== 9) {
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
	if (tokens[3] === "-") {
		ret.enpassant = tokens[3];
	} else {
		if (ret.board[tokens[3]] === undefined) {			// not a valid square
			throw "Invalid FEN - en passant";
		}
		ret.enpassant = tokens[3];
	}

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
	renderer.pos = PositionFromFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");

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

		for (let x = 1; x <= 8; x++) {
			let letter = String.fromCharCode(x + 96);
			for (let y = 1; y <= 8; y++) {
				let coord = letter + y.toString();
				let piece = renderer.pos.board[coord];
				if (piece !== "") {
					let screen_x = (x - 1) * rss;
					let screen_y = (8 - y) * rss;
					context.drawImage(images[piece], screen_x, screen_y, rss, rss);
				}
			}
		}
	}

	renderer.await_loads = () => {
		if (loads < 12) {
			setTimeout(renderer.await_loads, 100);
		} else {
			renderer.go();
		}
	}

	renderer.go = () => {
		renderer.draw();
	}

	return renderer;
}

let renderer = make_renderer();
renderer.await_loads();