"use strict";

let movegen_sliders = {};

// This is an object storing "sliders" for every piece except K and k which are special case.
//
// The idea is that, for every slider, if we travel along it and go offboard or hit a piece
// of our own colour, no move further along the slider will be legal. So we can skip them
// in the movegen.

function generate_movegen_sliders() {

	movegen_sliders["R"] = [];

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

					movegen_sliders["R"].push(slider);
					break;
				}

				slider.push([dx, dy]);
			}
		}
	}

	//

	movegen_sliders["B"] = [];

	for (let xstep of [-1, 1]) {

		for (let ystep of [-1, 1]) {

			let slider = [];

			let dx = 0;
			let dy = 0;

			while (1) {

				dx += xstep;
				dy += ystep;

				if (dx < - 7 || dy < -7 || dx > 7 || dy > 7) {

					movegen_sliders["B"].push(slider);
					break;
				}

				slider.push([dx, dy]);
			}
		}
	}

	//

	movegen_sliders["Q"] = movegen_sliders["R"].concat(movegen_sliders["B"]);

	//

	movegen_sliders["N"] = [];
	movegen_sliders["N"].push([[-2, -1]]);
	movegen_sliders["N"].push([[-1, -2]]);
	movegen_sliders["N"].push([[ 1, -2]]);
	movegen_sliders["N"].push([[ 2, -1]]);
	movegen_sliders["N"].push([[-2,  1]]);
	movegen_sliders["N"].push([[-1,  2]]);
	movegen_sliders["N"].push([[ 1,  2]]);
	movegen_sliders["N"].push([[ 2,  1]]);

	//

	movegen_sliders["q"] = movegen_sliders["Q"];
	movegen_sliders["r"] = movegen_sliders["R"];
	movegen_sliders["b"] = movegen_sliders["B"];
	movegen_sliders["n"] = movegen_sliders["N"];

	//

	movegen_sliders["P"] = [];
	movegen_sliders["P"].push([[0, -1], [0, -2]]);
	movegen_sliders["P"].push([[-1, -1]]);
	movegen_sliders["P"].push([[1, -1]]);

	movegen_sliders["p"] = [];
	movegen_sliders["p"].push([[0, 1], [0, 2]]);
	movegen_sliders["p"].push([[-1, 1]]);
	movegen_sliders["p"].push([[1, 1]]);
}

generate_movegen_sliders();
