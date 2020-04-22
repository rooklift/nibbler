"use strict";

// This makes an object storing "sliders" for every piece except K and k which are handled
// differently. A slider is a list of vectors, which are distances from the origin.

function generate_movegen_sliders() {

	let invert = n => n === 0 ? 0 : -n;							// Flip sign without introducing -0
	let rotate = xy => [invert(xy[1]), xy[0]];					// Rotate a single vector of form [x,y]
	let flip = xy => [invert(xy[0]), xy[1]];					// Flip a single vector, horizontally

	let ret = Object.create(null);

	// For each of B, R, N, make an initial slider and place it in a new list as item 0...
	ret.B = [[[1,1], [2,2], [3,3], [4,4], [5,5], [6,6], [7,7]]];
	ret.R = [[[1,0], [2,0], [3,0], [4,0], [5,0], [6,0], [7,0]]];
	ret.N = [[[1,2]]];

	// Add 3 rotations for each...
	for (let n = 0; n < 3; n++) {
		ret.B.push(ret.B[n].map(rotate));
		ret.R.push(ret.R[n].map(rotate));
		ret.N.push(ret.N[n].map(rotate));
	}

	// Add the knight mirrors (knights have 8 sliders of length 1)...
	ret.N = ret.N.concat(ret.N.map(slider => slider.map(flip)));

	// Make the queen from the rook and bishop...
	ret.Q = ret.B.concat(ret.R);

	// The black lowercase versions can point to the same objects...
	for (let key of Object.keys(ret)) {
		ret[key.toLowerCase()] = ret[key];
	}

	// Make the pawns...
	ret.P = [[[0,-1], [0,-2]], [[-1,-1]], [[1,-1]]];
	ret.p = [[[0,1], [0,2]], [[-1,1]], [[1,1]]];

	return ret;
}

let movegen_sliders = generate_movegen_sliders();
