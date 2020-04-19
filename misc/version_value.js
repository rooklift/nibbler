"use strict";

module.exports = function(s) {

	let parts = s.split(".");

	if (parts[0][0] === "v") {
		parts[0] = parts[0].slice(1);
	}

	parts = parts.map(z => Number.parseInt(z, 10));

	// Note that parseInt works well with trailing non-numbers,
	// e.g. "3-rc2" correctly parses as 3.

	let val = 0;

	val += parts[0] * 1000000;
	val += parts[1] * 10000;
	val += parts[2] * 100;

	if (s.includes("rc")) {
		let rc_string = s.slice(s.indexOf("rc") + 2);
		val += Number.parseInt(rc_string, 10);
	}

	return val;
}
