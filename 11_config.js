"use strict";

function get_main_folder() {

	// Sadly this can't be a module since __dirname will change if it's
	// in the modules folder. So this code is duplicated between the
	// renderer and main process code...


	// Return the dir of this .js file if we're being run from electron.exe

	if (path.basename(process.argv[0]).toLowerCase() === "electron" ||
		path.basename(process.argv[0]).toLowerCase() === "electron framework" ||
		path.basename(process.argv[0]).toLowerCase() === "electron helper" ||
		path.basename(process.argv[0]).toLowerCase() === "electron.exe") {
		return __dirname;
	}

	// Return the location of Nibbler.exe

	return path.dirname(process.argv[0]);
}

try {
	let config_filename = path.join(get_main_folder(), "config.json");
	let config_example_filename = path.join(get_main_folder(), "config.example.json");

	if (fs.existsSync(config_filename)) {
		config = JSON.parse(debork_json(fs.readFileSync(config_filename, "utf8")));
	} else if (fs.existsSync(config_example_filename)) {
		config = JSON.parse(debork_json(fs.readFileSync(config_example_filename, "utf8")));
		config.warn_filename = true;
	} else {
		alert(`Couldn't find config file. Looked at:\n${config_filename}`);
	}
} catch (err) {
	alert("Failed to parse config file - make sure it is valid JSON, and in particular, if on Windows, use \\\\ instead of \\ as a path separator.");
}

apply_defaults(config);		// Some tolerable default values for config are in the relevant module...

config.board_size = Math.floor(config.board_size / 8) * 8;
