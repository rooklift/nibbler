"use strict";

const fs = require("fs");
const path = require("path");

let sprites = {

	loads: 0,

	fully_loaded: function() {
		return this.loads === 12;
	},

	validate_folder: function(directory) {

		if (typeof directory !== "string") {
			return false;
		}

		for (let c of "KkQqRrBbNnPp") {

			if (!fs.existsSync(path.join(directory, `${c.toUpperCase()}.svg`))) {
				if (!fs.existsSync(path.join(directory, `${c.toUpperCase()}.png`))) {
					return false;
				}
			}

			if (!fs.existsSync(path.join(directory, `_${c.toUpperCase()}.svg`))) {
				if (!fs.existsSync(path.join(directory, `_${c.toUpperCase()}.png`))) {
					return false;
				}
			}
		}

		return true;
	},

	load_from: function(directory) {

		let urlsafe_directory = directory.replace(/#/g, "%23");		// Looks like replacing # with %23 is the only thing that's needed? Maybe some others??

		sprites.loads = 0;

		for (let c of "KkQqRrBbNnPp") {

			sprites[c] = new Image();
			sprites[c].addEventListener("load", () => {sprites.loads++;}, {once: true});

			if (c === c.toUpperCase()) {

				sprites[c].addEventListener("error", () => {console.log(`Failed to load image ${c}.svg or ${c}.png`);}, {once: true});

				if (fs.existsSync(path.join(directory, `${c}.svg`))) {
					sprites[c].src = path.join(urlsafe_directory, `${c}.svg`);
				} else if (fs.existsSync(path.join(directory, `${c}.png`))) {
					sprites[c].src = path.join(urlsafe_directory, `${c}.png`);
				}

			} else {

				sprites[c].addEventListener("error", () => {console.log(`Failed to load image _${c.toUpperCase()}.svg or _${c.toUpperCase()}.png`);}, {once: true});

				if (fs.existsSync(path.join(directory, `_${c.toUpperCase()}.svg`))) {
					sprites[c].src = path.join(urlsafe_directory, `_${c.toUpperCase()}.svg`);
				} else if (fs.existsSync(path.join(directory, `_${c.toUpperCase()}.png`))) {
					sprites[c].src = path.join(urlsafe_directory, `_${c.toUpperCase()}.png`);
				}
			}

			// Note that, after the src is set above, it is automatically changed by the JS engine to be something like
			// "file:///C:/foo/bar/whatever.png"

			sprites[c].string_for_bg_style = `url("${sprites[c].src}")`;		// Since the src path won't contain " this should be safe.
		}
	},
};

module.exports = sprites;
