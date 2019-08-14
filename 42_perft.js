function Perft(depth) {
	console.log(perft(LoadFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"), depth, true));
}

function PerftKiwi(depth) {
	console.log(perft(LoadFEN("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1"), depth, true));
}

function perft(pos, depth, print_moves) {

	let moves = pos.movegen();

	if (depth === 1) {
		return moves.length;
	} else {
		let count = 0;
		for (let mv of moves) {
			let val = perft(pos.move(mv), depth - 1);
			if (print_moves) {
				console.log(mv, val);
			}
			count += val;
		}
		return count;
	}
}
