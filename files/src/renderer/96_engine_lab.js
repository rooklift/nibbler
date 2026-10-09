"use strict";

function NewEngineLabView(hub) {
	let view = Object.create(null);

	function safe(value) {
		return SafeStringHTML(value === null || value === undefined ? "" : String(value));
	}

	function score_text(info) {
		if (!info) return "—";
		if (info.score && info.score.type === "mate") return `M${info.score.value}`;
		if (info.score && info.score.type === "cp") {
			let pawns = info.score.value / 100;
			return `${pawns >= 0 ? "+" : ""}${pawns.toFixed(2)}`;
		}
		return info.wdl ? `${Math.round((info.wdl.win + info.wdl.draw * 0.5) / 10)}%` : "—";
	}

	function session_card(session) {
		// The results store is reset on every new search and sorted by multipv, so the
		// first entry is the engine's best line for the position being searched now.
		let info = session.resultsStore.results()[0] || null;
		let engine_name = session.name || (session.engine && session.engine.name) || session.profileKey || session.sessionId;
		let pv = info && Array.isArray(info.pv) ? info.pv.join(" ") : "";
		return `<section class="engine-lab-card">
			<div class="engine-lab-card-title">${safe(engine_name)}</div>
			<div class="engine-lab-card-state">${safe(session.lifecycleState)} / ${safe(session.searchState)}</div>
			<div class="engine-lab-card-stats">${safe(score_text(info))} | depth ${safe(info && info.depth)} | ${safe(info && info.nodes)} nodes | ${safe(info && info.nps)} n/s</div>
			<div class="engine-lab-card-pv">${safe(pv)}</div>
			<button data-engine-lab-action="add" data-session-id="${safe(session.sessionId)}" ${info && pv ? "" : "disabled"}>Add PV to tree</button>
		</section>`;
	}

	function profile_keys() {
		let current = hub.engine.filepath;
		return Object.keys(engineconfig || {}).filter(profile => profile !== current);
	}

	function profile_controls(profiles) {
		let options = profiles.map(profile => `<option value="${safe(profile)}">${safe(profile)}</option>`).join("");
		return `<div class="engine-lab-controls">
			<select id="engine_lab_secondary_profile">${options}</select>
			<button data-engine-lab-action="start" ${options ? "" : "disabled"}>Start comparison</button>
			<button data-engine-lab-action="stop">Stop comparison</button>
		</div>`;
	}

	function consensus_text(agreement, best_move) {
		let level = agreement.level === "partial" ?
			`partial (${agreement.responded}/${agreement.total} engines reporting)` : agreement.level;
		return `Consensus: ${safe(level)} | Best move: ${safe(best_move)} | Support: ${agreement.support}/${agreement.total}`;
	}

	// draw() runs on every hub draw while the comparison is shown. The controls are only rebuilt
	// when the engine list changes, so an open <select> keeps its value; the live part is only
	// written when its HTML actually changes.

	let controls_key = null;
	let live_html = null;

	view.draw = function() {
		let tab = hub.active_tab();
		if (!tab || !tab.comparison_mode) return;

		let profiles = profile_keys();
		let key = JSON.stringify([hub.engine.filepath].concat(profiles));
		let live = enginebox.querySelector(".engine-lab-live");
		if (!live || key !== controls_key) {
			enginebox.innerHTML = `<div class="engine-lab-panel">
				<div class="engine-lab-heading">Engine comparison</div>
				${profile_controls(profiles)}
				<div class="engine-lab-live"></div>
			</div>`;
			live = enginebox.querySelector(".engine-lab-live");
			controls_key = key;
			live_html = null;
		}

		let sessions = hub.engine_manager.sessions_for_tab(tab.id);
		let consensus = hub.engine_manager.get_consensus(tab.id);
		let candidate_rows = consensus.candidates.map(candidate =>
			`<div class="engine-lab-candidate"><span>${safe(candidate.move)}</span><span>${candidate.support}/${consensus.agreement.total}</span><span>${candidate.averageQ === null ? "—" : candidate.averageQ.toFixed(3)}</span></div>`
		).join("");
		let html = `<div class="engine-lab-cards">${sessions.map(session_card).join("")}</div>
			<div class="engine-lab-consensus">${consensus_text(consensus.agreement, consensus.bestMove)}</div>
			<div class="engine-lab-candidates">${candidate_rows}</div>`;
		if (html !== live_html) {
			live.innerHTML = html;
			live_html = html;
		}
	};

	return view;
}
