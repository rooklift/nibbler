"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {normalizeCheckOptionValue} = require("../src/modules/uci_options");

const CHECK = "type check default false";

test("normalizeCheckOptionValue - lowercases and trims check strings", () => {
	assert.equal(normalizeCheckOptionValue(CHECK, "False"), "false");
	assert.equal(normalizeCheckOptionValue(CHECK, "TRUE"), "true");
	assert.equal(normalizeCheckOptionValue(CHECK, " false "), "false");
	assert.equal(normalizeCheckOptionValue(CHECK, "\tTrUe\n"), "true");
});

test("normalizeCheckOptionValue - converts booleans", () => {
	assert.equal(normalizeCheckOptionValue(CHECK, false), "false");
	assert.equal(normalizeCheckOptionValue(CHECK, true), "true");
	assert.equal(normalizeCheckOptionValue("type string default <empty>", false), "false");
});

test("normalizeCheckOptionValue - matches check type case-insensitively", () => {
	assert.equal(normalizeCheckOptionValue("Type Check default false", "False"), "false");
	assert.equal(normalizeCheckOptionValue("type CHECK default false", "TRUE"), "true");
	assert.equal(normalizeCheckOptionValue("type check", "False"), "false");
	assert.equal(normalizeCheckOptionValue("type checkmate default false", "False"), "False");
});

test("normalizeCheckOptionValue - leaves ordinary string options alone", () => {
	assert.equal(normalizeCheckOptionValue("type string default <empty>", "False"), "False");
	assert.equal(normalizeCheckOptionValue("type string default <empty>", " false "), " false ");
	assert.equal(normalizeCheckOptionValue("type spin default 1 min 1 max 1024", "True"), "True");
});

test("normalizeCheckOptionValue - leaves unknown options and non-boolean values alone", () => {
	assert.equal(normalizeCheckOptionValue(undefined, "False"), "False");
	assert.equal(normalizeCheckOptionValue(null, "False"), "False");
	assert.equal(normalizeCheckOptionValue(CHECK, "yes"), "yes");
	assert.equal(normalizeCheckOptionValue(CHECK, 1), 1);
});
