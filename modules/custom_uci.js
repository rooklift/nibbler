"use strict";

const electron = require("electron");
const fs = require("fs");
const path = require("path");

const default_file_contents = 
`CPuct 4.0
CPuct 3.8
CPuct 3.6
CPuct 3.4
CPuct 3.2
CPuct 3.0
CPuct 2.8
CPuct 2.6
CPuct 2.4`;

exports.filename = "custom_uci.cfg";

exports.filepath = electron.app ?
                   path.join(electron.app.getPath("userData"), exports.filename) :
                   path.join(electron.remote.app.getPath("userData"), exports.filename);

exports.load = () => {

	if (fs.existsSync(exports.filepath) === false) {
		fs.writeFileSync(exports.filepath, default_file_contents);
	}

	let contents = fs.readFileSync(exports.filepath).toString();

	let lines = contents.split("\n");
	let command_list = [];

	for (let line of lines) {

		line = line.trim();

		if (line.length === 0) {
			continue;
		}

		let val_index = line.indexOf(" ");

		if (val_index === -1) {
			val_index = line.indexOf("\t");
		}

		if (val_index === -1) {
			command_list.push({
				name: line,
				val: ""
			});
		} else {
			let name = line.slice(0, val_index).trim();
			let val = line.slice(val_index).trim();
			command_list.push({name, val});
		}
	}

	return command_list;
}
