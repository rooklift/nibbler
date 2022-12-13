"use strict";

function Point(a, b) {

	// Each Point is represented by a single object so that naive equality checking works, i.e.
	// Point(x, y) === Point(x, y) should be true. Since object comparisons in JS will be false
	// unless they are the same object, we do the following...
	//
	// Returns null on invalid input, therefore the caller should take care to ensure that the
	// value is not null before accessing .x or .y or .s!

	if (Point.xy_lookup === undefined) {
		Point.xy_lookup = New2DArray(8, 8, null);
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
		[a, b] = XY(a);			// Possibly [-1, -1] if invalid
	}

	let col = Point.xy_lookup[a];
	if (col === undefined) return null;

	let ret = col[b];
	if (ret === undefined) return null;

	return ret;
}

function PointsBetween(a, b) {

	// Given points a and b, return a list of points between the two, inclusive.

	if (!a && !b) return [];
	if (!a) return [b];
	if (!b) return [a];

	if (a === b) {
		return [a];
	}

	let ok = false;

	if (a.x === b.x) {
		ok = true;
	}

	if (a.y === b.y) {
		ok = true;
	}

	if (Math.abs(a.x - b.x) === Math.abs(a.y - b.y)) {
		ok = true;
	}

	if (ok === false) {
		return [a, b];
	}

	let stepx = Sign(b.x - a.x);
	let stepy = Sign(b.y - a.y);

	let x = a.x;
	let y = a.y;

	let ret = [];

	while (1) {
		ret.push(Point(x, y));
		if (x === b.x && y === b.y) {
			return ret;
		}
		x += stepx;
		y += stepy;
	}
}
