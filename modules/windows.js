"use strict";

const alert = require("./alert");
const electron = require("electron");
const fs = require("fs");
const path = require("path");
const url = require("url");
const assign_without_overwrite = require("./utils").assign_without_overwrite;

const all_windows = Object.create(null);			// Map of token --> window.

exports.new = (token, pagepath, params) => {		// token is an internal name for us to refer to the window by.

	if (all_windows[token]) {
		alert("windows.js: Asked to create window with token '" + token + "' which already exists!");
		return;
	}

	if (!params.webPreferences) {
		params.webPreferences = {};
	}

	params.webPreferences.zoomFactor = 1 / electron.screen.getPrimaryDisplay().scaleFactor;

	let win = new electron.BrowserWindow(params);

	if (fs.existsSync(pagepath) === false) {
		alert(`New window wanted page "${pagepath}" which didn't exist.`)
	}

	win.loadURL(url.format({
		protocol: "file:",
		pathname: pagepath,
		slashes: true
	}));

	// win.setMenu(null);			// I'm sure there was a reason for this but I forget, and it seems to cause Linux issues.

	all_windows[token] = win;

	win.on("close", (evt) => {
		evt.preventDefault();
		win.hide();
		quit_if_all_windows_are_hidden();
	});

	win.on("hide", () => {
		quit_if_all_windows_are_hidden();
	});

	return win;		// Though caller may well not need this.
};

exports.change_zoom = (token, diff) => {
	if (all_windows[token] === undefined) {
		return;
	}
	let contents = all_windows[token].webContents;
	contents.getZoomFactor((val) => {
		if (val + diff >= 0.2) {
			contents.setZoomFactor(val + diff);
		}
	});
};

exports.set_zoom = (token, val) => {
	if (all_windows[token] === undefined) {
		return;
	}
	let contents = all_windows[token].webContents;
	contents.setZoomFactor(val);
};

exports.send = (token, channel, msg) => {
	if (all_windows[token] === undefined) {
		return;
	}
	let contents = all_windows[token].webContents;
	contents.send(channel, msg);
};

exports.set_menu = (token, menu) => {

	// Set an individual window's menu. Has some issues with OS X.

	if (all_windows[token] === undefined) {
		return;
	}
	all_windows[token].setMenu(menu);
};

exports.show = (token) => {
	if (all_windows[token] === undefined) {
		return;
	}
	all_windows[token].show();
};

exports.hide = (token) => {
	if (all_windows[token] === undefined) {
		return;
	}
	all_windows[token].hide();
};

exports.focus = (token) => {
	if (all_windows[token] === undefined) {
		return;
	}
	all_windows[token].focus();
};

exports.get_window = (token) => {
	return all_windows[token];
};

function quit_if_all_windows_are_hidden() {
	let keys = Object.keys(all_windows);
	for (let n = 0; n < keys.length; n++) {
		let key = keys[n];
		let win = all_windows[key];
		try {
			if (win.isVisible()) {		// Note that backgroundThrottling:false affects this, I believe.
				return;
			}
		} catch (e) {
			// Can fail at end of app life when the window has been destroyed.
		}
	}

	electron.app.exit();				// Why doesn't quit work?
}
