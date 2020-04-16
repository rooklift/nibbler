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
	return val;
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

/*

Suggested test (note that depth 5 may cause Electron to break; try in Node proper):

	Perft("Q1r2knr/P1bp1p1p/2pn1q2/4p3/2PP2pB/1p3bP1/BP2PP1P/2R1NKNR w CHch - 0 1", 5)

Expect results:

	depth 4: 1006488
	depth 5: 29731327

In Stockfish:

	setoption name UCI_Chess960 value true
	ucinewgame
	position fen Q1r2knr/P1bp1p1p/2pn1q2/4p3/2PP2pB/1p3bP1/BP2PP1P/2R1NKNR w CHch - 0 1
	go perft 5

*/
