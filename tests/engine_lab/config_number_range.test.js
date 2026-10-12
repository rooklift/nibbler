"use strict";

// Regression test for the range check of numeric config items edited in the fullbox.
//
// auto_analysis_time_ms used to accept any number, so a value of 0 or a negative value
// silently fell back to search_nodes_special (possibly 1e9 nodes), and the auto-analysis
// line stopped advancing. The editor's parser must reject such values.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const SRC = path.join(__dirname, "../../files/src");

function loadParser() {
	let context = {
		console,
		Object,
		Array,
		Map,
		Set,
		Number,
		String,
		Math,
		JSON,
		performance: {now: () => 0},
		config: {
			auto_analysis_time_ms: 10000,
			unranged_number_item: 5,
		},
		config_io: {
			defaults: {
				auto_analysis_time_ms: 10000,
				unranged_number_item: 5,
			},
		},
	};
	vm.createContext(context);
	let source = fs.readFileSync(path.join(SRC, "renderer/95_hub.js"), "utf8");
	vm.runInContext(`${source}\nthis.__hub_props = hub_props;\nthis.__ranges = CONFIG_NUMBER_RANGES;`, context);
	return {hub: context.__hub_props, ranges: context.__ranges};
}

// The parser's arrays come from the vm context, so copy them into this realm before comparing.
const parse = (hub, item, raw) => {
	let [value, err] = hub.parse_fullbox_config_item_value.call(hub, item, raw);
	return [value, err];
};

test("auto_analysis_time_ms accepts integers inside the allowed range", () => {
	let {hub} = loadParser();
	assert.deepEqual(parse(hub, "auto_analysis_time_ms", "100"), [100, null]);
	assert.deepEqual(parse(hub, "auto_analysis_time_ms", "10000"), [10000, null]);
	assert.deepEqual(parse(hub, "auto_analysis_time_ms", "3600000"), [3600000, null]);
	assert.deepEqual(parse(hub, "auto_analysis_time_ms", "  5000  "), [5000, null]);
});

test("auto_analysis_time_ms rejects values below the minimum (including 0 and negatives)", () => {
	let {hub} = loadParser();
	let msg = "Expected an integer from 100 to 3600000";
	assert.deepEqual(parse(hub, "auto_analysis_time_ms", "0"), [null, msg]);
	assert.deepEqual(parse(hub, "auto_analysis_time_ms", "1"), [null, msg]);
	assert.deepEqual(parse(hub, "auto_analysis_time_ms", "99"), [null, msg]);
	assert.deepEqual(parse(hub, "auto_analysis_time_ms", "-500"), [null, msg]);
});

test("auto_analysis_time_ms rejects values above the maximum", () => {
	let {hub} = loadParser();
	let msg = "Expected an integer from 100 to 3600000";
	assert.deepEqual(parse(hub, "auto_analysis_time_ms", "3600001"), [null, msg]);
	assert.deepEqual(parse(hub, "auto_analysis_time_ms", "1000000000"), [null, msg]);
	assert.deepEqual(parse(hub, "auto_analysis_time_ms", "Infinity"), [null, msg]);
});

test("auto_analysis_time_ms rejects non-integers, because they go into 'go movetime'", () => {
	let {hub} = loadParser();
	let msg = "Expected an integer from 100 to 3600000";
	assert.deepEqual(parse(hub, "auto_analysis_time_ms", "1500.5"), [null, msg]);
	assert.deepEqual(parse(hub, "auto_analysis_time_ms", "2.5e3"), [2500, null]);	// Exponent form that is still an integer
});

test("auto_analysis_time_ms rejects empty input (Number('') would be 0) and non-numbers", () => {
	let {hub} = loadParser();
	assert.deepEqual(parse(hub, "auto_analysis_time_ms", ""), [null, "Expected an integer from 100 to 3600000"]);
	assert.deepEqual(parse(hub, "auto_analysis_time_ms", "abc"), [null, "Expected number"]);
});

test("numeric items without a range keep the old behaviour", () => {
	let {hub} = loadParser();
	assert.deepEqual(parse(hub, "unranged_number_item", "0"), [0, null]);
	assert.deepEqual(parse(hub, "unranged_number_item", "-3.5"), [-3.5, null]);
});

test("the default auto_analysis_time_ms in config_io.js lies inside the allowed range", () => {
	let {ranges} = loadParser();
	let configIoSource = fs.readFileSync(path.join(SRC, "modules/config_io.js"), "utf8");
	let match = configIoSource.match(/"auto_analysis_time_ms":\s*(\d+)/);
	assert.ok(match, "default value not found in config_io.js");
	let value = Number(match[1]);
	assert.ok(value >= ranges.auto_analysis_time_ms.min && value <= ranges.auto_analysis_time_ms.max,
		`default ${value} is outside the allowed range`);
});
