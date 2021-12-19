"use strict";

function NewStatusHandler() {

	let sh = Object.create(null);

	sh.special_message = null;
	sh.special_message_class = "yellow";
	sh.special_message_timeout = performance.now();

	sh.set_special_message = function(s, css_class, duration) {
		if (!css_class) css_class = "yellow";
		if (!duration) duration = 3000;
		this.special_message = s;
		this.special_message_class = css_class;
		this.special_message_timeout = performance.now() + duration;
	};

	sh.draw_statusbox = function(node, engine, analysing_other, loading_message, book_is_loaded) {

		if (loading_message) {

			statusbox.innerHTML = `<span class="yellow">${loading_message}</span> <span class="red" id="loadabort_clicker">(abort?)</span>`;

		} else if (config.show_engine_state) {

			let cl;
			let status;

			if (engine.search_running.node && engine.search_running === engine.search_desired) {
				cl = "green";
				status = "running";
			} else if (engine.search_running !== engine.search_desired) {
				cl = "yellow";
				status = "desync";
			} else {
				cl = "yellow";
				status = "stopped";
			}

			statusbox.innerHTML =
			`<span class="${cl}">${status}</span>, ` +
			`${config.behaviour}, ` +
			`${engine.last_send}`;

		} else if (!engine.ever_received_uciok) {

			statusbox.innerHTML = `<span class="yellow">Awaiting uciok from engine</span>`;

		} else if (!engine.ever_received_readyok) {

			statusbox.innerHTML = `<span class="yellow">Awaiting readyok from engine</span>`;

		} else if (this.special_message && performance.now() < this.special_message_timeout) {

			statusbox.innerHTML = `<span class="${this.special_message_class}">${this.special_message}</span>`;

		} else if (engine.unresolved_stop_time && performance.now() - engine.unresolved_stop_time > 500) {

			statusbox.innerHTML = `<span class="yellow">${messages.desync}</span>`;

		} else if (analysing_other) {

			statusbox.innerHTML = `<span id="lock_return_clicker" class="blue">Locked to ${analysing_other} (return?)</span>`;

		} else if (node.terminal_reason()) {

			statusbox.innerHTML = `<span class="yellow">${node.terminal_reason()}</span>`;

		} else if (!node || node.destroyed) {

			statusbox.innerHTML = `<span class="red">draw_statusbox - !node || node.destroyed</span>`;

		} else {

			let status_string = "";

			if (config.behaviour === "halt" && !engine.search_running.node) {
				status_string += `<span id="gobutton_clicker" class="yellow">HALTED (go?) </span>`;
			} else if (config.behaviour === "halt" && engine.search_running.node) {
				status_string += `<span class="yellow">HALTING... </span>`;
			} else if (config.behaviour === "analysis_locked") {
				status_string += `<span class="blue">Locked! </span>`;
			} else if (config.behaviour === "play_white" && node.board.active !== "w") {
				status_string += `<span class="yellow">YOUR MOVE </span>`;
			} else if (config.behaviour === "play_black" && node.board.active !== "b") {
				status_string += `<span class="yellow">YOUR MOVE </span>`;
			} else if (config.behaviour === "self_play") {
				status_string += `<span class="green">Self-play! </span>`;
			} else if (config.behaviour === "auto_analysis") {
				status_string += `<span class="green">Auto-eval! </span>`;
			} else if (config.behaviour === "back_analysis") {
				status_string += `<span class="green">Back-eval! </span>`;
			} else if (config.behaviour === "analysis_free") {
				status_string += `<span id="haltbutton_clicker" class="green">ANALYSIS (halt?) </span>`;
			}

			if (config.book_explorer) {

				let warn = book_is_loaded ? "" : " (No book loaded)";
				status_string += `<span class="blue">Book frequency arrows only!${warn}</span>`;

			} else if (config.lichess_explorer) {

				let warn = (config.looker_api === "lichess_masters" || config.looker_api === "lichess_plebs") ? "" : " (API not selected)";
				status_string += `<span class="blue">Lichess frequency arrows only!${warn}</span>`;

			} else {

				status_string += `<span class="gray">${NString(node.table.nodes)} ${node.table.nodes === 1 ? "node" : "nodes"}`;
				status_string += `, ${DurationString(node.table.time)} (N/s: ${NString(node.table.nps)})`;
				if (engineconfig[engine.filepath].options["SyzygyPath"]) {
					status_string += `, ${NString(node.table.tbhits)} ${node.table.tbhits === 1 ? "tbhit" : "tbhits"}`;
				}
				status_string += `</span>`;

				if (!engine.search_running.node && engine.search_completed.node === node) {

					let stoppedtext = "";

					if (config.behaviour !== "halt") {
						stoppedtext = ` <span class="blue">(stopped)</span>`;
					}
/*
					// The following doesn't make sense if a time limit rather than a move limit is in force.

					if (typeof engineconfig[engine.filepath].search_nodes === "number" && engineconfig[engine.filepath].search_nodes > 0) {
						if (node.table.nodes >= engineconfig[engine.filepath].search_nodes) {
							stoppedtext = ` <span class="blue">(limit met)</span>`;
						}
					}
*/
					status_string += stoppedtext;
				}
			}

			statusbox.innerHTML = status_string;
		}
	};

	return sh;
}
