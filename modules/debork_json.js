"use strict";

let replace_all = (s, search, replace) => {
    return s.split(search).join(replace);
};

module.exports = (s) => {

	// Enough people are going to use single backslashes in their paths that we should just fix it.

	let lines = s.split("\n");
	lines = lines.map(s => s.trim());		// removing \r for no particular reason.

	for (let n = 0; n < lines.length; n++) {
		let line = lines[n];
		if (line.indexOf(`"path"`) !== -1 || line.indexOf(`"WeightsFile"`) !== -1) {
			line = replace_all(line, "\\\\", "__nibbler__blackslash__replacement__in__progress__");
			line = replace_all(line, "\\", "\\\\");
			line = replace_all(line, "__nibbler__blackslash__replacement__in__progress__", "\\\\");
		}
		lines[n] = line;
	}

	return lines.join("\n");
}
