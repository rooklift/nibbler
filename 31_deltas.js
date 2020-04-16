"use strict";

let movegen_deltas = {};

// This is an object storing "sliders" for every piece except K and k which are special case.
//
// The idea is that, for every slider, if we travel along it and go offboard or hit a piece
// of our own colour, no move further along the slider will be legal. So we can skip them
// in the movegen.

function generate_movegen_deltas() {

	movegen_deltas["R"] = {sliders: []};

	for (let xstep of [-1, 0, 1]) {

		for (let ystep of [-1, 0, 1]) {

			if (xstep === 0 && ystep === 0) continue;
			if (xstep !== 0 && ystep !== 0) continue;

			let slider = [];

			let dx = 0;
			let dy = 0;

			while (1) {

				dx += xstep;
				dy += ystep;

				if (dx < - 7 || dy < -7 || dx > 7 || dy > 7) {

					movegen_deltas["R"].sliders.push(slider);
					break;
				}

				slider.push([dx, dy]);
			}
		}
	}

	//

	movegen_deltas["B"] = {sliders: []};

	for (let xstep of [-1, 1]) {

		for (let ystep of [-1, 1]) {

			let slider = [];

			let dx = 0;
			let dy = 0;

			while (1) {

				dx += xstep;
				dy += ystep;

				if (dx < - 7 || dy < -7 || dx > 7 || dy > 7) {

					movegen_deltas["B"].sliders.push(slider);
					break;
				}

				slider.push([dx, dy]);
			}
		}
	}

	//

	movegen_deltas["Q"] = {};
	movegen_deltas["Q"].sliders = movegen_deltas["R"].sliders.concat(movegen_deltas["B"].sliders);

	//

	movegen_deltas["N"] = {sliders: []};
	movegen_deltas["N"].sliders.push([[-2, -1]]);
	movegen_deltas["N"].sliders.push([[-1, -2]]);
	movegen_deltas["N"].sliders.push([[ 1, -2]]);
	movegen_deltas["N"].sliders.push([[ 2, -1]]);
	movegen_deltas["N"].sliders.push([[-2,  1]]);
	movegen_deltas["N"].sliders.push([[-1,  2]]);
	movegen_deltas["N"].sliders.push([[ 1,  2]]);
	movegen_deltas["N"].sliders.push([[ 2,  1]]);

	//

	movegen_deltas["q"] = movegen_deltas["Q"];
	movegen_deltas["r"] = movegen_deltas["R"];
	movegen_deltas["b"] = movegen_deltas["B"];
	movegen_deltas["n"] = movegen_deltas["N"];

	//

	movegen_deltas["P"] = {sliders: []};
	movegen_deltas["P"].sliders.push([[0, -1], [0, -2]]);
	movegen_deltas["P"].sliders.push([[-1, -1]]);
	movegen_deltas["P"].sliders.push([[1, -1]]);

	movegen_deltas["p"] = {sliders: []};
	movegen_deltas["p"].sliders.push([[0, 1], [0, 2]]);
	movegen_deltas["p"].sliders.push([[-1, 1]]);
	movegen_deltas["p"].sliders.push([[1, 1]]);
}

generate_movegen_deltas();
