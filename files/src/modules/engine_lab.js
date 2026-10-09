"use strict";

function number_or_null(value) {
	if (typeof value !== "string" || value === "") {
		return null;
	}

	let result = Number(value);
	return Number.isFinite(result) ? result : null;
}

function integer_or_null(value) {
	let result = number_or_null(value);
	return Number.isInteger(result) ? result : null;
}

function parseInfoLine(line) {
	if (typeof line !== "string") {
		return null;
	}

	let tokens = line.trim().split(/\s+/).filter(token => token !== "");
	if (tokens.length === 0 || tokens[0] !== "info" || tokens[1] === "string") {
		return null;
	}

	let result = {
		depth: null,
		seldepth: null,
		timeMs: null,
		nodes: null,
		nps: null,
		multipv: 1,
		score: null,
		wdl: null,
		pv: [],
	};

	let scalarFields = {
		depth: "depth",
		seldepth: "seldepth",
		time: "timeMs",
		nodes: "nodes",
		nps: "nps",
		multipv: "multipv",
	};

	for (let i = 1; i < tokens.length - 1; i++) {
		let field = scalarFields[tokens[i]];
		if (field) {
			let value = integer_or_null(tokens[i + 1]);
			if (value !== null) {
				result[field] = value;
			}
		}
	}

	for (let i = 1; i < tokens.length - 2; i++) {
		if (tokens[i] === "score" && (tokens[i + 1] === "cp" || tokens[i + 1] === "mate")) {
			let value = integer_or_null(tokens[i + 2]);
			if (value !== null) {
				let bound = null;
				if (tokens.includes("lowerbound")) bound = "lower";
				if (tokens.includes("upperbound")) bound = "upper";
				result.score = {type: tokens[i + 1], value, bound};
			}
			break;
		}
	}

	for (let i = 1; i < tokens.length - 3; i++) {
		if (tokens[i] !== "wdl") continue;
		let win = integer_or_null(tokens[i + 1]);
		let draw = integer_or_null(tokens[i + 2]);
		let loss = integer_or_null(tokens[i + 3]);
		if (win !== null && draw !== null && loss !== null) {
			result.wdl = {win, draw, loss};
		}
		break;
	}

	let pvIndex = tokens.indexOf("pv");
	if (pvIndex !== -1) {
		for (let i = pvIndex + 1; i < tokens.length; i++) {
			if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(tokens[i])) break;
			result.pv.push(tokens[i]);
		}
	}

	return result;
}

function clamp_q(value) {
	return Math.max(-0.998, Math.min(0.998, value));
}

function q_from_pawns(pawns) {
	let winrate = 1 / (1 + Math.pow(10, -pawns / 4));
	return clamp_q(winrate * 2 - 1);
}

function q_from_wdl(wdl) {
	let winrate = (wdl.win + (wdl.draw * 0.5)) / 1000;
	return clamp_q(winrate * 2 - 1);
}

function normalizeScore(score, wdl) {
	if (score && score.type === "mate" && Number.isInteger(score.value)) {
		return {
			source: "mate",
			normalizedQ: null,
			mate: score.value,
		};
	}

	if (score && score.type === "cp" && Number.isFinite(score.value)) {
		return {
			source: "cp",
			normalizedQ: q_from_pawns(score.value / 100),
		};
	}

	if (wdl && Number.isFinite(wdl.win) && Number.isFinite(wdl.draw) && Number.isFinite(wdl.loss)) {
		return {
			source: "wdl",
			normalizedQ: q_from_wdl(wdl),
		};
	}

	return null;
}

function createMultiPVStore() {
	let activeSearchId = null;
	let lines = new Map();

	return {
		beginSearch(searchId) {
			activeSearchId = searchId;
			lines = new Map();
		},

		update(result) {
			if (!result || result.searchId !== activeSearchId) {
				return false;
			}

			let multipv = Number.isInteger(result.multipv) && result.multipv > 0 ? result.multipv : 1;
			lines.set(multipv, Object.assign({}, result, {multipv}));
			return true;
		},

		results() {
			return Array.from(lines.values()).sort((a, b) => a.multipv - b.multipv);
		},
	};
}

function createConsensus(resultsBySession, options = {}) {
	let candidates = new Map();
	let sessionIds = Object.keys(resultsBySession || {});
	let rankPoints = options.rankPoints || {1: 5, 2: 3, 3: 1};

	for (let sessionId of sessionIds) {
		let results = Array.isArray(resultsBySession[sessionId]) ? resultsBySession[sessionId] : [];
		for (let result of results) {
			let move = result && Array.isArray(result.pv) ? result.pv[0] : null;
			if (!move) continue;
			let multipv = Number.isInteger(result.multipv) && result.multipv > 0 ? result.multipv : 1;
			let candidate = candidates.get(move);
			if (!candidate) {
				candidate = {
					move,
					points: 0,
					support: 0,
					ranks: Object.create(null),
					scores: Object.create(null),
				};
				candidates.set(move, candidate);
			}
			candidate.points += rankPoints[multipv] || 0;
			candidate.support++;
			candidate.ranks[sessionId] = multipv;
			candidate.scores[sessionId] = normalizeScore(result.score, result.wdl);
		}
	}

	let candidateList = Array.from(candidates.values());
	for (let candidate of candidateList) {
		let qValues = Object.values(candidate.scores)
			.filter(score => score && Number.isFinite(score.normalizedQ))
			.map(score => score.normalizedQ);
		candidate.averageQ = qValues.length > 0 ? qValues.reduce((sum, value) => sum + value, 0) / qValues.length : null;
		candidate.spreadQ = qValues.length > 1 ? Math.max(...qValues) - Math.min(...qValues) : 0;
	}

	candidateList.sort((a, b) => b.points - a.points || b.support - a.support || (b.averageQ || -Infinity) - (a.averageQ || -Infinity));
	let bestMove = candidateList.length > 0 ? candidateList[0].move : null;
	let firstMoves = [];
	let firstScores = [];
	for (let sessionId of sessionIds) {
		let first = (Array.isArray(resultsBySession[sessionId]) ? resultsBySession[sessionId] : [])
			.find(result => result && result.multipv === 1 && Array.isArray(result.pv) && result.pv.length > 0);
		if (first) {
			firstMoves.push(first.pv[0]);
			let score = normalizeScore(first.score, first.wdl);
			if (score && Number.isFinite(score.normalizedQ)) firstScores.push(score.normalizedQ);
		}
	}

	let spreadQ = firstScores.length > 1 ? Math.max(...firstScores) - Math.min(...firstScores) : 0;
	let uniqueFirstMoves = new Set(firstMoves);
	let highSpreadQ = options.highSpreadQ === undefined ? 0.15 : options.highSpreadQ;
	let moderateSpreadQ = options.moderateSpreadQ === undefined ? 0.35 : options.moderateSpreadQ;
	let conflictSpreadQ = options.conflictSpreadQ === undefined ? 0.6 : options.conflictSpreadQ;
	let level = "low";
	if (uniqueFirstMoves.size === 0) level = "unknown";
	// Agreement needs every engine to have reported; one engine alone always "agrees" with itself.
	else if (firstMoves.length < sessionIds.length) level = "partial";
	else if (uniqueFirstMoves.size === 1 && spreadQ <= highSpreadQ) level = "high";
	else if (bestMove && candidateList[0].support >= Math.ceil(sessionIds.length / 2) && spreadQ <= moderateSpreadQ) level = "moderate";
	else if (spreadQ > conflictSpreadQ) level = "conflict";

	return {
		bestMove,
		candidates: candidateList,
		agreement: {
			level,
			spreadQ,
			support: bestMove ? candidateList[0].support : 0,
			responded: firstMoves.length,
			total: sessionIds.length,
		},
	};
}

function createEngineAnalysisComment(result, engineName, agreement) {
	let safe_name = String(engineName || "Engine").replace(/[{}]/g, "");
	let score = "—";
	if (result && result.score && result.score.type === "mate") {
		score = `M${result.score.value}`;
	} else if (result && result.score && result.score.type === "cp") {
		let pawns = result.score.value / 100;
		score = `${pawns >= 0 ? "+" : ""}${pawns.toFixed(2)}`;
	} else if (result && result.wdl) {
		score = `${Math.round((result.wdl.win + result.wdl.draw * 0.5) / 10)}%`;
	}
	let pv = result && Array.isArray(result.pv) ? result.pv.join(" ") : "";
	return `[%nibbler-engine ${safe_name}] score ${score} depth ${result && result.depth !== null && result.depth !== undefined ? result.depth : "—"} time ${result && result.timeMs !== null && result.timeMs !== undefined ? result.timeMs : "—"}ms nodes ${result && result.nodes !== null && result.nodes !== undefined ? result.nodes : "—"} pv ${pv} agreement ${agreement || "unknown"}`;
}

module.exports = {
	createMultiPVStore,
	createConsensus,
	createEngineAnalysisComment,
	normalizeScore,
	parseInfoLine,
};
