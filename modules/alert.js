"use strict";

const electron = require("electron");

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
	msg = msg.toString().trim();
	let fn = process.type === "renderer" ?
		electron.remote.dialog.showMessageBox :
		electron.dialog.showMessageBox;
	fn({message: msg, title: "Alert", buttons: ["OK"]}, () => {});
	// Providing a callback makes the window not block the process.
};
