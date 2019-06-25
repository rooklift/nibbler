"use strict";

const path = require("path");

let sprites = {

	loads: 0,

	fully_loaded: function() {
		return this.loads === 12;
	},

	load_from: function(directory) {

		for (let c of Array.from("KkQqRrBbNnPp")) {
			sprites[c] = new Image();

			if (c === c.toUpperCase()) {
				sprites[c].src = path.join(directory, `${c}.png`);
			} else {
				sprites[c].src = path.join(directory, `_${c.toUpperCase()}.png`);
			}
			sprites[c].addEventListener("load", () => {sprites.loads++;}, {once: true});
		}
	},
};

module.exports = sprites;
