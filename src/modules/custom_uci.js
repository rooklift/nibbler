"use strict";

const electron = require("electron");
const fs = require("fs");
const path = require("path");

const scripts_dir = "scripts";
const example_file = "example.txt";

const example =
`setoption name Something value WhoKnows
setoption name Example value Whatever`;

exports.script_dir_path = electron.app ?
		path.join(electron.app.getPath("userData"), scripts_dir) :
		path.join(electron.remote.app.getPath("userData"), scripts_dir);

exports.load = () => {

	try {
		let files = fs.readdirSync(exports.script_dir_path);

		let ret = [];

		for (let file of files) {
			ret.push({
				name: file,
				path: path.join(exports.script_dir_path, file)
			});
		}

		return ret;

	} catch (err) {

		return [
			{
				name: example_file,
				path: path.join(exports.script_dir_path, example_file)
			}
		];

	}
}

exports.create_if_needed = () => {

	// Note that this must be called fairly late, when userData directory exists.

	try {
		if (!fs.existsSync(exports.script_dir_path)) {
			fs.mkdirSync(exports.script_dir_path);
		}
	} catch (err) {
		console.log(err.toString());
		return;
	}

	let example_path = path.join(exports.script_dir_path, example_file);

	try {
		fs.writeFileSync(example_path, example);
	} catch (err) {
		console.log(err.toString());		// alert() might not be available.
	}
}
