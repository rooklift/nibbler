"use strict";

const electron = require("electron");
const fs = require("fs");
const path = require("path");
const querystring = require("querystring");

exports.filename = "engines.json";

// To avoid using "remote", we rely on the main process passing userData location in the query...

exports.filepath = electron.app ?
		path.join(electron.app.getPath("userData"), exports.filename) :									// in Main process
		path.join(querystring.parse(global.location.search)["?user_data_path"], exports.filename);		// in Renderer process

function fix(cfg) {

	// Ensure the object has a "engineconfig" flag, which save() will check to make sure that nothing else is ever accidentally saved.

	cfg.__engineconfig = true;

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
	}
}

exports.newentry = () => {
	return {
		"args": [],
		"options": {},
		"search_nodes": null,
		"search_nodes_special": 10000,
	};
};

exports.load = () => {

	let cfg = {};

	try {
		if (fs.existsSync(exports.filepath)) {
			cfg = JSON.parse((fs.readFileSync(exports.filepath, "utf8")));
		}
	} catch (err) {
		console.log(err.toString());							// alert() might not be available.
	}

	fix(cfg);
	return cfg;
};

exports.save = (cfg) => {

	if (!cfg.__engineconfig) {
		throw "Wrong type of object sent to engineconfig_io.save()";
	}

	delete cfg.__engineconfig;									// Don't save this...

	try {
		fs.writeFileSync(exports.filepath, JSON.stringify(cfg, null, "\t"));
	} catch (err) {
		console.log(err.toString());							// alert() might not be available.
	}

	cfg.__engineconfig = true;									// ...but do restore it.
};

exports.create_if_needed = (cfg) => {

	// Note that this must be called fairly late, when userData directory exists.

	if (!cfg) {
		throw "create_if_needed() needs an argument";
	}

	if (fs.existsSync(exports.filepath)) {
		return;
	}

	exports.save(cfg);
};

