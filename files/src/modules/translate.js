"use strict";

const translations = require("./translations");

let startup_language = null;

exports.register_startup_language = function(s) {		// Will have to be called in both processes (assuming renderer ever uses this at all).
	startup_language = s;
}

exports.translate = function(key, force_language = null) {

	// Note that we usually use the language which was in config.json at startup so
	// that in-flight calls to translate() return consistent results even if the user
	// switches config.language at some point. (Thus, the user will need to restart
	// to see any change.)

	let language = force_language || startup_language;

	if (translations[language] && translations[language][key]) {
		return translations[language][key];
	} else {
		return key;
	}
}

exports.t = exports.translate;

exports.all_languages = function() {
	return Object.keys(translations);
}

