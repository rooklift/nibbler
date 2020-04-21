"use strict";

// This is an object storing "sliders" for every piece except K and k which are special case.
// A slider is a list of vectors, which are distances from the origin.

function generate_movegen_sliders() {

	let rotate = xy => [-xy[1], xy[0]];		// Rotate a single vector of form [x,y]
	let flip = xy => [-xy[0], xy[1]];		// Flip a single vector, horizontally

	let ret = Object.create(null);

	// For each of B, R, N, make an initial slider and place it in a new list as item 0...
	ret.B = [[[1,1], [2,2], [3,3], [4,4], [5,5], [6,6], [7,7]]];
	ret.R = [[[1,0], [2,0], [3,0], [4,0], [5,0], [6,0], [7,0]]];
	ret.N = [[[1,2]]];

	// Add 3 rotations for each...
	for (let n = 0; n < 3; n++) {
		ret.B.push(ret.B[ret.B.length - 1].map(rotate));
		ret.R.push(ret.R[ret.R.length - 1].map(rotate));
		ret.N.push(ret.N[ret.N.length - 1].map(rotate));
	}

	// Add the knight mirrors...
	ret.N = ret.N.concat(ret.N.map(slider => slider.map(flip)));

	// Make the queen from the rook and bishop...
	ret.Q = ret.B.concat(ret.R);

	// Make the black lowercase versions...
	for (let key of Object.keys(ret)) {
		ret[key.toLowerCase()] = ret[key];
	}

	// Make the pawns...
	ret.P = [[[0,-1], [0,-2]], [[-1,-1]], [[1,-1]]];
	ret.p = [[[0,1], [0,2]], [[-1,1]], [[1,1]]];

	return ret;
}

let movegen_sliders = generate_movegen_sliders();
