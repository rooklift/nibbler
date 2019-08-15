"use strict";

function Perft(fen, depth) {
	if (!fen || !depth) {
		throw "Need FEN and depth";
	}
	let val = perft(LoadFEN(fen), depth, true)
	console.log("Perft output...", val);
}

function perft(pos, depth, print_moves) {

	let moves = pos.movegen();

	if (depth === 1) {
		return moves.length;
	} else {
		let count = 0;
		for (let mv of moves) {
			let val = perft(pos.move(mv), depth - 1, false);
			if (print_moves) {
				console.log(mv, val);
			}
			count += val;
		}
		return count;
	}
}
