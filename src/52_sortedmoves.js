"use strict";

function SortedMoves(node) {

	// There are a lot of subtleties around sorting the moves...
	//
	// - We want to allow other engines than Lc0.
	// - We want to work with low MultiPV values.
	// - Old and stale data can be left in our cache if MultiPV is low.
	// - We want to work with searchmoves, which is bound to leave stale info in the table.
	// - We can try and track the age of the data by various means, but these are fallible.

	if (!node || node.destroyed) {
		return [];
	}

	let info_list = [];

	for (let o of Object.values(node.table.moveinfo)) {
		info_list.push(o);
	}

	info_list.sort((a, b) => {


		// FIXME - various tests here only apply if leelaish


		const a_is_best = -1;						// return -1 to sort a to the left
		const b_is_best = 1;						// return 1 to sort a to the right

		// Mate - positive good, negative bad.
		// Note our info struct uses 0 when not given.

		if (Sign(a.mate) !== Sign(b.mate)) {		// negative is worst, 0 is neutral, positive is best
			if (a.mate > b.mate) return a_is_best;
			if (a.mate < b.mate) return b_is_best;
		} else {									// lower (i.e. towards -Inf) is better regardless of who's mating
			if (a.mate < b.mate) return a_is_best;
			if (a.mate > b.mate) return b_is_best;
		}

		// Ordering by VerboseMoveStats (suggestion of Napthalin)...

		if (a.vms_order > b.vms_order) return a_is_best;
		if (a.vms_order < b.vms_order) return b_is_best;

		// Leela N score (node count) - higher is better...

		if (a.n > b.n) return a_is_best;
		if (a.n < b.n) return b_is_best;

		// Leela will give an N score, so if we're here, it's some other engine,
		// or we're breaking ties.

		// If MultiPV is the same, go with the more recent data...

		if (a.multipv === b.multipv) {
			if (a.version > b.version && a.uci_nodes > b.uci_nodes) return a_is_best;
			if (a.version < b.version && a.uci_nodes < b.uci_nodes) return b_is_best;
		}

		// I hesitate to use multipv sort sorting because of stale data issues, but...

		if (a.multipv < b.multipv) return a_is_best;
		if (a.multipv > b.multipv) return b_is_best;

		// Finally, sort by CP if needed...

		if (a.cp > b.cp) return a_is_best;
		if (a.cp < b.cp) return b_is_best;

		// Who knows...

		return 0;
	});

	return info_list;
};
