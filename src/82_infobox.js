"use strict";

let infobox_props = {

	draw_statusbox: function(node, engine, analysing_other) {

		if (config.show_engine_state) {

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
			let can_have_limit_met_msg = false;

			if (config.behaviour === "halt" && !engine.search_running.node) {
				status_string += `<span id="gobutton_clicker" class="yellow">HALTED (go?) </span>`;
				can_have_limit_met_msg = true;
			} else if (config.behaviour === "halt" && engine.search_running.node) {
				status_string += `<span class="yellow">HALTING... </span>`;
				can_have_limit_met_msg = true;
			} else if (config.behaviour === "analysis_locked") {
				status_string += `<span class="blue">Locked! </span>`;
				can_have_limit_met_msg = true;
			} else if (config.behaviour === "play_white" && node.board.active !== "w") {
				status_string += `<span class="yellow">YOUR MOVE </span>`;
			} else if (config.behaviour === "play_black" && node.board.active !== "b") {
				status_string += `<span class="yellow">YOUR MOVE </span>`;
			} else if (config.behaviour === "self_play") {
				status_string += `<span class="green">Self-play! </span>`;
			} else if (config.behaviour === "auto_analysis") {
				status_string += `<span class="green">Auto-eval! </span>`;
			} else if (config.behaviour === "analysis_free") {
				status_string += `<span id="haltbutton_clicker" class="green">ANALYSIS (halt?) </span>`;
				can_have_limit_met_msg = true;
			}

			if (config.book_explorer) {

				status_string += `<span class="blue">Book explorer arrows only!</span>`;

			} else {

				status_string += `<span class="gray">${NString(node.table.nodes)} nodes, ${DurationString(node.table.time)} (N/s: ${NString(node.table.nps)})`;
				if (config.options.SyzygyPath) {
					status_string += `, ${NString(node.table.tbhits)} tbhits`;
				}
				status_string += `</span>`;

				if (!engine.search_running.node) {
					if (can_have_limit_met_msg && typeof config.search_nodes === "number" && node.table.nodes >= config.search_nodes) {
						status_string += ` <span class="blue">(limit met)</span>`;
					} else {
						if (config.behaviour !== "halt") {
							status_string += ` <span class="blue">(stopped)</span>`;
						}
					}
				}
			}

			statusbox.innerHTML = status_string;
		}
	},

	draw_infobox: function(node, mouse_point, active_square, active_colour, hoverdraw_div, allow_inactive_focus) {

		let searchmoves = node.searchmoves;

		if (this.displaying_stderr()) {
			infobox.innerHTML = this.stderr_log;
			this.last_drawn_version = null;
			return;
		}

		if (!node || node.destroyed) {
			return;
		}

		let info_list;

		if (node.terminal_reason()) {
			info_list = [];
		} else {
			info_list = SortedMoveInfo(node);
		}

		let best_subcycle = info_list.length > 0 ? info_list[0].subcycle : 0;
		if (best_subcycle === 0) {		// Because all info was autopopulated
			best_subcycle = -1;			// Causes all info to be gray
		}

		if (typeof config.max_info_lines === "number" && config.max_info_lines > 0) {		// Hidden option, request of rwbc
			info_list = info_list.slice(0, config.max_info_lines);
		}

		// We might be highlighting some div...

		let highlight_move = null;
		let highlight_class = null;

		// We'll highlight it if it's a valid OCM *and* clicking there now would make it happen...

		if (mouse_point && this.one_click_moves[mouse_point.x][mouse_point.y]) {
			if (!active_square || this.one_click_moves[mouse_point.x][mouse_point.y].slice(0, 2) === active_square.s) {
				highlight_move = this.one_click_moves[mouse_point.x][mouse_point.y];
				highlight_class = "ocm_highlight";
			}
		}

		if (typeof hoverdraw_div === "number" && hoverdraw_div >= 0 && hoverdraw_div < info_list.length) {
			highlight_move = info_list[hoverdraw_div].move;
			highlight_class = "hover_highlight";
		}

		// We cannot skip the draw if...

		let no_skip_reasons = [];

		if (node.id !== this.last_drawn_node_id)                                no_skip_reasons.push("node");
		if (node.table.version !== this.last_drawn_version)                     no_skip_reasons.push("table version");
		if (highlight_move !== this.last_drawn_highlight_move)                  no_skip_reasons.push("highlight move");
		if (highlight_class !== this.last_drawn_highlight_class)                no_skip_reasons.push("highlight class");
		if (info_list.length !== this.last_drawn_length)                        no_skip_reasons.push("info list length");
		if (allow_inactive_focus !== this.last_drawn_allow_inactive_focus)      no_skip_reasons.push("allow inactive focus");
		if (CompareArrays(searchmoves, this.last_drawn_searchmoves) === false)  no_skip_reasons.push("searchmoves");

		draw_infobox_no_skip_reasons = no_skip_reasons.join(", ");	// For debugging only.

		if (no_skip_reasons.length === 0) {
			draw_infobox_total_skips++;
			return;
		}

		this.last_drawn_node_id = node.id;
		this.last_drawn_version = node.table.version;
		this.last_drawn_highlight_move = highlight_move;
		this.last_drawn_highlight_class = highlight_class;
		this.last_drawn_length = info_list.length;
		this.last_drawn_allow_inactive_focus = allow_inactive_focus;
		this.last_drawn_searchmoves = Array.from(searchmoves);

		this.info_clickers = [];
		this.info_clickers_node_id = node.id;

		let substrings = [];
		let clicker_index = 0;
		let div_index = 0;

		for (let info of info_list) {

			// The div containing the PV etc...

			let divclass = "infoline";

			if (info.subcycle !== best_subcycle && !config.never_grayout_infolines) {
				divclass += " " + "gray";
			}

			if (info.move === highlight_move) {
				divclass += " " + highlight_class;
			}

			substrings.push(`<div id="infoline_${div_index++}" class="${divclass}">`);

			// The "focus" button...

			if (config.searchmoves_buttons) {
				if (searchmoves.includes(info.move)) {
					substrings.push(`<span id="searchmove_${info.move}" class="yellow">${config.focus_on_text} </span>`);
				} else {
					if (allow_inactive_focus) {
						substrings.push(`<span id="searchmove_${info.move}" class="gray">${config.focus_off_text} </span>`);
					}
				}
			}

			// The value...

			let value_string = "?";
			if (config.show_cp) {
				if (typeof info.mate === "number" && info.mate !== 0) {
					value_string = info.mate_string(config.cp_white_pov);
				} else {
					value_string = info.cp_string(config.cp_white_pov);
				}
			} else {
				value_string = info.value_string(1, config.ev_white_pov);
				if (value_string !== "?") {
					value_string += "%";
				}
			}

			if (info.subcycle === best_subcycle || config.never_grayout_infolines) {
				substrings.push(`<span class="blue">${value_string} </span>`);
			} else {
				substrings.push(`${value_string} `);
			}

			// The PV...

			let colour = active_colour;
			let movenum = node.board.fullmove;			// Only matters for config.infobox_pv_move_numbers
			let nice_pv = info.nice_pv();

			for (let i = 0; i < nice_pv.length; i++) {
				let spanclass = "";
				if (info.subcycle === best_subcycle || config.never_grayout_infolines) {
					spanclass = colour === "w" ? "white" : "pink";
				}
				if (nice_pv[i].includes("O-O")) {
					spanclass += (spanclass.length > 0) ? " nobr" : "nobr";
				}

				let numstring = "";
				if (config.infobox_pv_move_numbers) {
					if (colour === "w") {
						numstring = `${movenum}. `;
					} else if (colour === "b" && i === 0) {
						numstring = `${movenum}... `;
					}
				}

				substrings.push(`<span id="infobox_${clicker_index++}" class="${spanclass}">${numstring}${nice_pv[i]} </span>`);
				this.info_clickers.push({
					move: info.pv[i],
					is_start: i === 0,
					is_end: i === nice_pv.length - 1,
				});
				colour = OppositeColour(colour);
				if (colour === "w") {
					movenum++;
				}
			}

			// The extra stats...

			if (info.__touched) {

				let extra_stat_strings = info.stats_list(
					{
						n:             config.show_n,
						n_abs:         config.show_n_abs,
						depth:         config.show_depth,
						wdl:           config.show_wdl,
						wdl_white_pov: config.wdl_white_pov,
						p:             config.show_p,
						m:             config.show_m,
						v:             config.show_v,
						q:             config.show_q,
						u:             config.show_u,
						s:             config.show_s,
					}, node.table.nodes);

				if (extra_stat_strings.length > 0) {
					if (config.infobox_stats_newline) {
						substrings.push("<br>");
					}
					substrings.push(`<span class="gray">(${extra_stat_strings.join(', ')})</span>`);
				}
			}

			// Close the whole div...

			substrings.push("</div>");

		}

		infobox.innerHTML = substrings.join("");
		this.ever_drew_infobox = true;
	},

	must_draw_infobox: function() {
		this.last_drawn_version = null;
	},

	clickers_are_valid_for_node: function(node) {
		if (!node || !this.info_clickers_node_id) {
			return false;
		}
		return node.id === this.info_clickers_node_id;
	},

	moves_from_click_n: function(n) {

		if (typeof n !== "number" || Number.isNaN(n)) {
			return [];
		}

		if (!this.info_clickers || n < 0 || n >= this.info_clickers.length) {
			return [];
		}

		let move_list = [];

		// Work backwards until we get to the start of the line...

		for (; n >= 0; n--) {
			let object = this.info_clickers[n];
			move_list.push(object.move);
			if (object.is_start) {
				break;
			}
		}

		move_list.reverse();

		return move_list;
	},

};



// For debugging...
let draw_infobox_total_skips = 0;
let draw_infobox_no_skip_reasons = "";
