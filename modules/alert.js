"use strict";

const electron = require("electron");

function alert_main(msg) {
	electron.dialog.showMessageBox({
		message: msg.toString(),
		title: "Alert",
		buttons: ["OK"]
	}, () => {});			// Providing a callback makes the window not block the process
}

function alert_renderer(msg) {
	electron.remote.dialog.showMessageBox({
		message: msg.toString(),
		title: "Alert",
		buttons: ["OK"]
	}, () => {});
}

module.exports = (msg) => {
	if (msg instanceof Error) {
		msg = msg.toString();
	}
	if (typeof msg === "object") {
		msg = JSON.stringify(msg);
	}
	if (typeof msg === "undefined") {
		msg = "undefined";
	}
	if (typeof msg === "number") {
		msg = msg.toString();
	}
	msg = msg.trim()
	if (process.type === "renderer") {
		alert_renderer(msg);
	} else {
		alert_main(msg);
	}
};
