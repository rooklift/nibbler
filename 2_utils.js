"use strict";

function XY(s) {				// e.g. "b7" --> [1, 1]
	if (s.length !== 2) {
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

function OppositeColour(s) {
	if (s === "w" || s === "W") return "b";
	if (s === "b" || s === "B") return "w";
	return "";
}

function SafeString(s) {
	if (typeof s !== "string") {
		return undefined;
	}
	s = s.replaceAll("&", "&amp;");		// This needs to be first of course.
	s = s.replaceAll("<", "&lt;");
	s = s.replaceAll(">", "&gt;");
	s = s.replaceAll("'", "&apos;");
	s = s.replaceAll("\"", "&quot;");
	return s;
}

function Log(s) {

	if (!config) {
		return;
	}

	// Using some properties embedded into the function object
	// as if they are static variables.

	if (Log.logfile === undefined) {
		if (typeof config.logfile !== "string" || config.logfile === "" || Log.tried_to_open) {
			return;
		}

		Log.logfile = fs.createWriteStream(config.logfile, {flags:'a'});
		Log.tried_to_open = true;
	}

	Log.logfile.write(s + "\n");
}

function DeborkJSON(s) {

	// Enough people are going to use single backslashes in their paths that we should just fix it.

	let lines = s.split("\n");
	lines = lines.map(s => s.trim());		// removing \r for no particular reason.

	for (let n = 0; n < lines.length; n++) {
		let line = lines[n];
		if (line.indexOf(`"path"`) !== -1 || line.indexOf(`"WeightsFile"`) !== -1) {
			line = line.replaceAll("\\\\", "__nibbler__blackslash__replacement__in__progress__");
			line = line.replaceAll("\\", "\\\\");
			line = line.replaceAll("__nibbler__blackslash__replacement__in__progress__", "\\\\");
		}
		lines[n] = line;
	}

	return lines.join("\n");
}
