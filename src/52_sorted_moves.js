"use strict";

function SortedMoveInfo(node) {

	if (!node || node.destroyed) {
		return [];
	}

	return SortedMoveInfoFromTable(node.table);
}

function SortedMoveInfoFromTable(table) {

	// There are a lot of subtleties around sorting the moves...
	//
	// - We want to allow other engines than Lc0.
	// - We want to work with low MultiPV values.
	// - Old and stale data can be left in our cache if MultiPV is low.
	// - We want to work with searchmoves, which is bound to leave stale info in the table.
	// - We can try and track the age of the data by various means, but these are fallible.

	let info_list = [];
	let latest_cycle = 0;
	let latest_subcycle = 0;

	for (let o of Object.values(table.moveinfo)) {
		info_list.push(o);
		if (o.cycle > latest_cycle) latest_cycle = o.cycle;
		if (o.subcycle > latest_subcycle) latest_subcycle = o.subcycle;
	}

	// It's important that the sort be transitive. I believe it is.

	info_list.sort((a, b) => {

		const a_is_best = -1;						// return -1 to sort a to the left
		const b_is_best = 1;						// return 1 to sort a to the right

		// Info that hasn't been touched must be worse...

		if (a.__touched && !b.__touched) return a_is_best;
		if (!a.__touched && b.__touched) return b_is_best;

		// Always prefer info from the current "go" specifically.
		// As well as being correct generally, it also moves searchmoves to the top.

		if (a.cycle === latest_cycle && b.cycle !== latest_cycle) return a_is_best;
		if (a.cycle !== latest_cycle && b.cycle === latest_cycle) return b_is_best;

		// Prefer info from the current "block" of info specifically.

		if (a.subcycle === latest_subcycle && b.subcycle !== latest_subcycle) return a_is_best;
		if (a.subcycle !== latest_subcycle && b.subcycle === latest_subcycle) return b_is_best;

		// If one info is leelaish and the other isn't, that can only mean that the A/B
		// engine is the one that ran last (since Lc0 will cause all info to become
		// leelaish), therefore any moves the A/B engine has touched must be "better".

		if (!a.leelaish && b.leelaish) return a_is_best;
		if (a.leelaish && !b.leelaish) return b_is_best;

		// ----------------------------------- LEELA AND LEELA-LIKE ENGINES ----------------------------------- //

		if (a.leelaish && b.leelaish) {

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

			// Leela N score (node count) - higher is better (shouldn't be possible to get here now)...

			if (a.n > b.n) return a_is_best;
			if (a.n < b.n) return b_is_best;
		}

		// ---------------------------------------- ALPHA-BETA ENGINES ---------------------------------------- //

		if (a.leelaish === false && b.leelaish === false) {

			// Specifically within the latest subcycle, prefer lower multipv. I don't think this
			// breaks transitivity because the latest subcycle is always sorted left (see above).

			if (a.subcycle === latest_subcycle && b.subcycle === latest_subcycle) {
				if (a.multipv < b.multipv) return a_is_best;
				if (a.multipv > b.multipv) return b_is_best;
			}

			// Otherwise sort by depth.

			if (a.depth > b.depth) return a_is_best;
			if (a.depth < b.depth) return b_is_best;

			// Sort by CP if we somehow get here.

			if (a.cp > b.cp) return a_is_best;
			if (a.cp < b.cp) return b_is_best;
		}

		// Sort alphabetically...

		if (a.nice_pv_cache && b.nice_pv_cache) {
			if (a.nice_pv_cache[0] < b.nice_pv_cache[0]) return a_is_best;
			if (a.nice_pv_cache[0] > b.nice_pv_cache[0]) return b_is_best;
		}

		return 0;
	});

	return info_list;
}
