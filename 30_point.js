"use strict";

// The point of most of this is to make each Point represented by a single object so that
// naive equality checking works, i.e. Point(x, y) === Point(x, y) should be true. Since
// object comparisons in JS will be false unless they are the same object, we do all this...

function Point(a, b) {

	if (Point.xy_lookup === undefined) {
		Point.xy_lookup = New2DArray(8, 8);
		Point.s_lookup = Object.create(null);
		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				let s = S(x, y);
				let point = Object.freeze({x, y, s});
				Point.xy_lookup[x][y] = point;
				Point.s_lookup[s] = point;
			}
		}
		Point.null_point = Object.freeze({x: -1, y: -1, s: "??"});
	}

	// Point("a8") or Point(0, 0) are both valid.

	if (b === undefined) {
		let ret = Point.s_lookup[a];
		if (ret === undefined) {
			return Point.null_point;
		}
		return ret;
	}

	let col = Point.xy_lookup[a];
	if (col === undefined) return Point.null_point;

	let ret = col[b];
	if (ret === undefined) return Point.null_point;

	return ret;
}

// Note: I rather regret now the existence of Point(null) - it means there's two
// different ways for a variable that usually holds a Point to be null - either
// having the actual null (or undefined) value, or the Point(null) value. Alas.
