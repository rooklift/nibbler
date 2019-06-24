"use strict";

const path = require("path");

let sprites = {
	loads: 0,
	fully_loaded: function() {
		return this.loads === 12;
	}
};

for (let c of Array.from("KkQqRrBbNnPp")) {
	sprites[c] = new Image();
	if (c === c.toUpperCase()) {
		sprites[c].src = path.join(__dirname, `../pieces/${c}.png`);
	} else {
		sprites[c].src = path.join(__dirname, `../pieces/_${c.toUpperCase()}.png`);
	}
	sprites[c].onload = () => {
		sprites.loads++;
	};
}

module.exports = sprites;
