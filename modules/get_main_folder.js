"use strict";

const path = require("path");
const running_as_electron = require("./running_as_electron");

module.exports = () => {
	if (running_as_electron()) {
		return path.join(__dirname, "..");		// Return the dir one level above this .js file
	}
	return path.dirname(process.argv[0]);		// Return the location of Nibbler.exe
};
