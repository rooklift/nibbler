"use strict";

const electron = require("electron");
const fs = require("fs");
const path = require("path");
const querystring = require("querystring");

const debork_json = require("./debork_json");

exports.filename = "engines.json";

// To avoid using "remote", we rely on the main process passing userData location in the query...

exports.filepath = electron.app ?
		path.join(electron.app.getPath("userData"), exports.filename) :											// in Main process
		path.join(querystring.parse(global.location.search.slice(1))["user_data_path"], exports.filename);		// in Renderer process

function EngineConfig() {}			// This exists solely to make instanceof work.
EngineConfig.prototype = {};

// ---------------------------------------------------------------------------------------------------------------------------

function fix(cfg) {

	// The nameless dummy that hub creates at startup needs an entry...

	cfg[""] = exports.newentry();

	// Fix any saved entries present in the file...

	for (let key of Object.keys(cfg)) {
		if (typeof cfg[key] !== "object" || cfg[key] === null) {
			cfg[key] = exports.newentry();
		}
		if (Array.isArray(cfg[key].args) === false) {
			cfg[key].args = [];
		}
		if (typeof cfg[key].options !== "object" || cfg[key].options === null) {
			cfg[key].options = {};
		}
		if (typeof cfg[key].limit_by_time !== "boolean") {
			cfg[key].limit_by_time = cfg[key].limit_by_time ? true : false;
		}

		// We don't really care about missing search_nodes and search_nodes_special properties. (?)
	}
}

exports.newentry = () => {
	return {
		"args": [],
		"options": {},
		"search_nodes": null,
		"search_nodes_special": 10000,
		"limit_by_time": false,
	};
};

exports.load = () => {

	let cfg = new EngineConfig();

	let err_to_return = null;

	try {
		if (fs.existsSync(exports.filepath)) {
			let raw = fs.readFileSync(exports.filepath, "utf8");
			try {
				Object.assign(cfg, JSON.parse(raw))
			} catch (err) {
				console.log(exports.filename, err.toString(), "...trying to debork...");
				Object.assign(cfg, JSON.parse(debork_json(raw)));
			}
		}
	} catch (err) {
		console.log(err.toString());							// alert() might not be available.
		err_to_return = err.toString();
	}

	fix(cfg);
	return [err_to_return, cfg];
};

exports.save = (cfg) => {

	if (cfg instanceof EngineConfig === false) {
		throw "Wrong type of object sent to engineconfig_io.save()";
	}

	let blank = cfg[""];
	delete cfg[""];

	try {
		fs.writeFileSync(exports.filepath, JSON.stringify(cfg, null, "\t"));
	} catch (err) {
		console.log(err.toString());							// alert() might not be available.
	}

	cfg[""] = blank;
};

exports.create_if_needed = (cfg) => {

	// Note that this must be called fairly late, when userData directory exists.

	if (cfg instanceof EngineConfig === false) {
		throw "Wrong type of object sent to engineconfig_io.create_if_needed()";
	}

	if (fs.existsSync(exports.filepath)) {
		return;
	}

	exports.save(cfg);
};
