"use strict";

// The point of most of this is to make each Point represented by a single object so that
// naive equality checking works, i.e. Point(x, y) === Point(x, y) should be true. Since
// object comparisons in JS will be false unless they are the same object, we do all this...
//
// Returns null on invalid input, therefore the caller should take care to ensure that the
// value is not null before accessing .x or .y or .s!

function Point(a, b) {

	if (Point.xy_lookup === undefined) {
		Point.xy_lookup = New2DArray(8, 8);
		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				let s = S(x, y);
				let point = Object.freeze({x, y, s});
				Point.xy_lookup[x][y] = point;
			}
		}
	}

	// Point("a8") or Point(0, 0) are both valid.

	if (b === undefined) {
		[a, b] = XY(a);
	}

	let col = Point.xy_lookup[a];
	if (col === undefined) return null;

	let ret = col[b];
	if (ret === undefined) return null;

	return ret;
}
