"use strict";

/* Perft notes:

The correct perft value for a position and depth is the number of leaf nodes at
that depth (or equivalently, the number of legal move sequences of that length).

Some important points:

- Rules about "Triple Repetition" and "Insufficient Material" are ignored.
- Terminal nodes (mates) at a shallower depth are not counted.
- But they are counted if they are at the correct depth.

*/

function Perft(fen, depth) {
	if (!fen || !depth) {
		throw "Need FEN and depth";
	}
	let val = perft(LoadFEN(fen), depth, true);
	console.log("Total..........", val);
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
				perft_print_move(pos, mv, val);
			}
			count += val;
		}
		return count;
	}
}

function perft_print_move(pos, mv, val) {
	let nice = pos.nice_string(mv);
	console.log(`${mv + (mv.length === 4 ? " " : "")}   ${nice + " ".repeat(7 - nice.length)}`, val);
}
