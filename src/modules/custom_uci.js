"use strict";

const electron = require("electron");
const fs = require("fs");
const path = require("path");
const querystring = require("querystring");

const scripts_dir = "scripts";
const example_file = "example.txt";

const example =
`setoption name Something value WhoKnows
setoption name Example value Whatever`;

// To avoid using "remote", we rely on the main process passing userData location in the query...

exports.script_dir_path = electron.app ?
		path.join(electron.app.getPath("userData"), scripts_dir) :
		path.join(querystring.parse(global.location.search.slice(1))["user_data_path"], scripts_dir);

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
};

exports.create_if_needed = () => {

	// Note that this must be called fairly late, when userData directory exists.

	try {
		if (!fs.existsSync(exports.script_dir_path)) {
			fs.mkdirSync(exports.script_dir_path);
			let example_path = path.join(exports.script_dir_path, example_file);
			fs.writeFileSync(example_path, example);
		}
	} catch (err) {
		console.log(err.toString());
	}
};
