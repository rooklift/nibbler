"use strict";

// UCI "check" options accept only the lowercase strings "true" or "false".
// Values persisted in engines.json may be strings with arbitrary capitalization.

exports.normalizeCheckOptionValue = (option, value) => {

	if (typeof value === "boolean") {
		return value.toString();
	}

	if (typeof value === "string" &&
			typeof option === "string" &&
			/^type\s+check(?:\s|$)/i.test(option) &&
			/^(true|false)$/i.test(value.trim())) {
		return value.trim().toLowerCase();
	}

	return value;
};
