"use strict";

// The point of most of this is to make each Point represented by a single object so that
// naive equality checking works, i.e. Point(x, y) === Point(x, y) should be true. Since
// object comparisons in JS will be false unless they are the same object, we do all this...

function Point(a, b) {

	// We store the 64+1 point objects in the function object itself,
	// like static variables. On the first call, make them...

	if (Point.all_points === undefined) {

		Point.all_points = Object.create(null);
		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				let s = S(x, y);
				Point.all_points[s] = Object.freeze({x, y, s});
			}
		}

		Point.null_point = Object.freeze({x: -1, y: -1, s: "??"});
	}

	// Point("a8") or Point(0, 0) are both valid.

	let s;

	if (typeof a === "string") {		// Check if string, then check if not numbers...
		s = a;
	} else if (typeof a !== "number" || typeof b !== "number") {
		return Point.null_point;
	} else {
		s = S(a, b);
	}

	let p = Point.all_points[s];

	if (p === undefined) {
		return Point.null_point;
	}

	return p;
}

// Note: I rather regret now the existence of Point(null) - it means there's two
// different ways for a variable that usually holds a Point to be null - either
// having the actual null (or undefined) value, or the Point(null) value. Alas.
