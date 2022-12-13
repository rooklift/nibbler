"use strict";

function c960_arrangement(n) {

	// Given n, generate a string like "RNBQKBNR".
	// AFAIK, matches the scheme of Reinhard Scharnagl.

	if (n < 0) {
		n *= -1;
	}
	n = Math.floor(n) % 960;

	let pieces = [".", ".", ".", ".", ".", ".", ".", "."];

	// Helper function to place a piece at an "index",
	// but considering only empty spots.

	let insert = (i, piece) => {
		for (let n = 0; n < 8; n++) {
			if (pieces[n] === "." && --i < 0) {		// Careful! Remember short-circuit rules etc.
				pieces[n] = piece;
				return;
			}
		}
	};

	// Place bishops in final positions...

	pieces[(Math.floor(n / 4) % 4) * 2] = "B";
	pieces[(n % 4) * 2 + 1] = "B";

	// Place queen in one of 6 remaining spots...

	let qi = Math.floor(n / 16) % 6;
	insert(qi, "Q");

	// Knights are arranged in one of 10 possible configurations
	// (considering only the remaining spots)...

	let ni1 = [0, 0, 0, 0, 1, 1, 1, 2, 2, 3][Math.floor(n / 96)];
	let ni2 = [1, 2, 3, 4, 2, 3, 4, 3, 4, 4][Math.floor(n / 96)];

	insert(ni2, "N");		// Must be done in this order,
	insert(ni1, "N");		// works because ni2 > ni1

	// Place left rook, king, right rook in first available spots...

	insert(0, "R");
	insert(0, "K");
	insert(0, "R");

	return pieces.join("");
}

function c960_fen(n) {

	// Given n, produce a full FEN.

	let pieces = c960_arrangement(n);	// The uppercase version.

	let s = `${pieces.toLowerCase()}/pppppppp/8/8/8/8/PPPPPPPP/${pieces}`;

	let castling_rights = "";

	for (let i = 0; i < 8; i++) {
		if (pieces[i] === "R") {
			castling_rights += String.fromCharCode(i + 65);
		}
	}

	castling_rights += castling_rights.toLowerCase();

	return `${s} w ${castling_rights} - 0 1`;
}
