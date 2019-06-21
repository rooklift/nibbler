"use strict";

function XY(s) {				// e.g. "b7" --> [1, 1]
	if (typeof s !== "string" || s.length !== 2) {
		return [-1, -1];
	}
	s = s.toLowerCase();
	let x = s.charCodeAt(0) - 97;
	let y = 8 - parseInt(s[1], 10);
	if (x < 0 || x > 7 || y < 0 || y > 7 || Number.isNaN(y)) {
		return [-1, -1];
	}
	return [x, y];
}

function S(x, y) {				// e.g. (1, 1) --> "b7"
	if (typeof x !== "number" || typeof y !== "number" || x < 0 || x > 7 || y < 0 || y > 7) {
		return "??";
	}
	let xs = String.fromCharCode(x + 97);
	let ys = String.fromCharCode((8 - y) + 48);
	return xs + ys;
}

function InfoVal(s, key) {

	// Given some string like "info depth 8 seldepth 22 time 469 nodes 3918 score cp 46 hashfull 13 nps 8353 tbhits 0 multipv 1 pv d2d4 g8f6"
	// pull the value for the key out, e.g. in this example, key "nps" returns "8353" (as a string).
	//
	// Since Lc0's info strings often have the value ending in ")", we strip that out.

	let tokens = s.split(" ").filter(s => s !== "");

	for (let i = 0; i < tokens.length - 1; i++) {
		if (tokens[i] === key) {
			if (tokens[i + 1].endsWith(")")) {
				return tokens[i + 1].slice(0, tokens[i + 1].length - 1);
			} else {
				return tokens[i + 1];
			}
		}
	}
	return "";
}

function InfoPV(s) {

	// Pull the PV out, assuming it's at the end of the string.

	let tokens = s.split(" ").filter(s => s !== "");

	for (let i = 0; i < tokens.length - 1; i++) {
		if (tokens[i] === "pv") {
			return tokens.slice(i + 1);
		}
	}
	return [];
}

function CompareArrays(a, b) {

	if (a.length !== b.length) {
		return false;
	}

	for (let n = 0; n < a.length; n++) {
		if (a[n] !== b[n]) {
			return false;
		}
	}

	return true;
}

function ArrayStartsWith(a, b) {

	if (b.length > a.length) {
		return false;
	}

	for (let n = 0; n < b.length; n++) {
		if (a[n] !== b[n]) {
			return false;
		}
	}

	return true;
}

function OppositeColour(s) {
	if (s === "w" || s === "W") return "b";
	if (s === "b" || s === "B") return "w";
	return "";
}

function ReplaceAll(s, search, replace) {
	return s.split(search).join(replace);
}

function SafeString(s) {
	if (typeof s !== "string") {
		return undefined;
	}
	s = ReplaceAll(s, "&", "&amp;");		// This needs to be first of course.
	s = ReplaceAll(s, "<", "&lt;");
	s = ReplaceAll(s, ">", "&gt;");
	s = ReplaceAll(s, "'", "&apos;");
	s = ReplaceAll(s, "\"", "&quot;");
	return s;
}

function Log(s) {

	if (!config || typeof config.logfile !== "string" || config.logfile === "") {
		return;
	}

	if (Log.logfile === undefined) {
		Log.logfile = fs.createWriteStream(config.logfile, {flags: "a"});
	}

	Log.logfile.write(s + "\n");
}

function New2DArray(width, height) {

	let ret = [];

	for (let x = 0; x < width; x++) {
		ret.push([]);
		for (let y = 0; y < height; y++) {
			ret[x].push(null);
		}
	}

	return ret;
}

function CanvasCoords(x, y) {

	// Given the x, y coordinates on the board (a8 is 0, 0)
	// return an object with the canvas coordinates for
	// the square, and also the centre. Also has rss.
	//
	//      x1,y1--------
	//        |         |
	//        |  cx,cy  |
	//        |         |
	//        --------x2,y2

	let rss = config.board_size / 8;
	let x1 = x * rss;
	let y1 = y * rss;
	let x2 = x1 + rss;
	let y2 = y1 + rss;

	if (config.flip) {
		[x1, x2] = [(rss * 8) - x2, (rss * 8) - x1];
		[y1, y2] = [(rss * 8) - y2, (rss * 8) - y1];
	}

	let cx = x1 + rss / 2;
	let cy = y1 + rss / 2;

	return {x1, y1, x2, y2, cx, cy, rss};
};
