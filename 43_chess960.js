function c960_insertion(arr, index, piece) {

	// index here is the piece's position considering only empty spots in the array.

	let skips = 0;

	for (let i = 0; i < 8; i++) {
		if (arr[i] === ".") {
			if (skips === index) {
				arr[i] = piece;
				return;
			} else {
				skips++;
			}
		}
	}
}

function c960_arrangement(n) {

	let pieces = [".", ".", ".", ".", ".", ".", ".", "."];

	// Place bishops in final positions...

	pieces[(Math.floor(n / 4) % 4) * 2] = "B";
	pieces[(n % 4) * 2 + 1] = "B";

	// Place queen in one of 6 remaining spots...

	let i = Math.floor(n / 16) % 6;
	c960_insertion(pieces, i, "Q");

	// Place first knight in one of 5 spots, never actually using index 4...

	i = [0, 0, 0, 0, 1, 1, 1, 2, 2, 3][Math.floor(n / 96)];
	c960_insertion(pieces, i, "N");

	// Place second knight in one of 4 spots...

	i = [0, 1, 2, 3, 1, 2, 3, 2, 3, 3][Math.floor(n / 96)];
	c960_insertion(pieces, i, "N");

	// Place left rook, king, right rook in first available spots...

	c960_insertion(pieces, 0, "R");
	c960_insertion(pieces, 0, "K");
	c960_insertion(pieces, 0, "R");

	return pieces.join("");
}

function c960_fen(n) {

	if (n < 0) {
		n *= -1;
	}
	n = Math.floor(n) % 960;

	let pieces = c960_arrangement(n);	// The uppercase version.

	let s = `${pieces.toLowerCase()}/pppppppp/8/8/8/8/PPPPPPPP/${pieces}`;

	let castling_rights = "";

	for (let i = 0; i < 8; i++) {
		if (pieces[i] === "R") {
			castling_rights += String.fromCharCode(i + 65);
			for (let j = i + 1; j < 8; j++) {
				if (pieces[j] === "R") {
					castling_rights += String.fromCharCode(j + 65);
					break;
				}
			}
			break;
		}
	}

	castling_rights += castling_rights.toLowerCase();

	return `${s} w ${castling_rights} - 0 1`;
}
