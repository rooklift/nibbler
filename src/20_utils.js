"use strict";

// At some point I tried caching the results of XY() and S()
// but for XY(), object lookups were slower than calculating,
// and for S(), it just isn't called enough to matter.

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

	if (typeof s !== "string" || typeof key !== "string") {
		return "";
	}

	let tokens = s.split(" ").filter(s => s !== "");

	for (let i = 0; i < tokens.length - 1; i++) {
		if (tokens[i] === key) {
			if (tokens[i + 1].endsWith(")")) {
				return tokens[i + 1].slice(0, -1);
			} else {
				return tokens[i + 1];
			}
		}
	}
	return "";
}

function InfoValMany(s, keys) {

	// Optimised version of InfoVal for when many values can be pulled out of the same string.

	let ret = Object.create(null);

	let tokens = s.split(" ").filter(s => s !== "");

	for (let key of keys) {
		let ok = false;
		for (let i = 0; i < tokens.length - 1; i++) {
			if (tokens[i] === key) {
				if (tokens[i + 1].endsWith(")")) {
					ret[key] = tokens[i + 1].slice(0, -1);
				} else {
					ret[key] = tokens[i + 1];
				}
				ok = true;
				break;
			}
		}
		if (!ok) {
			ret[key] = "";
		}
	}

	return ret;
}

function InfoPV(s) {

	// Pull the PV out, assuming it's at the end of the string.

	if (typeof s !== "string") {
		return [];
	}

	let tokens = s.split(" ").filter(s => s !== "");

	for (let i = 0; i < tokens.length - 1; i++) {
		if (tokens[i] === "pv") {
			return tokens.slice(i + 1);
		}
	}
	return [];
}

function InfoWDL(s) {

	// Pull the WDL out as a string.

	if (typeof s !== "string") {
		return "??";
	}

	let tokens = s.split(" ").filter(s => s !== "");

	for (let i = 0; i < tokens.length - 1; i++) {
		if (tokens[i] === "wdl") {
			return tokens.slice(i + 1, i + 4).join(" ");
		}
	}

	return "??";
}

function CompareArrays(a, b) {

	if (Array.isArray(a) === false || Array.isArray(b) === false) {
		return false;
	}

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

function ArrayStartsWith(a, b) {		// where b is itself an array

	if (Array.isArray(a) === false || Array.isArray(b) === false) {
		return false;
	}

	if (a.length < b.length) {
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

function ReplaceAll(s, search, replace) {		// Fairly slow.
	return s.split(search).join(replace);
}

function SafeString(s) {
	if (typeof s !== "string") {
		return undefined;
	}
	s = ReplaceAll(s, "&", "&amp;");			// This needs to be first of course.
	s = ReplaceAll(s, "<", "&lt;");
	s = ReplaceAll(s, ">", "&gt;");
	s = ReplaceAll(s, "'", "&apos;");
	s = ReplaceAll(s, "\"", "&quot;");
	return s;
}

function Log(s) {

	if (typeof config.logfile !== "string" || config.logfile === "") {
		return;
	}

	// Log.logfilename - name of currently open log file (undefined if none)
	// Log.stream      - actual write stream

	if (Log.logfilename !== config.logfile) {
		if (Log.logfilename) {
			console.log(`Closing ${Log.logfilename}`);
			Log.stream.end();
		}
		console.log(`Opening ${config.logfile}`);
		Log.logfilename = config.logfile;
		Log.stream = fs.createWriteStream(config.logfile, {flags: "a"});
	}

	Log.stream.write(s + "\n");
}

function LogBoth(s) {
	console.log(s);
	Log(s);
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
	// the square, and also the centre.
	//
	//      x1,y1--------
	//        |         |
	//        |  cx,cy  |
	//        |         |
	//        --------x2,y2

	let css = config.square_size;
	let x1 = x * css;
	let y1 = y * css;
	let x2 = x1 + css;
	let y2 = y1 + css;

	if (config.flip) {
		[x1, x2] = [(css * 8) - x2, (css * 8) - x1];
		[y1, y2] = [(css * 8) - y2, (css * 8) - y1];
	}

	let cx = x1 + css / 2;
	let cy = y1 + css / 2;

	return {x1, y1, x2, y2, cx, cy};
}

function EventPathString(event, prefix) {

	// Given an event with event.path like ["foo", "bar", "searchmove_e2e4", "whatever"]
	// return the string "e2e4", assuming the prefix matches. Else return null.

	if (!event || typeof prefix !== "string") {
		return null;
	}

	let path = event.path || (event.composedPath && event.composedPath());

	if (path) {
		for (let item of path) {
			if (typeof item.id === "string") {
				if (item.id.startsWith(prefix)) {
					return item.id.slice(prefix.length);
				}
			}
		}
	}

	return null;
}

function EventPathN(event, prefix) {

	// As above, but returning a number, or null.

	let s = EventPathString(event, prefix);

	if (typeof s !== "string") {
		return null;
	}

	let n = parseInt(s, 10);

	if (Number.isNaN(n)) {
		return null;
	}

	return n;
}

function SwapElements(obj1, obj2) {

	// https://stackoverflow.com/questions/10716986/swap-2-html-elements-and-preserve-event-listeners-on-them

    var temp = document.createElement("div");
    obj1.parentNode.insertBefore(temp, obj1);
    obj2.parentNode.insertBefore(obj1, obj2);
    temp.parentNode.insertBefore(obj2, temp);
    temp.parentNode.removeChild(temp);
}

function NString(n) {

	if (typeof n !== "number") {
		return "?";
	}

	if (n < 1000) {
		return n.toString();
	}

	if (n < 100000) {
		return (n / 1000).toFixed(1) + "k";
	}

	if (n < 1000000) {
		return (n / 1000).toFixed(0) + "k";
	}

	if (n < 100000000) {
		return (n / 1000000).toFixed(1) + "M";
	}

	return (n / 1000000).toFixed(0) + "M";
}

function DateString(dt) {
	let y = dt.getFullYear();
	let m = dt.getMonth() + 1;
	let d = dt.getDate();
	let parts = [
		y.toString(),
		(m > 9 ? "" : "0") + m.toString(),
		(d > 9 ? "" : "0") + d.toString(),
	];
	return parts.join(".");
}

function QfromPawns(pawns) {

	// Note carefully: the arg is pawns not centipawns.

	if (typeof (pawns) !== "number") {
		return 0.5;
	}
	let winrate = 1 / (1 + Math.pow(10, -pawns / 4));
	return winrate * 2 - 1;
}

function Value(q) {					// Rescale Q to 0..1 range.			
	if (typeof q !== "number") {
		return 0;
	}
	if (q < -1) {
		return 0;
	}
	if (q > 1) {
		return 1;
	}
	return (q + 1) / 2;
}

function SmoothStep(x) {
	if (x < 0) x = 0;
	if (x > 1) x = 1;
	return (-2 * x * x * x) + (3 * x * x);
}

function Sign(n) {
	if (n < 0) return -1;
	if (n > 0) return 1;
	return 0;
}

function CommaNum(n) {

	if (typeof n !== "number") {
		return JSON.stringify(n);
	}

	if (n < 1000) {
		return n.toString();
	}

	let ret = "";

	let n_string = n.toString();

	for (let i = 0; i < n_string.length; i++) {
		ret += n_string[i];
		if ((n_string.length - i) % 3 === 1 && n_string.length - i > 1) {
			ret += ",";
		}
	}

	return ret;
}

function DurationString(ms) {

	let hours = Math.floor(ms / 3600000);
	ms -= hours * 3600000;

	let minutes = Math.floor(ms / 60000);
	ms -= minutes * 60000;

	let seconds = Math.floor(ms / 1000);

	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}

	if (minutes > 0) {
		return `${minutes}m ${seconds}s`;
	}

	return `${seconds}s`;
}

function NumbersBetween(a, b) {

	// Given integers a and b, return a list of integers between the two, inclusive.

	let add = a < b ? 1 : -1;

	let ret = [];

	for (let x = a; x !== b; x += add) {
		ret.push(x);
	}

	ret.push(b);

	return ret;
}

function RandInt(min, max) {
	return Math.floor(Math.random() * (max - min)) + min;
}

function RandChoice(arr) {
	if (Array.isArray(arr) === false || arr.length === 0) {
		return undefined;
	}
	return arr[RandInt(0, arr.length)];
}
