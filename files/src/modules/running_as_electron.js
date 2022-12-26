"use strict";

const path = require("path");

// Is there not a better way? Perhaps some Electron API somewhere?

module.exports = () => {
	return path.basename(process.argv[0]).toLowerCase().includes("electron");
};
