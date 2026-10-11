"use strict";

// PGN Numeric Annotation Glyphs (NAG) for positional assessments.
// Move-quality annotations (!, ?, etc.) are stored separately.
const evaluations = Object.freeze([
	{nag: 10, symbol: "=", label: "Equal position"},
	{nag: 13, symbol: "∞", label: "Unclear position"},
	{nag: 14, symbol: "⩲", label: "Slight advantage for White"},
	{nag: 15, symbol: "⩱", label: "Slight advantage for Black"},
	{nag: 16, symbol: "±", label: "Advantage for White"},
	{nag: 17, symbol: "∓", label: "Advantage for Black"},
	{nag: 18, symbol: "+−", label: "Decisive advantage for White"},
	{nag: 19, symbol: "−+", label: "Decisive advantage for Black"},
	{nag: 44, symbol: "⨀", label: "Compensation for material"},
]);

function find(nag) {
	return evaluations.find(item => item.nag === nag) || null;
}

module.exports = {evaluations, find};
