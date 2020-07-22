"use strict";

function background(light, dark) {

	let c = document.createElement("canvas");
	c.width = 8;
	c.height = 8;
	let ctx = c.getContext("2d");

	for (let x = 0; x < 8; x++) {
		for (let y = 0; y < 8; y++) {
			ctx.fillStyle = (x + y) % 2 === 0 ? light : dark;
			ctx.fillRect(x, y, 1, 1);
		}
	}

	// I guess the canvas c gets garbage-collected?

	return `url("${c.toDataURL("image/png")}")`;
}

module.exports = background;
