"use strict";

const path = require("path");

// Is there not a better way? Perhaps some Electron API somewhere?

module.exports = () => {
	if (path.basename(process.argv[0]).toLowerCase() === "electron" ||
		path.basename(process.argv[0]).toLowerCase() === "electron framework" ||
		path.basename(process.argv[0]).toLowerCase() === "electron helper" ||
		path.basename(process.argv[0]).toLowerCase() === "electron.exe") {

		return true;
	}
	return false;
};
