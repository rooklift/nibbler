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
	if (!fen || !depth) throw "Need FEN and depth";
	let starttime = new Date();
	let board = LoadFEN(fen);
	let val = perft(board, depth, true);
	console.log(`Total.......... ${val} (${((new Date() - starttime) / 1000).toFixed(1)} seconds)`);
	if (perft_known_values[fen] && perft_known_values[fen][depth]) {
		if (perft_known_values[fen][depth] === val) {
			console.log("Known good result");
		} else {
			console.log(`Known BAD result -- expected ${perft_known_values[fen][depth]}`);
		}
	}
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

// In Stockfish:
//		setoption name UCI_Chess960 value true
//		position fen <whatever>
//		go perft 4

let perft_known_values = {
	"Qr3knr/P1bp1p1p/2pn1q2/4p3/2PP2pB/1p1N1bP1/BP2PP1P/1R3KNR w BHbh - 0 1": [0, 31, 1122, 34613, 1253934, 40393041],
	"1nr1nk1r/1b5B/p1p1qp2/b2pp1pP/3P2P1/P3P2N/1Pp2P2/BNR2KQR w CHch g6 0 1": [0, 28, 964, 27838, 992438, 30218648],
};
