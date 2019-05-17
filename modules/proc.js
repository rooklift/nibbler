"use strict";

// All this is so simple that one should simply do the required test in the caller instead.

exports.is_main = () => {
	return process.type === "browser";	// For whatever reason, the "main" process is called "browser".
}

exports.is_renderer = () => {
	return process.type === "renderer";
}

exports.get_type = () => {
	if (process.type === "browser") {
		return "main";
	} else {
		return process.type;
	}
}
