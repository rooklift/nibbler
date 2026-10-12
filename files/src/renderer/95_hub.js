"use strict";

const TAB_STATE_KEYS = [
	"tree",
	"flip",
	"behaviour",
	"active_square",
	"leela_lock_node",
	"pgndata",
	"pgn_choices_start",
	"pgndata_merge_into_current",
	"book",
	"book_explorer",
	"lichess_explorer",
	"looker_api",
	"look_past_25",
	"node_to_clean",
	"hoverdraw_div",
	"hoverdraw_depth",
	"position_change_time",
	"fullbox_comment_node",
	"undo_stack",
	"grapher",
	"looker",
	"info_handler",
	"status_handler",
	"loaders",
	"friendly_draws",
	"enemy_draws",
	"dirty_squares",
	"tick",
	"explorer_objects_cache",
	"explorer_cache_node_id",
	"engine_session_ids",
	"engine_group_id",
	"background_analysis_enabled",
	"comparison_mode",
	"consensus_settings",
];

function tab_title_for(tab) {
	let tags = (tab.tree.root && tab.tree.root.tags) || {};
	let white = String(tags.White || "").trim();
	let black = String(tags.Black || "").trim();
	let source = (tab.pgndata && String(tab.pgndata.source || "").trim()) || tab.session_source || "";

	if (white && black) {
		return white + " - " + black;
	}
	if (source) {
		return source;
	}
	return "New game";
}

function install_tab_aliases(hub) {
	for (let key of TAB_STATE_KEYS) {
		Object.defineProperty(hub, key, {
			enumerable: true,
			configurable: false,
			get: function() {
				return hub.current_tab()[key];
			},
			set: function(value) {
				hub.current_tab()[key] = value;
			}
		});
	}
}

function reset_tab_draw_cache(tab) {
	tab.friendly_draws = New2DArray(8, 8, null);
	tab.enemy_draws = New2DArray(8, 8, null);
	tab.dirty_squares = New2DArray(8, 8, null);
}

function NewHub() {

	let hub = Object.create(null);

	hub.engine_manager = NewEngineManager(hub);
	hub.engine = NewEngine(hub);						// Just a dummy object with no exe. Fixed by start.js later.
	hub.engine_manager.attach_primary(hub.engine, "");

	hub.tab_manager = NewTabManager(hub);
	let initial_tab = hub.tab_manager.new_tab();
	hub.engine_manager.assign_to_tab(hub.engine_manager.primary_session_id(), initial_tab.id);
	hub._context_tab = null;
	hub.current_tab = function() {
		return hub._context_tab || hub.tab_manager.active();
	};
	hub.is_active_context = function() {
		return hub.current_tab() === hub.tab_manager.active();
	};
	hub.with_tab = function(tab, fn) {
		let previous = hub._context_tab;
		hub._context_tab = tab;
		try {
			return fn();
		} finally {
			hub._context_tab = previous;
		}
	};
	hub.find_tab_for_node = function(node) {
		if (!node) {
			return null;
		}
		let root = node;
		while (root.parent) {
			root = root.parent;
		}
		for (let tab of hub.tab_manager.tabs) {
			if (tab.tree && tab.tree.root === root) {
				return tab;
			}
		}
		return null;
	};
	install_tab_aliases(hub);
	hub.active_tab = function() {
		return hub.tab_manager.active();
	};

	// Various state we have to keep track of...

	hub.engine_choices = [];							// Made by show_fast_engine_chooser() when needed.
	hub.fullbox_config_item = null;						// Name of config item currently being edited in fullbox.
	hub.fullbox_web_link = null;						// Web link which can be clicked on in the config editor.
	hub.tab_switch_in_progress = false;
	hub.pending_tab_id = null;
	hub.pending_tab_close = null;
	hub.pending_tab_reset = false;
	hub.displayed_flip = false;

	hub.looker.add_to_queue(hub.tree.node.board);		// Maybe make initial call to API such as ChessDN.cn...
	Object.assign(hub, hub_props);
	hub.engine_lab_view = NewEngineLabView(hub);
	hub.refresh_active_tab_title();
	hub.draw_tabs();
	return hub;
}

// Allowed values for numeric config items edited in the fullbox. Integers only, because
// they end up in UCI commands such as "go movetime <n>". The lower bound also keeps the
// time budget from being set to a value that the auto-analysis code would ignore.

const CONFIG_NUMBER_RANGES = {
	auto_analysis_time_ms: {min: 100, max: 3600000},
};

let hub_props = {

	onReady: function(engine, event) {
		this.engine_manager.handle_event("onReady", engine, event);
	},

	onInfo: function(engine, event) {
		this.engine_manager.handle_event("onInfo", engine, event);
	},

	onBestmove: function(engine, event) {
		this.engine_manager.handle_event("onBestmove", engine, event);
	},

	onError: function(engine, event) {
		this.engine_manager.handle_event("onError", engine, event);
	},

	onExit: function(engine, event) {
		this.engine_manager.handle_event("onExit", engine, event);
	},

	onStateChanged: function(engine, event) {
		this.engine_manager.handle_event("onStateChanged", engine, event);
	},

	// ---------------------------------------------------------------------------------------------------------------------
	// Core methods wrt our main state...

	engine_owner_tab: function() {
		return this.find_tab_for_node(this.engine.search_running.node) || this.find_tab_for_node(this.engine.search_desired.node);
	},

	engine_busy_elsewhere: function() {
		let tab = this.engine_owner_tab();
		return !!tab && tab.id !== this.current_tab().id;
	},

	behaviour_starts_engine: function(s) {
		return ["analysis_free", "analysis_locked", "auto_analysis", "back_analysis", "self_play", "play_white", "play_black"].includes(s);
	},

	behave: function(reason) {							// reason should be "position" or "behaviour"

		// Called when position changes.
		// Called when behaviour changes.
		//
		// Each branch should do one of the following:
		//
		//		Call __go() to start a new search
		//		Call __halt() to ensure the engine isn't running
		//		Nothing, iff the correct search is already running

		if (reason !== "position" && reason !== "behaviour") {
			throw "behave(): bad call";
		}

		let engine_tab = this.find_tab_for_node(this.engine.search_running.node) || this.find_tab_for_node(this.engine.search_desired.node);
		let current_tab = this.current_tab();
		let engine_owned_here = !engine_tab || engine_tab.id === current_tab.id;

		switch (this.behaviour) {

		case "halt":

			if (engine_owned_here) {
				this.__halt();
			}
			break;

		case "analysis_free":

			// Note that the 2nd part of the condition is needed because changing behaviour can change what node_limit()
			// returns, therefore we might already be running a search for the right node but with the wrong limit.
			// THIS IS TRUE THROUGHOUT THIS FUNCTION.

			if (this.engine.search_desired.node !== this.tree.node || this.engine.search_desired.limit !== this.node_limit()) {
				this.__go(this.tree.node);
			}
			break;

		case "auto_analysis":
		case "back_analysis":

			if (this.tree.node.terminal_reason()) {
				this.continue_auto_analysis();				// This can get a bit recursive, do we care?
			} else if (this.engine.search_desired.node !== this.tree.node || this.engine.search_desired.limit !== this.node_limit()) {
				this.__go(this.tree.node);
			}
			break;

		case "analysis_locked":

			// Moving shouldn't trigger anything, except that re-entering the correct node changes behaviour to halt
			// iff the search is completed.

			if (reason === "position") {
				if (!engine_owned_here) {
					break;
				}

				if (this.tree.node === this.leela_lock_node) {
					if (!this.engine.search_desired.node) {
						this.set_behaviour_direct("halt");
					}
				}

			} else {

				if (this.engine.search_desired.node !== this.leela_lock_node || this.engine.search_desired.limit !== this.node_limit()) {
					this.__go(this.leela_lock_node);
				}

			}
			break;

		case "self_play":
		case "play_white":
		case "play_black":

			if ((this.behaviour === "self_play") ||
				(this.behaviour === "play_white" && this.tree.node.board.active === "w") ||
				(this.behaviour === "play_black" && this.tree.node.board.active === "b")) {

				if (this.maybe_setup_book_move()) {
					this.__halt();
					break;
				}

				if (this.engine.search_desired.node !== this.tree.node || this.engine.search_desired.limit !== this.node_limit()) {
					this.__go(this.tree.node);
				}

			} else {			// Play single colour mode, wrong colour.

				this.__halt();

			}

			break;
		}
	},

	position_changed: function(new_game_flag, avoid_confusion) {

		// Called right after this.tree.node is changed, meaning we are now drawing a different position.

		let is_active = this.is_active_context();
		let engine_tab = this.find_tab_for_node(this.engine.search_running.node) || this.find_tab_for_node(this.engine.search_desired.node);
		let engine_owned_here = !engine_tab || engine_tab.id === this.current_tab().id;

		if (is_active) {
			this.escape();
			drag_handler.cancel_drag();
		}

		this.hoverdraw_div = -1;
		this.position_change_time = performance.now();
		if (is_active) {
			fenbox.value = this.tree.node.board.fen(true);
		}

		if (new_game_flag && is_active) {
			this.node_to_clean = null;
			this.leela_lock_node = null;
			if (engine_owned_here) {
				this.set_behaviour("halt");					// Will cause "stop" to be sent.
			}
			if (engine_owned_here && !config.suppress_ucinewgame) {
				this.engine.send_ucinewgame();			// Must happen after "stop" is sent.
			}
			this.send_title();
			if (this.engine.ever_received_uciok && !this.engine.in_960_mode() && this.tree.node.board.normalchess === false) {
				alert(messages.c960_warning);
			}
		}

		if (this.tree.node.table.already_autopopulated === false) {
			this.tree.node.table.autopopulate(this.tree.node);
		}

		// When entering a position, clear its searchmoves, unless it's the analysis_locked node.

		if (this.leela_lock_node !== this.tree.node) {
			this.tree.node.searchmoves = [];
		}

		// Caller can tell us the change would cause user confusion for some modes...

		if (avoid_confusion) {
			if (["play_white", "play_black", "self_play", "auto_analysis", "back_analysis"].includes(this.behaviour)) {
				this.set_behaviour("halt");
			}
		}

		this.maybe_infer_info();						// Before node_exit_cleanup() so that previous ghost info is available when moving forwards.
		this.behave("position");
		if (is_active) {
			this.draw();
		}

		this.node_exit_cleanup();						// This feels like the right time to do this.
		this.node_to_clean = this.tree.node;

		this.looker.add_to_queue(this.tree.node.board);
	},

	set_behaviour: function(s) {

		if (!this.engine.ever_received_uciok || !this.engine.ever_received_readyok) {
			s = "halt";
		}

		if (this.engine_busy_elsewhere() && this.behaviour_starts_engine(s)) {
			this.set_special_message("Engine is busy in another tab", "yellow", 3000);
			this.update_toolbar_state();
			this.draw_statusbox();
			return;
		}

		// Don't do anything if behaviour is already correct. But
		// "halt" always triggers a behave() call for safety reasons.

		if (s === this.behaviour) {
			switch (s) {
			case "halt":
				break;					// i.e. do NOT immediately return
			case "analysis_locked":
				if (this.leela_lock_node !== this.tree.node) {
					break;				// i.e. do NOT immediately return
				}
				return;
			case "analysis_free":
				if (!this.engine.search_desired.node) {
					break;				// i.e. do NOT immediately return
				}
				return;
			default:
				return;
			}
		}

		this.set_behaviour_direct(s);
		this.behave("behaviour");
	},

	set_behaviour_direct: function(s) {
		this.leela_lock_node = (s === "analysis_locked") ? this.tree.node : null;
		this.behaviour = s;
		this.update_toolbar_state();
	},

	refresh_active_tab_title: function() {
		let tab = this.active_tab();
		tab.title = tab_title_for(tab);
		this.draw_tabs();
		if (this.is_active_context()) {
			this.send_title();
		}
	},

	draw_tabs: function() {

		if (!tabbar) {
			return;
		}

		while (tabbar.firstChild) {
			tabbar.removeChild(tabbar.firstChild);
		}

		for (let tab of this.tab_manager.tabs) {
			let item = document.createElement("span");
			item.className = "tab_item";
			if (tab.id === this.tab_manager.active_tab_id) {
				item.classList.add("tab_item_active");
			}
			item.id = `tab_${tab.id}`;
			item.dataset.tabId = String(tab.id);

			let title = document.createElement("span");
			title.className = "tab_title";
			title.textContent = tab.title || "New game";
			title.title = title.textContent;

			let close = document.createElement("button");
			close.className = "tab_close";
			close.id = `tab_close_${tab.id}`;
			close.dataset.tabCloseId = String(tab.id);
			close.type = "button";
			close.setAttribute("aria-label", "Close tab");
			close.textContent = "x";

			item.appendChild(title);
			item.appendChild(close);
			tabbar.appendChild(item);
		}

		let add = document.createElement("button");
		add.className = "tab_add";
		add.id = "tab_add";
		add.type = "button";
		add.setAttribute("aria-label", "New tab");
		add.textContent = "+";
		tabbar.appendChild(add);
	},

	apply_display_flip: function(target_flip) {

		target_flip = !!target_flip;

		if (this.displayed_flip === target_flip) {
			return;
		}

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 4; y++) {

				let first = document.getElementById(`overlay_${S(x, y)}`);
				let second = document.getElementById(`overlay_${S(7 - x, 7 - y)}`);
				SwapElements(first, second);

				first = document.getElementById(`underlay_${S(x, y)}`);
				second = document.getElementById(`underlay_${S(7 - x, 7 - y)}`);
				SwapElements(first, second);
			}
		}

		this.displayed_flip = target_flip;
	},

	tabbar_click: function(event) {

		let close = event.target.closest("[data-tab-close-id]");
		if (close) {
			event.preventDefault();
			event.stopPropagation();
			this.close_current_tab();
			return;
		}

		let add = event.target.closest("#tab_add");
		if (add) {
			event.preventDefault();
			event.stopPropagation();
			this.new_tab();
			return;
		}

		let item = event.target.closest("[data-tab-id]");
		if (item) {
			let id = Number(item.dataset.tabId);
			if (!Number.isNaN(id)) {
				this.switch_tab(id);
			}
		}
	},

	_wait_for_engine_idle_then: function(callback) {

		if (this.engine.search_running.node || this.engine.search_desired.node) {
			setTimeout(() => {
				this._wait_for_engine_idle_then(callback);
			}, 20);
			return;
		}

		callback();
	},

	_finish_tab_switch: function() {

		let target_id = this.pending_tab_id;
		if (target_id === null) {
			this.tab_switch_in_progress = false;
			return;
		}

		let closing = this.pending_tab_close;
		this.pending_tab_id = null;
		this.pending_tab_close = null;

		this.hide_fullbox();
		this.hide_promotiontable();

		this.tab_manager.switch_to(target_id);
		reset_tab_draw_cache(this.active_tab());
		this.info_handler.must_draw_infobox();
		this.tree.dom_from_scratch();
		this.apply_display_flip(this.flip);
		this.refresh_active_tab_title();
		fenbox.value = this.tree.node.board.fen(true);
		this.draw();

		if (closing) {
			this.engine_manager.unassign_tab(closing.old_id);
			this.tab_manager.close_tab(closing.old_id);
			this.draw_tabs();
		}

		this.looker.add_to_queue(this.tree.node.board);
		this.tab_switch_in_progress = false;
		this.draw_tabs();

		if (this.pending_tab_id !== null && this.pending_tab_id !== this.tab_manager.active_tab_id) {
			let next_id = this.pending_tab_id;
			this.pending_tab_id = null;
			this.switch_tab(next_id);
		}
	},

	switch_tab: function(tab_id) {

		if (tab_id === null || this.tab_manager.find(tab_id) === null) {
			return;
		}

		if (this.tab_manager.active_tab_id === tab_id && !this.tab_switch_in_progress) {
			return;
		}

		this.pending_tab_id = tab_id;

		if (this.tab_switch_in_progress) {
			return;
		}

		this.tab_switch_in_progress = true;

		let closing = this.pending_tab_close;
		let active_search_tab = this.find_tab_for_node(this.engine.search_running.node) || this.find_tab_for_node(this.engine.search_desired.node);
		let should_wait = !!closing && active_search_tab && active_search_tab.id === closing.old_id;

		if (should_wait) {
			this.set_engine_search(null);
			this._wait_for_engine_idle_then(() => {
				this._finish_tab_switch();
			});
			return;
		}

		this._finish_tab_switch();
	},

	new_tab: function() {
		let tab = this.tab_manager.new_tab();
		this.switch_tab(tab.id);
		return tab;
	},

	close_current_tab: function() {

		if (this.tab_manager.count() <= 1) {
			this.reset_active_tab_to_new_game();
			return;
		}

		let old_id = this.tab_manager.active_tab_id;
		let ids = this.tab_manager.tabs.map(tab => tab.id);
		let index = ids.indexOf(old_id);
		let replacement_id = null;

		if (index >= 0 && index < ids.length - 1) {
			replacement_id = ids[index + 1];
		} else if (index > 0) {
			replacement_id = ids[index - 1];
		}

		if (replacement_id === null) {
			return;
		}

		this.pending_tab_close = {
			old_id: old_id,
			replacement_id: replacement_id
		};
		this.switch_tab(replacement_id);
	},

	activate_next_tab: function() {
		let id = this.tab_manager.next_tab();
		if (id !== null) {
			this.switch_tab(id);
		}
	},

	activate_previous_tab: function() {
		let id = this.tab_manager.previous_tab();
		if (id !== null) {
			this.switch_tab(id);
		}
	},

	reset_active_tab_to_new_game: function() {
		let active_tab = this.active_tab();
		let search_tab = this.find_tab_for_node(this.engine.search_running.node) || this.find_tab_for_node(this.engine.search_desired.node);

		if (search_tab && search_tab.id === active_tab.id) {
			this.pending_tab_reset = true;
			this.set_engine_search(null);
			this._wait_for_engine_idle_then(() => {
				if (!this.pending_tab_reset) {
					return;
				}
				this.pending_tab_reset = false;
				this._reset_active_tab_to_new_game_now();
			});
			return;
		}

		this._reset_active_tab_to_new_game_now();
	},

	_reset_active_tab_to_new_game_now: function() {
		let tab = this.active_tab();
		tab.tree = NewTreeHandler();
		tab.flip = false;
		tab.active_square = null;
		tab.leela_lock_node = null;
		tab.pgndata = null;
		tab.session_source = null;
		tab.pgn_choices_start = 0;
		tab.pgndata_merge_into_current = false;
		tab.book = null;
		tab.node_to_clean = tab.tree.node;
		tab.hoverdraw_div = -1;
		tab.hoverdraw_depth = 0;
		tab.position_change_time = performance.now();
		tab.fullbox_comment_node = null;
		tab.undo_stack = NewUndoStack(this);
		tab.title = "New game";
		this.hide_fullbox();
		this.hide_promotiontable();
		this.apply_display_flip(tab.flip);
		fenbox.value = tab.tree.node.board.fen(true);
		this.refresh_active_tab_title();
		this.draw();
		this.looker.add_to_queue(tab.tree.node.board);
	},

	toggle_go: function() {
		if (["analysis_free", "self_play", "auto_analysis", "back_analysis"].includes(this.behaviour)) {
			this.set_behaviour("halt");
		} else if (this.behaviour === "halt") {
			this.set_behaviour("analysis_free");
		}
	},

	play_this_colour: function() {
		if (this.tree.node.board.active === "w") {
			this.set_behaviour("play_white");
		} else {
			this.set_behaviour("play_black");
		}
	},

	handle_search_params_change: function() {

		// If there's already a search desired, we can just let __go() figure out what the new parameters should be.
		// If they match what is already desired then set_search_desired() will ignore the call.

		if (this.engine.search_desired.node) {
			this.__go(this.engine.search_desired.node);
		}

		// If there's no search desired, changing params probably shouldn't start one. As of 1.8.3, when a search
		// completes due to hitting the (normal) node limit, behaviour gets changed back to "halt" in one way or
		// another (unless config.allow_stopped_analysis is set).

		this.update_toolbar_state();
	},

	continue_auto_analysis: function() {

		let ok;

		if (this.behaviour === "auto_analysis") {
			ok = this.tree.next();
		} else if (this.behaviour === "back_analysis") {
			ok = this.tree.prev();
		}

		if (ok) {
			this.position_changed(false, false);
		} else {
			this.set_behaviour("halt");
		}
	},

	maybe_setup_book_move: function() {

		if (!this.book || this.tree.node.terminal_reason()) {
			return false;
		}

		if (typeof config.book_depth === "number" && this.tree.node.depth >= config.book_depth * 2) {
			return false;
		}

		let move;

		let objects = BookProbe(KeyFromBoard(this.tree.node.board), this.book);
		let total_weight = 0;

		if (Array.isArray(objects)) {
			for (let o of objects) {
				total_weight += o.weight;
			}
		}

		if (total_weight <= 0) {
			return false;
		}

		let rng = RandInt(0, total_weight);
		let weight_seen = 0;
		for (let o of objects) {			// The order doesn't matter at all when you think about it. No need to sort.
			weight_seen += o.weight;
			if (rng < weight_seen) {
				move = o.move;
				break;
			}
		}

		if (!move) {
			return false;
		}

		if (this.tree.node.board.illegal(move)) {
			return false;
		}

		let correct_node = this.tree.node;
		let correct_behaviour = this.behaviour;

		// Use a setTimeout to prevent recursion (since move() will cause a call to behave())

		setTimeout(() => {
			if (this.tree.node === correct_node && this.behaviour === correct_behaviour) {
				this.move(move);
			}
		}, 0);

		return true;
	},

	maybe_infer_info: function() {

		// This function creates "ghost" info in the info table when possible and necessary;
		// such info is inferred from ancestral info. It is also deleted upon leaving the node.
		//
		// The whole thing is a bit sketchy, maybe.

		if (this.behaviour === "play_white" || this.behaviour === "play_black") {
			return;
		}

		let node = this.tree.node;

		if (node.terminal_reason()) {
			return;
		}
		if (!node.parent) {
			return;
		}

		for (let info of Object.values(node.table.moveinfo)) {
			if (info.__touched) {
				return;
			}
		}

		// So the current node has no real info.

		let moves = [node.move];
		let ancestor = null;

		let foo = node.parent;

		while (foo) {

			for (let info of Object.values(foo.table.moveinfo)) {
				if (info.__touched) {
					ancestor = foo;
					break;
				}
			}

			if (!ancestor) {
				moves.push(foo.move);
				foo = foo.parent;
			} else {
				break;
			}
		}

		if (!ancestor) {
			return;
		}

		// So we found the closest ancestor with info.

		moves.reverse();

		let oldinfo = ancestor.table.moveinfo[moves[0]];

		if (!oldinfo) {
			return;
		}

		if (Array.isArray(oldinfo.pv) === false || oldinfo.pv.length <= moves.length) {
			return;
		}

		let pv = Array.from(oldinfo.pv);

		for (let n = 0; n < moves.length; n++) {
			if (pv[n] !== moves[n]) {
				return;
			}
		}

		// So, everything matches and we can use the PV...

		let nextmove = pv[moves.length];
		pv = pv.slice(moves.length);

		let new_info = NewInfo(node.board, nextmove);
		new_info.set_pv(pv);
		new_info.__ghost = true;
		new_info.__touched = true;
		new_info.subcycle = 1;		// Crude hack, makes draw_infobox() make other moves gray.
		new_info.q = oldinfo.q;
		new_info.cp = oldinfo.cp;
		new_info.multipv = 1;

		// Flip our evals if the colour changes...

		if (oldinfo.board.active !== node.board.active) {
			if (typeof new_info.q === "number") {
				new_info.q *= -1;
			}
			if (typeof new_info.cp === "number") {
				new_info.cp *= -1;
			}
		}

		node.table.moveinfo[nextmove] = new_info;
	},

	node_exit_cleanup: function() {

		if (!this.node_to_clean || this.node_to_clean.destroyed) {
			return;
		}

		// Remove ghost info; which is only allowed in the node we're currently looking at...
		// By remove, I mean, replace it with a neutral info object.

		for (let key of Object.keys(this.node_to_clean.table.moveinfo)) {
			if (this.node_to_clean.table.moveinfo[key].__ghost) {
				this.node_to_clean.table.moveinfo[key] = NewInfo(this.node_to_clean.board, key);
			}
		}
	},

	// ---------------------------------------------------------------------------------------------------------------------
	// Spin, our main loop...

	spin: function() {
		this.tick++;
		this.draw();
		for (let tab of this.tab_manager.tabs) {
			this.with_tab(tab, () => {
				this.purge_finished_loaders();
			});
		}
		this.maybe_save_window_size();
		setTimeout(this.spin.bind(this), config.update_delay);
	},

	purge_finished_loaders: function() {
		this.loaders = this.loaders.filter(o => o.callback);
	},

	maybe_save_window_size: function() {
		if (this.window_resize_time && performance.now() - this.window_resize_time > 1000) {
			this.window_resize_time = null;
			this.save_window_size();
		}
	},

	// ---------------------------------------------------------------------------------------------------------------------
	// Drawing properties...

	draw: function() {

		if (!this.is_active_context()) {
			return;
		}

		// We do the :hover reaction first. This way, we are detecting hover based on the previous cycle's state.
		// This should prevent the sort of flicker that can occur if we try to detect hover based on changes we
		// just made (i.e. if we drew then detected hover instantly).

		let did_hoverdraw = this.hoverdraw();

		if (did_hoverdraw) {
			canvas.style.outline = "2px dashed #b4b4b4";
		} else {
			this.hoverdraw_div = -1;
			boardfriends.style.display = "block";
			canvas.style.outline = "none";
			this.draw_move_and_active_squares(this.tree.node.move, this.active_square);
			this.draw_enemies_in_table(this.tree.node.board);
			this.draw_canvas_arrows();
			this.draw_friendlies_in_table(this.tree.node.board);
		}

		this.draw_statusbox();
		this.draw_infobox();
		this.update_toolbar_state();
		if (this.comparison_mode) {
			this.draw_engine_lab();			// Live engine cards; the view skips DOM writes when nothing changed.
		}

		this.grapher.draw(this.tree.node);
		this.draw_tabs();
	},

	draw_friendlies_in_table: function(board) {

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {

				let piece_to_draw = "";

				if (board.colour(Point(x, y)) === board.active) {
					piece_to_draw = board.state[x][y];
				}

				if (piece_to_draw === this.friendly_draws[x][y]) {
					continue;
				}

				// So if we get to here, we need to draw...

				this.friendly_draws[x][y] = piece_to_draw;

				let s = S(x, y);
				let td = document.getElementById("overlay_" + s);

				if (piece_to_draw === "") {
					td.style["background-image"] = "none";
				} else {
					td.style["background-image"] = images[piece_to_draw].string_for_bg_style;
				}
			}
		}
	},

	draw_enemies_in_table: function(board) {

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {

				let piece_to_draw = "";

				if (board.colour(Point(x, y)) === OppositeColour(board.active)) {
					piece_to_draw = board.state[x][y];
				}

				if (piece_to_draw === this.enemy_draws[x][y]) {
					continue;
				}

				// So if we get to here, we need to draw...

				this.enemy_draws[x][y] = piece_to_draw;

				let s = S(x, y);
				let td = document.getElementById("underlay_" + s);

				if (piece_to_draw === "") {
					td.style["background-image"] = "none";
				} else {
					td.style["background-image"] = images[piece_to_draw].string_for_bg_style;
				}
			}
		}
	},

	draw_move_and_active_squares: function(move, active_square) {

		// These constants are stupidly used in set_active_square() also.

		const EMPTY = 0;
		const HIGHLIGHT = 1;
		const ACTIVE = 2;

		if (!this.dmaas_scratch) {
			this.dmaas_scratch = New2DArray(8, 8, null);
		}

		// First, set each element of the array to indicate what state we want
		// its background-color to be in.

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				this.dmaas_scratch[x][y] = EMPTY;
			}
		}

		let move_points = [];

		if (typeof move === "string") {
			let source = Point(move.slice(0, 2));
			let dest = Point(move.slice(2, 4));
			if (source && dest) {
				move_points = PointsBetween(source, dest);
			}
		}

		for (let p of move_points) {
			this.dmaas_scratch[p.x][p.y] = HIGHLIGHT;
		}

		if (active_square) {
			this.dmaas_scratch[active_square.x][active_square.y] = ACTIVE;
		}

		// Now the dmaas_scratch array has what we actually want.
		// We check whether each square is already so, and change it otherwise.

		for (let x = 0; x < 8; x++) {

			for (let y = 0; y < 8; y++) {

				switch (this.dmaas_scratch[x][y]) {

				case EMPTY:

					if (this.dirty_squares[x][y] !== EMPTY) {
						let s = S(x, y);
						let td = document.getElementById("underlay_" + s);
						td.style["background-color"] = "transparent";
						this.dirty_squares[x][y] = EMPTY;
					}

					break;

				case HIGHLIGHT:

					if (this.dirty_squares[x][y] !== HIGHLIGHT) {
						let s = S(x, y);
						let td = document.getElementById("underlay_" + s);
						td.style["background-color"] = config.move_squares_with_alpha;
						this.dirty_squares[x][y] = HIGHLIGHT;
					}

					break;

				case ACTIVE:

					if (this.dirty_squares[x][y] !== ACTIVE) {
						let s = S(x, y);
						let td = document.getElementById("underlay_" + s);
						td.style["background-color"] = config.active_square;
						this.dirty_squares[x][y] = ACTIVE;
					}

					break;
				}
			}
		}
	},

	hoverdraw: function() {

		if (!config.hover_draw || this.info_handler.clickers_are_valid_for_node(this.tree.node) === false) {
			return false;
		}

		if (performance.now() - this.position_change_time < 1000) {
			return false;
		}

		let overlist = document.querySelectorAll(":hover");

		// Find what div we are over by looking for infoline_n

		let div = null;
		let div_index = null;

		for (let item of overlist) {
			if (typeof item.id === "string" && item.id.startsWith("infoline_")) {
				div = item;
				div_index = parseInt(item.id.slice("infoline_".length), 10);
				break;
			}
		}

		if (!div || typeof div_index !== "number" || Number.isNaN(div_index)) {
			return false;
		}

		// Find what infobox clicker we are over by looking for infobox_n

		let click_n = null;

		for (let item of overlist) {
			if (typeof item.id === "string" && item.id.startsWith("infobox_")) {
				click_n = parseInt(item.id.slice("infobox_".length), 10);
				break;
			}
		}

		if (typeof click_n !== "number" || Number.isNaN(click_n)) {

			// We failed to get a click_n value. But if we are in Animate or Final Position mode,
			// it should still work even if the user isn't hovering over a move exactly; we can
			// just pass any valid click_n from the line... this is a pretty dumb hack.

			if (config.hover_method !== 0 && config.hover_method !== 2) {
				return false;
			}

			for (let item of div.childNodes) {
				if (typeof item.id === "string" && item.id.startsWith("infobox_")) {
					click_n = parseInt(item.id.slice("infobox_".length), 10);
					break;
				}
			}

			if (typeof click_n !== "number" || Number.isNaN(click_n)) {
				return false;
			}
		}

		//

		if (config.hover_method === 0) {
			return this.hoverdraw_animate(div_index, click_n);		// Sets this.hoverdraw_div
		} else if (config.hover_method === 1) {
			return this.hoverdraw_single(div_index, click_n);		// Sets this.hoverdraw_div
		} else if (config.hover_method === 2) {
			return this.hoverdraw_final(div_index, click_n);		// Sets this.hoverdraw_div
		} else {
			return false;											// Caller must set this.hoverdraw_div to -1
		}
	},

	hoverdraw_animate: function(div_index, click_n) {

		// If the user is hovering over an unexpected div index in the infobox, reset depth...

		if (div_index !== this.hoverdraw_div) {
			this.hoverdraw_div = div_index;
			this.hoverdraw_depth = 0;
		}

		// Sometimes increase depth...

		if (this.tick % config.animate_delay_multiplier === 0) {
			this.hoverdraw_depth++;
		}

		let moves = this.info_handler.moves_from_click_n(click_n, this.hoverdraw_depth);

		if (Array.isArray(moves) === false || moves.length === 0) {
			return false;
		}

		return this.draw_fantasy_from_moves(moves);
	},

	hoverdraw_single: function(div_index, click_n) {

		this.hoverdraw_div = div_index;

		let moves = this.info_handler.moves_from_click_n(click_n);

		if (Array.isArray(moves) === false || moves.length === 0) {
			return false;
		}

		return this.draw_fantasy_from_moves(moves);
	},

	hoverdraw_final: function(div_index, click_n) {

		this.hoverdraw_div = div_index;

		let moves = this.info_handler.moves_from_click_n(click_n, 999);

		if (Array.isArray(moves) === false || moves.length === 0) {
			return false;
		}

		return this.draw_fantasy_from_moves(moves);
	},

	draw_fantasy_from_moves: function(moves) {

		// We don't assume moves is an array of legal moves, or even an array.
		// This is probably paranoid at this point but meh.

		if (Array.isArray(moves) === false) {
			return false;
		}

		let board = this.tree.node.board;

		for (let move of moves) {
			let illegal_reason = board.illegal(move);
			if (illegal_reason) {
				return false;
			}
			board = board.move(move);
		}

		let move = moves[moves.length - 1];		// Possibly undefined...

		this.draw_fantasy(board, move);
		return true;
	},

	draw_fantasy: function(board, move) {
		this.draw_move_and_active_squares(move, null);
		this.draw_enemies_in_table(board);
		boardctx.clearRect(0, 0, canvas.width, canvas.height);		// Clearing the canvas arrows.
		this.draw_friendlies_in_table(board);
	},

	draw_canvas_arrows: function() {
		boardctx.clearRect(0, 0, canvas.width, canvas.height);
		if (this.book_explorer) {
			this.draw_explorer_arrows();
		} else if (this.lichess_explorer) {
			this.draw_lichess_arrows();
		} else {
			let arrow_spotlight_square = config.click_spotlight ? this.active_square : null;
			let next_move = (config.next_move_arrow && this.tree.node.children.length > 0) ? this.tree.node.children[0].move : null;
			this.info_handler.draw_arrows(this.tree.node, arrow_spotlight_square, next_move);
		}
	},

	draw_explorer_arrows: function() {

		// This is all pretty isolated from everything else. Keep it that way.

		if (!this.book) {
			this.explorer_objects_cache = null;
			this.explorer_cache_node_id = null;
			this.info_handler.draw_explorer_arrows(this.tree.node, [], null);		// Needs to happen, to update the one_click_moves.
			return;
		}

		if (!this.explorer_objects_cache || this.explorer_cache_node_id !== this.tree.node.id) {
			let objects = BookProbe(KeyFromBoard(this.tree.node.board), this.book);
			let total_weight = 0;
			if (Array.isArray(objects)) {
				for (let o of objects) {
					total_weight += o.weight;
				}
			}
			if (total_weight <= 0) {
				total_weight = 1;		// Avoid div by zero.
			}
			let tmp = {};
			for (let o of objects) {
				if (!this.tree.node.board.illegal(o.move)) {
					if (tmp[o.move] === undefined) {
						tmp[o.move] = {move: o.move, weight: o.weight / total_weight};
					}
				}
			}
			this.explorer_cache_node_id = this.tree.node.id;
			this.explorer_objects_cache = Object.values(tmp);
			this.explorer_objects_cache.sort((a, b) => b.weight - a.weight);
		}

		let arrow_spotlight_square = config.click_spotlight ? this.active_square : null;
		this.info_handler.draw_explorer_arrows(this.tree.node, this.explorer_objects_cache, arrow_spotlight_square);
	},

	draw_lichess_arrows: function() {

		// Modified version of the above.

		let ok = true;

		if (this.looker_api !== "lichess_masters" && this.looker_api !== "lichess_plebs") {
			ok = false;
		}

		let entry = this.looker.lookup(this.looker_api, this.tree.node.board);

		if (!entry) {
			ok = false;
		}

		if (!ok) {
			this.explorer_objects_cache = null;
			this.explorer_cache_node_id = null;
			this.info_handler.draw_explorer_arrows(this.tree.node, [], null);		// Needs to happen, to update the one_click_moves.
			return;
		}

		if (!this.explorer_objects_cache || this.explorer_cache_node_id !== this.tree.node.id) {
			let total_weight = 0;
			for (let o of Object.values(entry.moves)) {
				total_weight += o.total;
			}
			if (total_weight <= 0) {
				total_weight = 1;		// Avoid div by zero.
			}
			let tmp = {};
			for (let move of Object.keys(entry.moves)) {
				if (!this.tree.node.board.illegal(move)) {
					if (tmp[move] === undefined) {
						tmp[move] = {move: move, weight: entry.moves[move].total / total_weight};
					}
				}
			}
			this.explorer_cache_node_id = this.tree.node.id;
			this.explorer_objects_cache = Object.values(tmp);
			this.explorer_objects_cache.sort((a, b) => b.weight - a.weight);
		}

		let arrow_spotlight_square = config.click_spotlight ? this.active_square : null;
		this.info_handler.draw_explorer_arrows(this.tree.node, this.explorer_objects_cache, arrow_spotlight_square);
	},

	draw_statusbox: function() {
		if (!this.is_active_context()) {
			return;
		}

		let analysing_other = null;

		if (this.behaviour === "analysis_locked" && this.leela_lock_node && this.leela_lock_node !== this.tree.node) {
			if (!this.leela_lock_node.parent) {
				analysing_other = "root";
			} else {
				analysing_other = "position after " + this.leela_lock_node.token(false, true);
			}
		}

		let loading_message = null;

		for (let loader of this.loaders) {
			if (loader.callback) {				// By our rules, can only exist if the load is still pending...
				if (performance.now() - loader.starttime > 100) {
					loading_message = loader.msg;
					break;
				}
			}
		}

		if (!loading_message && this.engine_busy_elsewhere()) {
			statusbox.innerHTML = `<span class="yellow">Engine is busy in another tab</span>`;
			return;
		}

		this.status_handler.draw_statusbox(
			this.tree.node,
			this.engine,
			analysing_other,
			loading_message,
			this.book ? true : false
		);
	},

	draw_enginebox: function() {
		if (!this.is_active_context()) {
			return;
		}
		if (this.comparison_mode) {
			this.draw_engine_lab();
			return;
		}
		enginebox.innerHTML = SafeStringHTML(this.engine.name || "");
	},

	draw_engine_lab: function() {
		if (this.engine_lab_view) this.engine_lab_view.draw();
	},

	engine_lab_click: function(event) {
		let action = event.target.closest("[data-engine-lab-action]");
		if (!action) return;
		if (action.dataset.engineLabAction === "add") {
			let results = this.engine_manager.get_results(this.active_tab().id);
			let result = results[action.dataset.sessionId] && results[action.dataset.sessionId][0];
			if (result) this.add_engine_analysis(action.dataset.sessionId, result);
		} else if (action.dataset.engineLabAction === "start") {
			let profile = document.getElementById("engine_lab_secondary_profile").value;
			if (profile) this.engine_manager.start_comparison_for_tab(this.active_tab().id, this.engine.filepath, profile);
		} else if (action.dataset.engineLabAction === "stop") {
			this.engine_manager.stop_comparison();
		}
		this.draw_enginebox();
	},

	add_engine_analysis: function(session_id, result) {
		if (!result || !Array.isArray(result.pv) || result.pv.length === 0) return false;
		let illegal_reason = this.tree.node.board.sequence_illegal(result.pv);
		if (illegal_reason) {
			this.err_receive(illegal_reason);
			return false;
		}
		let session = this.engine_manager.get_session(session_id);
		let consensus = this.engine_manager.get_consensus(this.active_tab().id);
		let engine_name = session ? (session.name || session.profileKey || session_id) : session_id;
		let comment = engine_lab.createEngineAnalysisComment(result, engine_name, consensus.agreement.level);
		this.undo_stack.wrap("Add engine analysis", () => {
			this.tree.add_move_sequence(result.pv);
			let lines = (this.tree.node.comment_after || "").split("\n").filter(line => line.indexOf("[%nibbler-engine ") !== 0 && line !== "");
			lines.push(comment);
			this.tree.node.comment_after = lines.join("\n");
			this.tree.tree_version++;
			this.tree.dom_from_scratch();
		});
		return true;
	},

	toggle_comparison_mode: function() {
		this.comparison_mode = !this.comparison_mode;
		this.active_tab().comparison_mode = this.comparison_mode;
		this.draw_enginebox();
	},

	draw_infobox: function() {
		if (!this.is_active_context()) {
			return;
		}
		this.info_handler.draw_infobox(
			this.tree.node,
			this.mouse_point(),
			this.active_square,
			this.tree.node.board.active,
			this.hoverdraw_div,
			this.behaviour === "halt" || config.never_suppress_searchmoves,
			this.looker_api ? this.looker.lookup(this.looker_api, this.tree.node.board) : null);
	},

	// ---------------------------------------------------------------------------------------------------------------------
	// Fundamental engine methods... not to be called directly, except by behave() and handle_search_params_change()...

	set_engine_search: function(node, limit, limit_by_time, searchmoves) {
		// All primary search requests go through here, so that a running engine comparison
		// gets the same search on its other engine.
		this.engine.set_search_desired(node, limit, limit_by_time, searchmoves);
		this.engine_manager.mirror_primary_search(node, limit, limit_by_time, searchmoves);
	},

	__halt: function() {
		this.set_engine_search(null);
	},

	__go: function(node) {
		this.hide_fullbox();
		if (!node || node.destroyed || node.terminal_reason()) {
			this.set_engine_search(null);
			return;
		}

		let limit = this.node_limit();
		let by_time = engineconfig[this.engine.filepath].limit_by_time;

		// In auto/back analysis, node_limit() returns the per-position time budget
		// (config.auto_analysis_time_ms); make sure it is used as a time limit.

		if (this.behaviour === "auto_analysis" || this.behaviour === "back_analysis") {
			let budget = config.auto_analysis_time_ms;
			if (typeof budget === "number" && budget >= 1) {
				by_time = true;
			}
		}

		this.set_engine_search(node, limit, by_time, node.searchmoves);
	},

	// ---------------------------------------------------------------------------------------------------------------------
	// Info receivers...

	receive_bestmove: function(s, relevant_node) {

		let ok;		// Could be used by 2 different parts of the switch (but not at time of writing...)

		switch (this.behaviour) {

		case "self_play":
		case "play_white":
		case "play_black":

			if (relevant_node !== this.tree.node) {
				LogBoth(`(ignored bestmove, relevant_node !== hub.tree.node, this.behaviour was "${this.behaviour}")`);
				this.set_behaviour("halt");
				break;
			}

			let tokens = s.split(" ").filter(z => z !== "");
			ok = this.move(tokens[1]);

			if (!ok) {
				LogBoth(`BAD BESTMOVE (${tokens[1]}) IN POSITION ${this.tree.node.board.fen(true)}`);
				this.set_special_message(`WARNING! Bad bestmove (${tokens[1]}) received!`, "yellow", 10000);
			} else {
				if (this.tree.node.terminal_reason()) {
					this.set_behaviour("halt");
				}
			}

			break;

		case "auto_analysis":
		case "back_analysis":

			if (relevant_node !== this.tree.node) {
				LogBoth(`(ignored bestmove, relevant_node !== hub.tree.node, this.behaviour was "${this.behaviour}")`);
				this.set_behaviour("halt");
			} else {
				this.continue_auto_analysis();
			}

			break;

		case "analysis_free":			// We hit the node limit.

			if (!config.allow_stopped_analysis) {
				this.set_behaviour("halt");
			}
			break;

		case "analysis_locked":

			// We hit the node limit. If the node we're looking at isn't the locked node, don't
			// change behaviour. (It will get changed when we enter the locked node.)

			if (this.tree.node === this.leela_lock_node) {
				this.set_behaviour("halt");
			}
			break;

		}
	},

	receive_misc: function(s) {

		if (s.startsWith("id name ")) {
			this.engine.name = engine_display.name_from_id_line(s);
			this.draw_enginebox();

			// Note that we do need to set the leelaish flag on the engine here (rather than relying on the
			// autodetection in info.js) so that correct options can be sent.

			this.engine.leelaish = false;

			for (let name of config.leelaish_names) {
				if (s.includes(name)) {
					this.engine.leelaish = true;
					break;
				}
			}

			// Our defaults in engineconfig_io.newentry() are appropriate for Leelaish engines.
			// But if this is the first time we see an A/B engine, we must adjust them...

			if (!this.engine.leelaish && !engineconfig[this.engine.filepath].options["MultiPV"]) {
				// This likely indicates the engine is new to the config.
				engineconfig[this.engine.filepath].options["MultiPV"] = 3;				// Will get ack'd when engine_send_all_options() happens
				engineconfig[this.engine.filepath].search_nodes_special = 10000000;
				this.send_ack_node_limit(true);
			}

			// Pass unknown engines to the error handler to be displayed...

			if (!s.includes("Lc0") && !s.includes("Ceres") && !s.includes("Stockfish")) {
				this.info_handler.err_receive(s.slice("id name".length).trim());
			}

			return;
		}

		if (s.startsWith("uciok")) {

			// Until we receive uciok and readyok, set_behaviour() does nothing and set_search_desired() ignores calls, so "go" cannot have been sent.

			this.engine_send_all_options();
			this.engine.send("isready");
			return;
		}

		if (s.startsWith("readyok")) {

			// Until we receive uciok and readyok, set_behaviour() does nothing and set_search_desired() ignores calls, so "go" cannot have been sent.

			this.set_behaviour("halt");					// Likely redundant (should be "halt" anyway), but ensures the hub is in a sane state.
			this.engine.send_ucinewgame();				// Relies on the engine not running.
			return;
		}

		// Misc messages. Treat ones that aren't valid UCI as errors to be passed along...

		if (!s.startsWith("id") &&
			!s.startsWith("option") &&
			!s.startsWith("bestmove") &&				// These messages shouldn't reach this function
			!s.startsWith("info")						// These messages shouldn't reach this function
		) {
			this.info_handler.err_receive(s);
		}
	},

	err_receive: function(s) {

		// Some highlights... this is obviously super-fragile based on the precise strings Leela sends.

		if (s.startsWith("Found configuration file: ")) {
			this.info_handler.err_receive(HighlightString(s, "Found configuration file: ", "blue"));
			return;
		}

		if (s.startsWith("Loading Syzygy tablebases from ")) {
			this.info_handler.err_receive(HighlightString(s, "Loading Syzygy tablebases from ", "blue"));
			return;
		}

		if (s.startsWith("Loading weights file from: ")) {
			this.info_handler.err_receive(HighlightString(s, "Loading weights file from: ", "blue"));
			return;
		}

		if (s.startsWith("Found pb network file: ")) {
			this.info_handler.err_receive(HighlightString(s, "Found pb network file: ", "blue"));
			return;
		}

		this.info_handler.err_receive(s);
	},

	// ---------------------------------------------------------------------------------------------------------------------
	// Node limits...

	node_limit: function() {

		// Given the current state of the config, what is the node limit?
		// Note that this value is used as a time limit instead, if engineconfig[this.engine.filepath].limit_by_time is set.

		let cfg_value;

		switch (this.behaviour) {

		case "play_white":
		case "play_black":
		case "self_play":

			cfg_value = engineconfig[this.engine.filepath].search_nodes_special;
			break;

		case "auto_analysis":
		case "back_analysis":

			// Auto/back analysis uses a fixed time budget per position so that the
			// line always advances, even when search_nodes_special is huge (e.g. 1e9).

			cfg_value = config.auto_analysis_time_ms;

			if (typeof cfg_value !== "number" || cfg_value < 1) {
				cfg_value = engineconfig[this.engine.filepath].search_nodes_special;	// Fallback to the old behaviour.
			}
			break;

		default:

			cfg_value = engineconfig[this.engine.filepath].search_nodes;
			break;

		}

		// Should match the system in engine.js.

		if (typeof cfg_value === "number" && cfg_value >= 1) {
			return cfg_value;
		} else {
			return null;
		}
	},

	adjust_node_limit: function(direction, special_flag) {

		let cfg_value = special_flag ? engineconfig[this.engine.filepath].search_nodes_special : engineconfig[this.engine.filepath].search_nodes;

		if (direction > 0) {

			if (typeof cfg_value !== "number" || cfg_value <= 0) {				// Already unlimited
				this.set_node_limit_generic(null, special_flag);
				return;
			}

			for (let i = 0; i < limit_options.length; i++) {
				if (limit_options[i] > cfg_value) {
					this.set_node_limit_generic(limit_options[i], special_flag);
					return;
				}
			}

			this.set_node_limit_generic(null, special_flag);

		} else {

			if (typeof cfg_value !== "number" || cfg_value <= 0) {				// Unlimited; reduce to highest finite option
				this.set_node_limit_generic(limit_options[limit_options.length - 1], special_flag);
				return;
			}

			for (let i = limit_options.length - 1; i >= 0; i--) {
				if (limit_options[i] < cfg_value) {
					this.set_node_limit_generic(limit_options[i], special_flag);
					return;
				}
			}

			this.set_node_limit_generic(1, special_flag);
		}
	},

	set_node_limit: function(val) {
		this.set_node_limit_generic(val, false);
	},

	set_node_limit_special: function(val) {
		this.set_node_limit_generic(val, true);
	},

	set_node_limit_generic: function(val, special_flag) {

		if (typeof val !== "number" || val <= 0) {
			val = null;
		}

		let msg_start;
		let by_time = engineconfig[this.engine.filepath].limit_by_time;

		if (by_time) {
			msg_start = special_flag ? "Special time limit" : "Time limit";
		} else {
			msg_start = special_flag ? "Special node limit" : "Node limit";
		}

		if (val) {
			this.set_special_message(`${msg_start} now ${CommaNum(val)} ${by_time ? "ms" : ""}`, "blue");
		} else {
			this.set_special_message(`${msg_start} removed!`, "blue");
		}

		if (special_flag) {
			engineconfig[this.engine.filepath].search_nodes_special = val;
		} else {
			engineconfig[this.engine.filepath].search_nodes = val;
		}

		this.send_ack_node_limit(special_flag);

		this.handle_search_params_change();
	},

	send_ack_node_limit: function(special_flag) {

		let ack_type = special_flag ? "ack_special_node_limit" : "ack_node_limit";
		let val;

		if (special_flag) {
			val = engineconfig[this.engine.filepath].search_nodes_special;
		} else {
			val = engineconfig[this.engine.filepath].search_nodes;
		}

		if (val) {
			ipcRenderer.send(ack_type, CommaNum(val));
		} else {
			ipcRenderer.send(ack_type, "Unlimited");
		}
	},

	toggle_limit_by_time: function() {
		engineconfig[this.engine.filepath].limit_by_time = !engineconfig[this.engine.filepath].limit_by_time;
		this.send_ack_limit_by_time();
		this.handle_search_params_change();
	},

	send_ack_limit_by_time: function() {
		ipcRenderer.send("ack_limit_by_time", engineconfig[this.engine.filepath].limit_by_time);
	},

	// ---------------------------------------------------------------------------------------------------------------------
	// Engine-related acks...

	send_ack_engine: function() {
		this.engine.send_ack_engine();
	},

	send_ack_setoption: function(name) {
		this.engine.send_ack_setoption(name);
	},

	show_uci_engine_settings: function(errors) {
		if (!this.engine || !this.engine.filepath) {
			fullbox_content.innerHTML = `<span class="yellow">No current engine is selected.</span>`;
			this.show_fullbox();
			return;
		}
		if (!this.engine.ever_received_uciok || Object.keys(this.engine.known_options).length === 0) {
			fullbox_content.innerHTML = `<span class="yellow">UCI options are not available for the current engine yet.</span>`;
			this.show_fullbox();
			return;
		}

		this.uci_option_rows = this.engine.get_uci_option_rows();
		fullbox_content.innerHTML = uci_options_dialog.renderDialog(this.engine, this.uci_option_rows, errors);
		this.show_fullbox();
	},

	press_uci_button_option: function(name) {
		if (!this.engine || !this.engine.filepath) {
			this.set_special_message("No current engine is selected", "blue");
			return;
		}
		let sent = this.engine.pressbutton(name);
		this.set_special_message(sent, "blue");
	},

	apply_uci_engine_settings: function() {
		let rows = Array.isArray(this.uci_option_rows) ? this.uci_option_rows : [];
		let values = uci_options_dialog.collectDraftValues(fullbox_content);
		let byKey = Object.create(null);
		let errors = Object.create(null);
		let valid = Object.create(null);

		for (let row of rows) {
			byKey[row.key] = row;
			if (!row.editable || !row.persistent || values[row.key] === undefined) continue;
			let [value, err] = uci_options_dialog.validateDraftValue(row, values[row.key]);
			if (err) {
				errors[row.key] = err;
			} else {
				valid[row.key] = value;
			}
		}

		if (Object.keys(errors).length > 0) {
			this.show_uci_engine_settings(errors);
			return;
		}

		for (let key of Object.keys(valid)) {
			let row = byKey[key];
			if (row && valid[key].toString() !== row.currentValue) {
				this.set_uci_option(row.name, valid[key], true);
			}
		}
		this.hide_fullbox();
	},

	// ---------------------------------------------------------------------------------------------------------------------
	// Misc engine methods...

	soft_engine_reset: function() {
		this.set_behaviour("halt");					// Will cause "stop" to be sent.
		this.engine.send_ucinewgame();				// Must happen after "stop" is sent.
	},

	forget_analysis: function() {
		CleanTree(this.tree.root);
		this.tree.node.table.autopopulate(this.tree.node);
		this.set_behaviour("halt");					// Will cause "stop" to be sent.
		this.engine.send_ucinewgame();				// Must happen after "stop" is sent.
		this.engine.suppress_cycle_info = this.info_handler.engine_cycle;		// Ignore further info updates from this cycle.
	},

	// ---------------------------------------------------------------------------------------------------------------------
	// UCI options...

	set_uci_option: function(name, val, save_to_cfg = false, blue_text = true) {

		// Note that all early returns from this function need to send an ack
		// of the prevailing value to fix checkmarks in the main process.

		if (!this.engine.ever_received_uciok) {									// Correct leelaish flag not yet known.
			alert(messages.too_soon_to_set_options);
			this.engine.send_ack_setoption(name);
			return;
		}

		if (this.engine.leelaish && name.toLowerCase() === "multipv") {
			this.set_special_message("MultiPV should be 500 for this engine", "blue");
			this.engine.send_ack_setoption(name);
			return;
		}

		if (!this.engine.known(name)) {
			this.set_special_message(`${name} not known by this engine`, "blue");
			this.engine.send_ack_setoption(name);
			return;
		}

		if (save_to_cfg) {
			if (val === null || val === undefined) {
				delete engineconfig[this.engine.filepath].options[name];
			} else {
				engineconfig[this.engine.filepath].options[name] = val;
			}
		}

		if (val === null || val === undefined) {
			val = "";
		}

		this.set_behaviour("halt");
		let sent = this.engine.setoption(name, val);							// Will ack the new value.
		if (blue_text) {
			this.set_special_message(sent, "blue");
		}
	},

	set_uci_option_permanent: function(name, val) {
		this.set_uci_option(name, val, true);
	},

	set_uci_option_permanent_and_cleartree: function(name, val) {
		this.set_uci_option(name, val, true);
		if (this.engine.leelaish) {
			this.set_uci_option("ClearTree", true, false, false);
		}
	},

	disable_syzygy: function() {
		delete engineconfig[this.engine.filepath].options["SyzygyPath"];
		this.restart_engine();		// Causes the correct ack to be sent.
	},

	auto_weights: function() {
		delete engineconfig[this.engine.filepath].options["EvalFile"];
		delete engineconfig[this.engine.filepath].options["WeightsFile"];
		this.restart_engine();		// Causes the correct acks to be sent.
	},

	// ---------------------------------------------------------------------------------------------------------------------
	// Engine startup...

	reload_engineconfig: function() {
		[load_err2, engineconfig] = engineconfig_io.load();
		if (load_err2) {
			alert(load_err2);
		}
		this.restart_engine();
	},

	switch_engine: function(filename) {
		this.set_behaviour("halt");
		if (this.engine_start(filename)) {
			config.path = filename;
		} else {
			alert("Failed to start this engine.");
			this.engine.send_ack_engine();
		}
	},

	restart_engine: function() {
		this.engine.warn_send_fail = false;			// Don't want "send failed" warnings from old engine any more.
		this.set_behaviour("halt");
		if (this.engine_start(config.path)) {
			// pass
		} else {
			alert("Failed to restart the engine.");
			this.engine.send_ack_engine();
		}
	},

	engine_start: function(filepath, blue_fail) {

		if (!filepath || typeof filepath !== "string" || fs.existsSync(filepath) === false) {
			if (blue_fail && !load_err1 && !load_err2) {
				this.err_receive(`<span class="blue">${messages.engine_not_present}</span>`);
				this.err_receive("");
			}
			return false;
		}

		let args = engineconfig[filepath] ? engineconfig[filepath].args : [];

		let new_engine = NewEngine(this);
		let success = new_engine.setup(filepath, args, this);

		if (success === false) {
			if (blue_fail && !load_err1 && !load_err2) {
				this.err_receive(`<span class="blue">${messages.engine_failed_to_start}</span>`);
				this.err_receive("");
			}
			return false;
		}

		this.engine.shutdown();
		this.engine = new_engine;					// Don't reuse engine objects, not even the dummy object. There are sync issues due to fake "go"s.
		this.engine_manager.attach_primary(new_engine, filepath);
		this.draw_enginebox();

		if (!engineconfig[this.engine.filepath]) {
			engineconfig[this.engine.filepath] = engineconfig_io.newentry();
			console.log(`Creating new entry in engineconfig for ${filepath}`);
		}

		this.engine.send("uci");

		this.send_ack_node_limit(false);			// Ack the node limits that are set in engineconfig[this.engine.filepath]
		this.send_ack_node_limit(true);

		this.send_ack_limit_by_time();				// Also ack the limit_by_time boolean for that menu item.

		this.info_handler.reset_engine_info();
		this.info_handler.must_draw_infobox();		// To display the new stderr log that appears.

		return true;
	},

	engine_send_all_options: function(engine = this.engine) {	// The engine should never have been given a "go" before this.

		// Also used by the engine comparison for its second engine.

		// Options that are sent regardless of whether the engine seems to know about them...

		let forced_engine_options = engine.leelaish ? forced_lc0_options : forced_ab_options;
		for (let [key, value] of Object.entries(forced_engine_options)) {
			engine.setoption(key, value);
		}

		// Standard options... only sent if the engine has said it knows them...

		let standard_engine_options = engine.leelaish ? standard_lc0_options : standard_ab_options;
		for (let [key, value] of Object.entries(standard_engine_options)) {
			if (engine.known(key)) {
				engine.setoption(key, value);
			}
		}

		// Now send user-selected options. Thus, the user can override anything above.

		let entry = engineconfig[engine.filepath];
		let options = entry && entry.options ? entry.options : {};
		let keys = Object.keys(options);

		keys.sort((a, b) => {		// "It is recommended to set Hash after setting Threads."
			if (a.toLowerCase() === "hash" && b.toLowerCase() !== "hash") return 1;
			if (a.toLowerCase() !== "hash" && b.toLowerCase() === "hash") return -1;
			return 0;
		});

		for (let key of keys) {
			engine.setoption(key, options[key]);
		}
	},

		// ---------------------------------------------------------------------------------------------------------------------
		// Tree manipulation methods...

		// Undo/Redo -- delegates to undo_stack

		undo: function() {
			if (this.undo_stack) {
				this.undo_stack.undo();
			}
		},

		redo: function() {
			if (this.undo_stack) {
				this.undo_stack.redo();
			}
		},

		can_undo: function() {
			return this.undo_stack ? this.undo_stack.can_undo() : false;
		},

		can_redo: function() {
			return this.undo_stack ? this.undo_stack.can_redo() : false;
		},

		move: function(s) {							// It is safe to call this with illegal moves.

		if (typeof s !== "string") {
			console.log(`hub.move(${s}) - bad argument`);
			return false;
		}

		let board = this.tree.node.board;
		let source = Point(s.slice(0, 2));

		if (!source) {
			console.log(`hub.move(${s}) - invalid source`);
			return false;
		}

		// First deal with old-school castling in Standard Chess...

		s = board.c960_castling_converter(s);

		// If a promotion character is required and not present, show the promotion chooser and return
		// without committing to anything.

		if (s.length === 4) {
			if ((board.piece(source) === "P" && source.y === 1) || (board.piece(source) === "p" && source.y === 6)) {
				let illegal_reason = board.illegal(s + "q");
				if (illegal_reason) {
					console.log(`hub.move(${s}) - ${illegal_reason}`);
				} else {
					this.show_promotiontable(s);
				}
				return false;
			}
		}

			// The promised legality check...

			let illegal_reason = board.illegal(s);
			if (illegal_reason) {
				console.log(`hub.move(${s}) - ${illegal_reason}`);
				return false;
			}

			// Move is legal -- wrap in undo record.
			// Get nice description for undo description.

			let nice_move = board.nice_string(s);
			let move_desc = "Play " + nice_move;

			let result = this.undo_stack.wrap(move_desc, () => {
				this.tree.make_move(s);
				this.position_changed();
			});

			return true;
		},

	random_move: function() {
		let legals = this.tree.node.board.movegen();
		if (legals.length > 0) {
			this.move(RandChoice(legals));
		}
	},

	play_info_index: function(n) {

		let line_starts = this.info_handler.info_clickers.filter(o => o.is_start);

		if (n < line_starts.length) {

			let move = line_starts[n].move;

			let table_move = this.tree.node.table.moveinfo[move];

			if (table_move && table_move.__touched) {		// Allow this to happen if the move is touched
				this.move(move);
			} else if (this.looker_api) {					// Allow this to happen if the move is in the selected API database
				let db_entry = this.looker.lookup(this.looker_api, this.tree.node.board);
				if (db_entry && db_entry.moves[move]) {
					this.move(move);
				}
			}
		}
	},

	// Note that the various tree.methods() return whether or not the current node changed.

	return_to_lock: function() {
		if (this.behaviour === "analysis_locked") {
			if (this.tree.set_node(this.leela_lock_node)) {		// Fool-proof against null / destroyed.
				this.position_changed(false, true);
			}
		}
	},

	prev: function() {
		if (this.tree.prev()) {
			this.position_changed(false, true);
		}
	},

	next: function() {
		if (this.tree.next()) {
			this.position_changed(false, true);
		}
	},

	goto_root: function() {
		if (this.tree.goto_root()) {
			this.position_changed(false, true);
		}
	},

	goto_end: function() {
		if (this.tree.goto_end()) {
			this.position_changed(false, true);
		}
	},

	previous_sibling: function() {
		if (this.tree.previous_sibling()) {
			this.position_changed(false, true);
		}
	},

	next_sibling: function() {
		if (this.tree.next_sibling()) {
			this.position_changed(false, true);
		}
	},

	return_to_main_line: function() {
		if (this.tree.return_to_main_line()) {
			this.position_changed(false, true);
		}
	},

		delete_node: function() {
			if (this.tree.node && this.tree.node.parent) {		// Can only delete non-root
				let desc = "Delete " + (this.tree.node.move ? this.tree.node.nice_move() : "node");
				this.undo_stack.wrap(desc, () => {
					if (this.tree.delete_node()) {
						this.position_changed(false, true);
					}
				});
			}
		},

		promote_to_main_line: function() {
			if (this.tree.node && !this.tree.node.is_main_line()) {
				let desc = "Promote to main line";
				this.undo_stack.wrap(desc, () => {
					this.tree.promote_to_main_line();
				});
			}
		},

		promote: function() {
			if (this.tree.node && this.tree.node.parent && this.tree.node.parent.children[0] !== this.tree.node) {
				let desc = "Promote variation";
				this.undo_stack.wrap(desc, () => {
					this.tree.promote();
				});
			}
		},

		delete_other_lines: function() {
			if (this.tree.node && build_movelist_context_menu_state(this.tree.node).can_delete_other_lines) {
				let desc = "Delete other lines";
				this.undo_stack.wrap(desc, () => {
					this.tree.delete_other_lines();
				});
			}
		},

		delete_children: function() {
			if (this.tree.node && this.tree.node.children.length > 0) {
				let desc = "Delete children";
				this.undo_stack.wrap(desc, () => {
					this.tree.delete_children();
				});
			}
		},

		delete_siblings: function() {
			if (this.tree.node && this.tree.node.parent && this.tree.node.parent.children.length > 1) {
				let desc = "Delete siblings";
				this.undo_stack.wrap(desc, () => {
					this.tree.delete_siblings();
				});
			}
		},

		set_node_annotation: function(annotation) {
			if (!this.tree.node || !this.tree.node.parent) {
				return;
			}

			let normalized = PgnAnnotationSuffix(annotation);
			let desc = normalized ? "Set annotation " + normalized : "Clear annotation";

			this.undo_stack.wrap(desc, () => {
				this.tree.node.annotation = normalized || null;
				this.tree.tree_version++;
				this.tree.dom_from_scratch();
			});
		},

		set_node_position_annotation: function(nag) {
			if (!this.tree.node || !this.tree.node.parent) {
				return;
			}
			if (nag !== null && !position_annotations.find(nag)) {
				return;
			}
			let normalized = nag;
			if (this.tree.node.position_nag === normalized) {
				return;
			}
			let desc = normalized ? "Set position evaluation $" + normalized : "Clear position evaluation";
			this.undo_stack.wrap(desc, () => {
				this.tree.node.position_nag = normalized;
				this.tree.tree_version++;
				this.tree.dom_from_scratch();
			});
		},

		edit_node_comment: function() {
			if (!this.tree.node || !this.tree.node.parent) {
				return;
			}
			this.show_comment_editor();
		},

		apply_comment_edit: function() {
			if (!this.fullbox_comment_node || this.fullbox_comment_node.destroyed) {
				return;
			}

			let textarea = document.getElementById("comment_item_input");
			if (!textarea) {
				return;
			}

			let node = this.fullbox_comment_node;
			let value = textarea.value.trim();

			this.undo_stack.wrap("Edit comment", () => {
				node.comment_after = value;
				this.tree.tree_version++;
				this.tree.dom_from_scratch();
			});

			this.fullbox_comment_node = null;
			this.hide_fullbox();
		},

		show_comment_editor: function() {
			if (!this.tree.node || !this.tree.node.parent) {
				return;
			}

			this.fullbox_comment_node = this.tree.node;

			let current = this.tree.node.comment_after || "";
			let lines = [];
			lines.push(`<div class="infoline">Editing: <span class="green">comment for ${SafeStringHTML(this.tree.node.nice_move())}</span></div>`);
			lines.push(`<textarea id="comment_item_input" placeholder="Enter the comment here" rows="6"></textarea>`);
			lines.push(`<div class="infoline"><span id="comment_item_save" class="blue">Save</span> | <span id="comment_item_cancel" class="red">Cancel</span></div>`);
			lines.push(`<div id="comment_item_error" class="infoline">&nbsp;</div>`);

			fullbox_content.innerHTML = lines.join("");
			this.show_fullbox();

			let textarea = document.getElementById("comment_item_input");
			if (textarea) {
				textarea.value = current;
				textarea.focus();
				textarea.select();
			}
		},

		clear_node_comments: function() {
			if (!this.tree.node || !this.tree.node.parent) {
				return;
			}

			this.undo_stack.wrap("Clear comment", () => {
				this.tree.node.comment_before = "";
				this.tree.node.comment_after = "";
				this.tree.node.user_arrows = [];
				this.tree.node.user_highlights = [];
				this.tree.tree_version++;
				this.tree.dom_from_scratch();
			});
		},

	show_movelist_context_menu: function(event) {

		event.preventDefault();

		let clicked_node = this.tree.node_from_click(event);

		// If the right-click didn't land on a move span (e.g. on a variation
		// bracket or a gap), don't open the menu at all: opening it for the
		// current node would show delete/promote actions for the wrong node.

		if (!clicked_node) {
			return;
		}

		if (this.tree.set_node(clicked_node)) {
			this.position_changed(false, true);
		}

		ipcRenderer.send("show_movelist_context_menu", build_movelist_context_menu_state(this.tree.node));
	},

	// ---------------------------------------------------------------------------------------------------------------------

	new_game: function() {
		this.load_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
	},

	new_960: function(n) {
		if (n === undefined) {
			n = RandInt(0, 960);
		}
		this.load_fen(c960_fen(n), true);
	},

	// ---------------------------------------------------------------------------------------------------------------------

	pgn_to_clipboard: function() {
		PGNToClipboard(this.tree.node);
	},

	save: function(filename) {
		SavePGN(filename, this.tree.node);
	},

	// ---------------------------------------------------------------------------------------------------------------------
	// Loading PGN...

	open: function(filename) {

		if (filename === __dirname || filename === ".") {		// Can happen when extra args are passed to main process. Silently return.
			return;
		}
		if (fs.existsSync(filename) === false) {				// Can happen when extra args are passed to main process. Silently return.
			return;
		}
		if (!config.ignore_filesize_limits && FileExceedsGigabyte(filename, 2)) {
			alert(messages.file_too_big);
			return;
		}

		for (let loader of this.loaders) {
			if (loader.type === "pgn") {
				loader.shutdown();
			}
		}

		console.log(`Loading PGN: ${filename}`);

		let loader = NewFastPGNLoader(filename, (err, pgndata) => {
			if (!err) {
				pgndata.source = path.basename(filename);
				this.handle_loaded_pgndata(pgndata, false);
			} else {
				console.log(err);
			}
		});

		this.loaders.push(loader);
	},

	handle_loaded_pgndata: function(pgndata, merge_into_current = false) {
		if (!pgndata || pgndata.count() === 0) {
			alert("No data found.");
			return;
		}
		if (pgndata.count() === 1) {
			let success = this.load_pgn_object(pgndata.getrecord(0), merge_into_current);
			if (success) {
				this.pgndata = pgndata;
				this.pgn_choices_start = 0;
				this.pgndata_merge_into_current = merge_into_current;
				this.refresh_active_tab_title();
			}
		} else {
			this.pgndata = pgndata;
			this.pgn_choices_start = 0;
			this.pgndata_merge_into_current = merge_into_current;
			this.refresh_active_tab_title();
			this.show_pgn_chooser();
		}
	},

	find_node_by_board: function(board, start_node = this.tree.root) {
		if (!board || !start_node) {
			return null;
		}
		if (start_node.board.compare(board)) {
			return start_node;
		}
		for (let child of start_node.children) {
			let hit = this.find_node_by_board(board, child);
			if (hit) {
				return hit;
			}
		}
		return null;
	},

	merge_pgn_tree_into_node: function(target_node, imported_node) {
		let main_line_end = target_node;

		for (let imported_child of imported_node.children) {
			let target_child = target_node.make_move(imported_child.move);
			let child_end = this.merge_pgn_tree_into_node(target_child, imported_child);
			if (imported_node.children[0] === imported_child) {
				main_line_end = child_end;
			}
		}

		return main_line_end;
	},

	load_pgn_object: function(o, merge_into_current = false) {				// Returns true or false - whether this actually succeeded.

		let imported_root;

		try {
			imported_root = LoadPGNRecord(o);
		} catch (err) {
			alert(err);
			return false;
		}

		if (!merge_into_current) {
			this.active_tab().session_source = null;
			this.tree.replace_tree(imported_root);
			this.position_changed(true, true);
			this.refresh_active_tab_title();
			return true;
		}

		let anchor_node = this.find_node_by_board(imported_root.board);
		if (!anchor_node) {
			DestroyTree(imported_root);
			alert("Could not merge PGN into current tree: start position not found.");
			return false;
		}

		let end_node = this.merge_pgn_tree_into_node(anchor_node, imported_root);
		DestroyTree(imported_root);
		this.tree.node = end_node;
		this.tree.tree_version++;
		this.tree.dom_from_scratch();
		this.position_changed(false, true);
		this.refresh_active_tab_title();

		return true;
	},

	// ---------------------------------------------------------------------------------------------------------------------
	// Books...

	unload_book: function() {
		this.book = null;
		for (let loader of this.loaders) {
			if (loader.type === "book") {
				loader.shutdown();
			}
		}
		this.send_ack_book();
	},

	load_polyglot_book: function(filename) {

		if (!config.ignore_filesize_limits && FileExceedsGigabyte(filename, 2)) {
			alert(messages.file_too_big);
			this.send_ack_book();
			return;
		}

		this.book = null;
		this.send_ack_book();

		for (let loader of this.loaders) {
			if (loader.type === "book") {
				loader.shutdown();
			}
		}

		console.log(`Loading Polyglot book: ${filename}`);

		let loader = NewPolyglotBookLoader(filename, (err, data) => {
			if (!err) {
				if (BookSortedTest(data)) {
					this.book = data;
					this.explorer_objects_cache = null;
					this.send_ack_book();
					this.set_special_message(`Finished loading book (moves: ${Math.floor(data.length / 16)})`, "green");
				} else {
					alert(messages.bad_bin_book);
				}
			} else {
				console.log(err);
			}
		});

		this.loaders.push(loader);
	},

	load_pgn_book: function(filename) {

		if (!config.ignore_filesize_limits && FileExceedsGigabyte(filename, 0.02)) {
			alert(messages.pgn_book_too_big);
			this.send_ack_book();
			return;
		}

		this.book = null;
		this.send_ack_book();

		for (let loader of this.loaders) {
			if (loader.type === "book") {
				loader.shutdown();
			}
		}

		console.log(`Loading PGN book: ${filename}`);

		let loader = NewPGNBookLoader(filename, (err, data) => {
			if (!err) {
				this.book = data;
				this.explorer_objects_cache = null;
				this.send_ack_book();
				this.set_special_message(`Finished loading book (moves: ${data.length})`, "green");
			} else {
				console.log(err);
			}
		});

		this.loaders.push(loader);
	},

	send_ack_book: function() {
		let msg = false;
		if (this.book) {
			msg = this.book instanceof Buffer ? "polyglot" : "pgn";
		}
		ipcRenderer.send("ack_book", msg);
	},

	// ---------------------------------------------------------------------------------------------------------------------
	// Loading from clipboard or fenbox...

	load_fen_or_pgn_from_string: function(s) {
		if (typeof s !== "string") return;
		s = s.trim();
		try {
			LoadFEN(s);			// Used as a test. Throws on any error.
			this.load_fen(s);
		} catch (err) {
			this.load_pgn_from_string(s);
		}
	},

	paste_game: function(s) {

		// Ctrl+V / Paste button / menu: put the clipboard game (PGN or FEN) into the notation.
		// If the current tab already has moves, the game goes into a new tab so nothing is lost.

		if (typeof s !== "string" || s.trim() === "") {
			return;
		}

		s = s.trim();

		let load = () => {
			try {
				LoadFEN(s);			// Used as a test. Throws on any error.
				this.load_fen(s);
			} catch (err) {
				this.load_pgn_from_string(s, false);
			}
		};

		if (this.tree.root.children.length === 0) {
			load();
			return;
		}

		let tab = this.new_tab();

		let load_when_switched = (tries) => {
			if (this.active_tab().id === tab.id && !this.tab_switch_in_progress) {
				load();
			} else if (tries > 0) {
				setTimeout(() => load_when_switched(tries - 1), 20);
			}
		};

		load_when_switched(250);
	},

	paste_from_menu: function() {

		// Ctrl+V and Edit > Paste: paste text if a text field has focus, otherwise paste a game.

		let ae = document.activeElement;
		if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) {
			ipcRenderer.send("native_paste");
		} else {
			read_clipboard_text().then(s => this.paste_game(s));
		}
	},

	load_pgn_from_string: function(s, merge_into_current = true) {

		if (typeof s !== "string") {
			return;
		}

		let buf = Buffer.from(s);
		console.log(`Loading PGN from string...`);

		for (let loader of this.loaders) {
			if (loader.type === "pgn") {
				loader.shutdown();
			}
		}

		let loader = NewFastPGNLoader(buf, (err, pgndata) => {
			if (!err) {
				pgndata.source = "From clipboard";
				this.handle_loaded_pgndata(pgndata, merge_into_current);
			} else {
				console.log(err);
			}
		});

		this.loaders.push(loader);
	},

	load_fen: function(s, abnormal) {

		let board;

		try {

			board = LoadFEN(s);

			// If the FEN loader thought it looked like normal chess, we must
			// override it if the caller passed the abnormal flag. Note that
			// it is never permissible to go in the opposite direction... if
			// the loader thought it was abnormal, we never say it's normal.

			if (abnormal) {
				board.normalchess = false;
			}

		} catch (err) {
			alert(err);
			return;
		}

		this.tree.replace_tree(NewRoot(board));
		this.position_changed(true, true);
		this.refresh_active_tab_title();
	},

	load_from_fenbox: function(s) {

		s = s.trim();

		if (s === this.tree.node.board.fen(true)) {
			return;
		}

		let abnormal = false;

		// Allow loading a Chess 960 position by giving its ID:

		if (s.length <= 3) {
			let n = parseInt(s, 10);
			if (Number.isNaN(n) === false && n < 960) {
				s = c960_fen(n);
				abnormal = true;
			}
		}

		// Allow loading a fruity start position by giving the pieces:

		if (s.length === 8) {
			let ok = true;
			for (let c of s) {
				if (["K", "k", "Q", "q", "R", "r", "B", "b", "N", "n"].includes(c) === false) {
					ok = false;
					break;
				}
			}
			if (ok) {
				s = `${s.toLowerCase()}/pppppppp/8/8/8/8/PPPPPPPP/${s.toUpperCase()} w KQkq - 0 1`;
				abnormal = true;
			}
		}

		this.load_fen(s, abnormal);
	},

	// ---------------------------------------------------------------------------------------------------------------------
	// Mouse and mouseclicks...

	set_active_square: function(new_point) {

		// We do this immediately so it's snappy and responsive, rather than waiting for the next draw cycle. But we don't
		// want to actually call draw() here since whatever called this may well end up triggering a draw anyway.

		let old_point = this.active_square;

		if (old_point) {
			let td = document.getElementById("underlay_" + old_point.s);
			td.style["background-color"] = "transparent";
			this.dirty_squares[old_point.x][old_point.y] = 0;		// Lame. This is the constant for EMPTY.
		}

		if (new_point) {
			let td = document.getElementById("underlay_" + new_point.s);
			td.style["background-color"] = config.active_square;
			this.dirty_squares[new_point.x][new_point.y] = 2;		// Lame. This is the constant for ACTIVE.
		}

		this.active_square = new_point ? new_point : null;
	},

	boardfriends_click: function(event) {

		let s = EventPathString(event, "overlay_");
		let p = Point(s);

		if (!p) {
			return;
		}

		this.hide_promotiontable();		// Just in case it's up.

		let ocm = this.info_handler.one_click_moves[p.x][p.y];
		let board = this.tree.node.board;

		if (!this.active_square && ocm && board.colour(p) !== board.active) {		// Note that we test colour difference
			this.set_active_square(null);											// to disallow castling moves from OCM
			this.move(ocm);															// since the dest is the rook (which
			return;																	// the user might want to click on.)
		}

		if (this.active_square) {
			let move = this.active_square.s + p.s;		// e.g. "e2e4" - note promotion char is handled by hub.move()
			this.set_active_square(null);
			let ok = this.move(move);
			if (!ok && config.click_spotlight) {		// No need to worry about spotlight arrows if the move actually happened
				this.draw_canvas_arrows();
			}
			return;
		}

		// So there is no active_square... create one?

		if (board.active === "w" && board.is_white(p)) {
			this.set_active_square(p);
			if (config.click_spotlight) {
				this.draw_canvas_arrows();
			}
		}
		if (board.active === "b" && board.is_black(p)) {
			this.set_active_square(p);
			if (config.click_spotlight) {
				this.draw_canvas_arrows();
			}
		}
	},

	infobox_click: function(event) {

		if (this.info_handler.clickers_are_valid_for_node(this.tree.node) === false) {
			return;
		}

		let n = EventPathN(event, "infobox_");
		let moves = this.info_handler.moves_from_click_n(n);

		if (!moves || moves.length === 0) {				// We do assume length > 0 below.
			this.maybe_searchmove_click(event);
			return;
		}

		// So it appears to be a real click in the infobox.........................................
		// I doubt moves can be an illegal sequence now but this check is not too expensive here...

		let illegal_reason = this.tree.node.board.sequence_illegal(moves);
		if (illegal_reason) {
			console.log("infobox_click(): " + illegal_reason);
			return;
		}

		switch (config.pv_click_event) {

		case 0:
			return;

		case 1:
			this.tree.make_move_sequence(moves);
			this.position_changed(false, true);
			return;

		case 2:
			this.tree.add_move_sequence(moves);
			return;
		}
	},

	maybe_searchmove_click: function(event) {

		let sm = EventPathString(event, "searchmove_");
		if (typeof sm !== "string" || (sm.length < 4 || sm.length > 5)) {
			return;
		}

		if (this.tree.node.searchmoves.includes(sm)) {
			this.tree.node.searchmoves = this.tree.node.searchmoves.filter(move => move !== sm);
		} else {
			this.tree.node.searchmoves.push(sm);
		}

		this.tree.node.searchmoves.sort();
		this.handle_search_params_change();
	},

	movelist_click: function(event) {
		if (event.button === 2) {
			this.show_movelist_context_menu(event);
			return;
		}

		if (this.tree.handle_click(event)) {
			this.position_changed(false, true);
		}
	},

	winrate_click: function(event) {

		let node = this.grapher.node_from_click(this.tree.node, event);

		if (!node) {
			return;
		}

		if (this.tree.set_node(node)) {
			this.position_changed(false, true);
		}
	},

	statusbox_click: function(event) {

		if (EventPathString(event, "gobutton")) {
			this.set_behaviour("analysis_free");
			return;
		}

		if (EventPathString(event, "haltbutton")) {
			this.set_behaviour("halt");
			return;
		}

		if (EventPathString(event, "lock_return")) {
			this.return_to_lock();
			return;
		}

		if (EventPathString(event, "loadabort")) {
			for (let loader of this.loaders) {
				loader.shutdown();
			}
			return;
		}
	},

	toolbar_click: function(event) {

		switch (EventPathString(event, "toolbar_")) {
		case "go":
			this.set_behaviour("analysis_free");
			return;
		case "halt":
			this.set_behaviour("halt");
			return;
		case "lock":
			this.set_behaviour("analysis_locked");
			return;
		case "return":
			this.return_to_lock();
			return;
		case "auto":
			this.set_behaviour("auto_analysis");
			return;
		case "new_game":
			this.new_game();
			return;
		case "paste_fen_pgn":
			read_clipboard_text().then(s => this.paste_game(s));
			return;
		case "copy_pgn":
			this.pgn_to_clipboard();
			return;
		case "flip":
			this.toggle_flip();
			return;
		case "clear_focus":
			this.clear_searchmoves();
			return;
		case "multipv_down":
			this.adjust_toolbar_multipv(-1);
			return;
		case "multipv_up":
			this.adjust_toolbar_multipv(1);
			return;
		case "engine_lab":
			this.toggle_comparison_mode();
			return;
		}
	},

	fullbox_click: function(event) {

		let n;

		// Config item editor...

		if (EventPathString(event, "config_item_save") !== null) {
			if (event.button !== 2) {
				this.apply_fullbox_config_item_edit();
			}
			return;
		}

		if (EventPathString(event, "config_item_cancel") !== null) {
			this.hide_fullbox();
			return;
		}

		if (EventPathString(event, "config_item_web_link") !== null) {
			ipcRenderer.send("web_link", this.fullbox_web_link);
			return;
		}

		if (EventPathString(event, "uci_option_save") !== null) {
			if (event.button !== 2) {
				this.apply_uci_engine_settings();
			}
			return;
		}

		if (EventPathString(event, "uci_option_cancel") !== null) {
			this.hide_fullbox();
			return;
		}

		if (EventPathString(event, "comment_item_save") !== null) {
			if (event.button !== 2) {
				this.apply_comment_edit();
			}
			return;
		}

		if (EventPathString(event, "comment_item_cancel") !== null) {
			this.fullbox_comment_node = null;
			this.hide_fullbox();
			return;
		}

		// PGN chooser...

		n = EventPathN(event, "pgn_chooser_");
		if (typeof n === "number") {
			if (this.pgndata && n >= 0 && n < this.pgndata.count()) {
				this.load_pgn_object(this.pgndata.getrecord(n), this.pgndata_merge_into_current);
			}
			return;
		}

		// PGN chooser, prev / next page buttons...

		n = EventPathN(event, "pgn_index_chooser_");
		if (typeof n !== "number") {
			n = EventPathN(event, "pgn_index_b_chooser_");
		}
		if (typeof n === "number") {
			this.pgn_choices_start = n;
			this.show_pgn_chooser();
			return;
		}

		// Engine chooser...

		n = EventPathN(event, "engine_chooser_");
		if (typeof n === "number") {
			let filepath = this.engine_choices[n];			// The array is remade every time the fast engine chooser is displayed
			if (filepath) {
				if (event.button === 2) {					// Right-click
					if (this.engine.filepath !== filepath) {
						delete engineconfig[filepath];
						this.show_fast_engine_chooser();
					}
				} else {									// Any other click
					this.switch_engine(filepath);
					this.hide_fullbox();
				}
			}
			return;
		}
	},

	promotiontable_click: function(event) {
		let s = EventPathString(event, "promotion_chooser_");
		this.hide_promotiontable();
		this.move(s);
	},

	handle_file_drop: function(event) {
		if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0] && get_path_for_file(event.dataTransfer.files[0])) {
			this.open(get_path_for_file(event.dataTransfer.files[0]));
			return;
		}
	},

	mouse_point: function() {
		let overlist = document.querySelectorAll(":hover");
		for (let item of overlist) {
			if (typeof item.id === "string" && item.id.startsWith("overlay_")) {
				return Point(item.id.slice(8));		// Possibly null
			}
		}
		return null;
	},

	// ---------------------------------------------------------------------------------------------------------------------
	// Settings (but NOT including UCI options)...

	toggle: function(option) {

		// Cases with their own handler...

		if (option === "flip") {
			this.toggle_flip();
			return;
		}

		// Normal cases...

		config[option] = !config[option];

		// Cases that have additional actions after...

		if (option === "book_explorer") {
			this.lichess_explorer = false;
			this.explorer_objects_cache = null;
		}
		if (option === "lichess_explorer") {
			this.book_explorer = false;
			this.explorer_objects_cache = null;
		}
		if (option === "look_past_25") {
			if (this.look_past_25 && this.tree.node.board.fullmove > 25) {
				this.looker.add_to_queue(this.tree.node.board);
			}
		}
		if (option === "searchmoves_buttons") {
			this.tree.node.searchmoves = [];		// This is reasonable regardless of which way the toggle went.
			this.handle_search_params_change();
		}

		this.info_handler.must_draw_infobox();
		this.draw();
	},

	toggle_flip: function() {						// config.flip should not be directly set, call this function instead.
		this.flip = !this.flip;
		this.apply_display_flip(this.flip);
		this.draw();								// For the canvas stuff.
	},

	set_arrow_filter: function(type, value) {
		config.arrow_filter_type = type;
		config.arrow_filter_value = value;
		this.draw();
	},

	set_looker_api: function(value) {

		if (this.looker_api === value) {
			return;
		}

		this.looker_api = value;

		if (value && value.includes("lichess") && !config.lichess_token) {
			alert(messages.lichess_token_needed);
		}

		this.looker.clear_queue();

		if (value) {
			this.looker.add_to_queue(this.tree.node.board);
		}

		this.explorer_objects_cache = null;
	},

	invert_searchmoves: function() {

		if (!config.searchmoves_buttons || Array.isArray(this.tree.node.searchmoves) === false) {
			return;
		}

		// It's no disaster if the result is wrong somehow, because
		// searchmoves are validated before being sent to Leela.

		let moveset = Object.create(null);

		for (let move of Object.keys(this.tree.node.table.moveinfo)) {
			moveset[move] = true;
		}

		for (let move of this.tree.node.searchmoves) {
			delete moveset[move];
		}

		this.tree.node.searchmoves = Object.keys(moveset);
		this.tree.node.searchmoves.sort();
		this.handle_search_params_change();
	},

	clear_searchmoves: function() {
		this.tree.node.searchmoves = [];
		this.handle_search_params_change();
	},

	toolbar_multipv_value: function() {
		let engine_entry = engineconfig[this.engine.filepath];
		if (engine_entry && engine_entry.options && typeof engine_entry.options["MultiPV"] === "number") {
			return engine_entry.options["MultiPV"];
		}
		return 1;
	},

	adjust_toolbar_multipv: function(delta) {
		let current = this.toolbar_multipv_value();
		let next = current + delta;

		if (next < 1) {
			next = 1;
		}
		if (next > 5) {
			next = 5;
		}

		if (next === current) {
			return;
		}

		this.set_uci_option_permanent("MultiPV", next);
	},

	update_toolbar_state: function() {
		if (!this.is_active_context()) {
			return;
		}
		let go_button = document.getElementById("toolbar_go");
		let halt_button = document.getElementById("toolbar_halt");
		let lock_button = document.getElementById("toolbar_lock");
		let auto_button = document.getElementById("toolbar_auto");
		let return_button = document.getElementById("toolbar_return");
		let clear_focus_button = document.getElementById("toolbar_clear_focus");
		let multipv_down_button = document.getElementById("toolbar_multipv_down");
		let multipv_up_button = document.getElementById("toolbar_multipv_up");
		let busy_elsewhere = this.engine_busy_elsewhere();

		if (go_button) {
			go_button.disabled = busy_elsewhere || (this.behaviour !== "halt");
		}
		if (halt_button) {
			halt_button.disabled = busy_elsewhere || (this.behaviour === "halt");
		}
		if (lock_button) {
			lock_button.disabled = busy_elsewhere;
		}
		if (auto_button) {
			auto_button.disabled = busy_elsewhere;
		}
		if (return_button) {
			return_button.disabled = !this.leela_lock_node;
		}
		if (clear_focus_button) {
			clear_focus_button.disabled = (this.tree.node.searchmoves.length === 0);
		}
		if (multipv_down_button) {
			multipv_down_button.disabled = (this.toolbar_multipv_value() <= 1);
		}
		if (multipv_up_button) {
			multipv_up_button.disabled = (this.toolbar_multipv_value() >= 5);
		}
	},

	set_pgn_font_size: function(n) {
		movelist.style["font-size"] = n.toString() + "px";
		fenbox.style["font-size"] = n.toString() + "px";
		config.pgn_font_size = n;
		config.fen_font_size = n;
	},

	set_arrow_size: function(width, radius, fontsize) {
		config.arrow_width = width;
		config.arrowhead_radius = radius;
		config.board_font = `${fontsize}px Arial`;
	},

	set_info_font_size: function(n) {
		infobox.style["font-size"] = n.toString() + "px";
		statusbox.style["font-size"] = n.toString() + "px";
		fullbox.style["font-size"] = n.toString() + "px";
		config.info_font_size = n;
		this.rebuild_sizes();
	},

	set_graph_height: function(sz) {
		config.graph_height = sz;
		this.rebuild_sizes();
		this.grapher.draw(this.tree.node, true);
	},

	set_board_size: function(sz) {
		config.square_size = Math.floor(sz / 8);
		config.board_size = config.square_size * 8;
		this.rebuild_sizes();
	},

	change_piece_set: function(directory) {
		if (directory) {
			if (images.validate_folder(directory) === false) {
				alert(messages.invalid_pieces_directory);
				return;
			}
			images.load_from(directory);
		} else {
			directory = null;
			images.load_from(path.join(__dirname, "pieces"));
		}
		this.friendly_draws = New2DArray(8, 8, null);
		this.enemy_draws = New2DArray(8, 8, null);
		config["override_piece_directory"] = directory;
	},

	change_background: function(file, config_save = true) {
		if (file && fs.existsSync(file)) {
			let img = new Image();
			img.src = file;			// Automagically gets converted to "file:///C:/foo/bar/whatever.png"
			boardsquares.style["background-image"] = `url("${img.src}")`;
		} else {
			boardsquares.style["background-image"] = background(config.light_square, config.dark_square, config.square_size);
		}
		if (config_save) {
			config.override_board = file;
		}
	},

	rebuild_sizes: function() {

		// This assumes everything already exists.
		// Derived from the longer version in start.js, which it does not replace.

		boardfriends.width = canvas.width = boardsquares.width = config.board_size;
		boardfriends.height = canvas.height = boardsquares.height = config.board_size;

		rightgridder.style["height"] = `${canvas.height}px`;

		for (let y = 0; y < 8; y++) {
			for (let x = 0; x < 8; x++) {
				let td1 = document.getElementById("underlay_" + S(x, y));
				let td2 = document.getElementById("overlay_" + S(x, y));
				td1.width = td2.width = config.square_size;
				td1.height = td2.height = config.square_size;
			}
		}

		if (config.graph_height <= 0) {
			graph.style.display = "none";
		} else {
			graph.style.height = config.graph_height.toString() + "px";
			graph.style.display = "";
		}

		promotiontable.style.left = (boardsquares.offsetLeft + config.square_size * 2).toString() + "px";
		promotiontable.style.top = (boardsquares.offsetTop + config.square_size * 3.5).toString() + "px";
		promotiontable.style["background-color"] = config.active_square;

		this.draw();
	},

	save_window_size: function() {
		let zoomfactor = parseFloat(querystring.parse(global.location.search.slice(1))["zoomfactor"]);
		config.width = Math.floor(window.innerWidth * zoomfactor);
		config.height = Math.floor(window.innerHeight * zoomfactor);
	},

	set_logfile: function(filename) {				// Arg can be null to stop logging.
		config.logfile = null;
		Log("Stopping log.");						// This will do nothing, but calling Log() forces it to close any open file.
		config.logfile = filename;
		this.send_ack_logfile();
	},

	set_language: function(s) {
		config.language = s;
		alert(translate.t("RESTART_REQUIRED", s));
	},

	send_ack_logfile: function() {
		ipcRenderer.send("ack_logfile", config.logfile);
	},

	save_config: function() {
		if (!load_err1) {							// If the config file was broken, never save to it, let the user fix it.
			config_io.save(config);
		}
	},

	save_engineconfig: function() {
		if (!load_err2) {							// If the config file was broken, never save to it, let the user fix it.
			engineconfig_io.save(engineconfig);
		}
	},

	// ---------------------------------------------------------------------------------------------------------------------
	// Misc...

	quit: function() {
		try {
			this.last_session_store && this.last_session_store.save(this);
		} catch (err) {
			console.log("Could not save last chess session:", err);
		}
		this.engine_manager.stop_all();
		this.save_config();
		this.save_engineconfig();
		ipcRenderer.send("terminate");
	},

	set_special_message: function(s, css_class, duration) {
		this.status_handler.set_special_message(s, css_class, duration);
		this.draw_statusbox();
	},

	infobox_to_clipboard: function() {
		let s = infobox.innerText;
		s = ReplaceAll(s, `${config.focus_on_text} `, "");
		s = ReplaceAll(s, `${config.focus_off_text} `, "");
		clipboard.writeText(this.tree.node.board.fen(true) + "\n" + statusbox.innerText + "\n\n" + s);
	},

	send_title: function() {
		let tab = this.active_tab();
		let title = `Nibbler: ${tab.title || "New game"}`;
		ipcRenderer.send("set_title", title);
	},

	generate_simple_book: function() {		// For https://github.com/rooklift/lc0_lichess
		let histories = this.tree.root.end_nodes().map(end => end.history_old_format());
		let text_lines = histories.map(h => "\t\"" + h.join(" ") + "\"");
		console.log("[\n" + text_lines.join(",\n") + "\n]");
	},

	run_script: function(filename) {

		const disallowed = ["position", "go", "stop", "ponderhit", "quit"];

		let buf;
		try {
			buf = fs.readFileSync(filename);
		} catch (err) {
			alert(err);
			return;
		}

		this.set_behaviour("halt");

		let s = buf.toString();
		let lines = s.split("\n").map(z => z.trim()).filter(z => z !== "");

		if (!config.allow_arbitrary_scripts) {
			for (let line of lines) {
				for (let d of disallowed) {
					if (line.startsWith(d)) {
						this.set_special_message(`${messages.invalid_script}`, "yellow");
						console.log(`Refused to run script: ${filename}`);
						return;
					}
				}
			}
		}

		console.log(`Running script: ${filename}`);

		for (let line of lines) {
			if (config.allow_arbitrary_scripts) {
				this.engine.send(line, true);			// Force mode, so setoptions don't get held back
			} else {
				this.engine.send(line);
			}
			console.log(line);
		}
		this.set_special_message(`${path.basename(filename)}: Sent ${lines.length} lines`, "blue");
	},

	fire_gc: function() {
		if (!global || !global.gc) {
			alert("Unable.");
		} else {
			global.gc();
		}
	},

	log_ram: function() {
		console.log(`RAM after ${Math.floor(performance.now() / 1000)} seconds:`);
		for (let foo of Object.entries(process.memoryUsage())) {
			let type = foo[0] + " ".repeat(12 - foo[0].length);
			let mb = foo[1] / (1024 * 1024);
			let mb_rounded = Math.floor(mb * 1000) / 1000;			// 3 d.p.
			console.log(type, "(MB)", mb_rounded);
		}
	},

	console: function(...args) {
		console.log(...args);
	},

	toggle_debug_css: function() {
		let ss = document.styleSheets[0];
		let i = 0;
		for (let rule of Object.values(ss.cssRules)) {
			if (rule.selectorText && rule.selectorText === "*") {
				ss.deleteRule(i);
				return;
			}
			i++;
		}
		ss.insertRule("* {outline: 1px dotted red;}");
	},

	// ---------------------------------------------------------------------------------------------------------------------
	// Fullbox (our full size info div)...

	show_pgn_chooser: function() {

		const interval = 100;

		if (!this.pgndata || this.pgndata.count() === 0) {
			fullbox_content.innerHTML = `<span class="green">No PGN loaded</span>`;
			this.show_fullbox();
			return;
		}

		let count = this.pgndata.count();

		if (this.pgn_choices_start >= count) {
			this.pgn_choices_start = Math.floor((count - 1) / interval) * interval;
		}
		if (this.pgn_choices_start < 0) {		// The most important thing, values < 0 will crash.
			this.pgn_choices_start = 0;
		}

		let lines = [];

		let max_ordinal_length = count.toString().length;

		let prevnextfoo = (count > interval) ?			// All these values get fixed on function entry if they're out-of-bounds. ids should be unique.
				`<span id="pgn_index_chooser_-99999999">Start </span>|` +
				`<span id="pgn_index_chooser_${this.pgn_choices_start - 10000}"> <<<< </span>|` +
				`<span id="pgn_index_chooser_${this.pgn_choices_start - 1000}"> <<< </span>|` +
				`<span id="pgn_index_chooser_${this.pgn_choices_start - 100}"> << </span>|` +
				`<span id="pgn_index_chooser_${this.pgn_choices_start + 100}"> >> </span>|` +
				`<span id="pgn_index_chooser_${this.pgn_choices_start + 1000}"> >>> </span>|` +
				`<span id="pgn_index_chooser_${this.pgn_choices_start + 10000}"> >>>> </span>|` +
				`<span id="pgn_index_chooser_99999999"> End (${count}) </span>` +
				`&mdash; <span class="green">${this.pgndata.source}</span>`
			:
				`<span class="green">${this.pgndata.source}</span>`;

		lines.push(prevnextfoo);
		lines.push("<ul>");
		for (let n = this.pgn_choices_start; n < this.pgn_choices_start + interval; n++) {

			if (n < count) {

				let pad = n < 10 ? " " : "";

				let p = this.pgndata.getrecord(n);

				let s;

				if (p.tags.Result === "1-0") {
					s = `${pad}${n}. <span class="blue">${p.tags.White || "Unknown"}</span> - ${p.tags.Black || "Unknown"}`;
				} else if (p.tags.Result === "0-1") {
					s = `${pad}${n}. ${p.tags.White || "Unknown"} - <span class="blue">${p.tags.Black || "Unknown"}</span>`;
				} else {
					s = `${pad}${n}. ${p.tags.White || "Unknown"} - ${p.tags.Black || "Unknown"}`;
				}

				if (p.tags.Opening && p.tags.Opening !== "?") {
					s += `  <span class="gray">(${p.tags.Opening})</span>`;
				} else if (p.tags.Variant && p.tags.Variant.toLowerCase() !== "standard" && p.tags.Variant.toLowerCase() !== "from position") {
					s += `  <span class="gray">(${p.tags.Variant})</span>`;
				}

				lines.push(`<li class="pgnchooser" id="pgn_chooser_${n}">${s}</li>`);

			} else if (count > interval) {		// Pad the chooser with blank lines so the buttons at the bottom behave nicely. This is stupid though.

				lines.push(`<li><span class="darkgray">${n}.${n === count ? " [end]" : ""}</li>`);

			}
		}
		lines.push("</ul>");
		if (count > interval) {
			prevnextfoo = ReplaceAll(prevnextfoo, `span id="pgn_index_chooser_`, `span id="pgn_index_b_chooser_`);		// id should be unique per element.
			lines.push(prevnextfoo);
		}

		fullbox_content.innerHTML = lines.join("");
		this.show_fullbox();
	},

	show_sent_options: function() {

		let lines = [];

		lines.push(`<span class="yellow">${this.engine.filepath || "No engine loaded"}</span>`);
		lines.push("");

		for (let name of Object.keys(this.engine.sent_options)) {
			lines.push(`${name}<br>    <span class="green">${this.engine.sent_options[name]}</span>`);
		}

		fullbox_content.innerHTML = lines.join("<br>");
		this.show_fullbox();
	},

	show_error_log: function() {
		fullbox_content.innerHTML = this.info_handler.error_log;
		this.show_fullbox();
	},

	parse_fullbox_config_item_value: function(item_name, raw) {

		raw = raw.trim();

		let defaults_has_item = Object.prototype.hasOwnProperty.call(config_io.defaults, item_name);
		let expected = defaults_has_item ? config_io.defaults[item_name] : config[item_name];

		if (Array.isArray(expected)) {
			try {
				let parsed = JSON.parse(raw);
				if (Array.isArray(parsed)) {
					return [parsed, null];
				}
				return [null, "Expected JSON array"];
			} catch (err) {
				return [null, "Expected JSON array"];
			}
		}

		if (typeof expected === "string") {
			return [raw, null];
		}

		if (typeof expected === "number") {
			let n = Number(raw);
			if (Number.isNaN(n)) {
				return [null, "Expected number"];
			}
			let range = Object.prototype.hasOwnProperty.call(CONFIG_NUMBER_RANGES, item_name) ? CONFIG_NUMBER_RANGES[item_name] : null;
			if (range && (!Number.isInteger(n) || n < range.min || n > range.max)) {
				return [null, `Expected an integer from ${range.min} to ${range.max}`];
			}
			return [n, null];
		}

		if (typeof expected === "boolean") {
			let s = raw.toLowerCase();
			if (s === "true" || s === "1" || s === "yes" || s === "on") {
				return [true, null];
			}
			if (s === "false" || s === "0" || s === "no" || s === "off") {
				return [false, null];
			}
			return [null, `Expected boolean (true / false)`];
		}

		if (expected === null) {		// Null defaults are usually nullable strings.
			if (raw.toLowerCase() === "null") {
				return [null, null];
			}
			return [raw, null];
		}

		if (typeof expected === "object") {
			try {
				let parsed = JSON.parse(raw);
				if (parsed !== null && typeof parsed === "object" && Array.isArray(parsed) === false) {
					return [parsed, null];
				}
				return [null, "Expected JSON object"];
			} catch (err) {
				return [null, "Expected JSON object"];
			}
		}

		return [raw, null];
	},

	apply_fullbox_config_item_edit: function() {

		if (typeof this.fullbox_config_item !== "string") {
			return;
		}

		let textarea = document.getElementById("config_item_input");
		if (!textarea) {
			return;
		}

		let [value, err] = this.parse_fullbox_config_item_value(this.fullbox_config_item, textarea.value);

		if (err) {
			let errdiv = document.getElementById("config_item_error");
			if (errdiv) {
				errdiv.innerHTML = `<span class="red">${SafeStringHTML(err)}</span>`;
			}
			return;
		}

		config[this.fullbox_config_item] = value;
		this.info_handler.must_draw_infobox();
		this.draw();
		this.hide_fullbox();
	},

	show_config_item_editor: function(item_name, web_link = null, web_text = "See web") {

		if (typeof item_name !== "string" || item_name === "") {
			return;
		}

		if (!Object.prototype.hasOwnProperty.call(config, item_name)) {
			fullbox_content.innerHTML =
				`<span class="red">Unknown config item: ${SafeStringHTML(item_name)}</span><br><br>` +
				`<span id="config_item_cancel" class="blue">Cancel</span>`;
			this.show_fullbox();
			return;
		}

		this.fullbox_config_item = item_name;
		this.fullbox_web_link = web_link;

		let current = config[item_name];
		let expected = Object.prototype.hasOwnProperty.call(config_io.defaults, item_name) ? config_io.defaults[item_name] : current;

		let expected_type = Array.isArray(expected) ? "array" : (expected === null ? "string or null" : typeof expected);
		let current_text = SafeStringHTML(stringify(current));

		let initial_input;
		if (typeof current === "string") {
			initial_input = current;
		} else if (current !== null && typeof current === "object") {
			try {
				initial_input = JSON.stringify(current, null, "\t");
			} catch (err) {
				initial_input = stringify(current);
			}
		} else {
			initial_input = stringify(current);
		}

		let lines = [];
		lines.push(`<div class="infoline">Editing: <span class="green">config.${SafeStringHTML(item_name)}</span></div>`);
		lines.push(`<div class="infoline">Current: <span class="green">${current_text}</span></div>`);
		if (web_link) {
			lines.push(`<div>${SafeStringHTML(web_text)}:</div>`);
			lines.push(`<div class="infoline"><span id="config_item_web_link" class="blue">${SafeStringHTML(web_link)}</span></div>`);
		}
		lines.push(`<textarea id="config_item_input" placeholder="Set the value here, then click 'Save'" rows="6"></textarea>`);
		lines.push(`<div class="infoline"><span id="config_item_save" class="blue">Save</span> | <span id="config_item_cancel" class="red">Cancel</span></div>`);
		lines.push(`<div id="config_item_error" class="infoline">&nbsp;</div>`);

		fullbox_content.innerHTML = lines.join("");
		this.show_fullbox();

		let textarea = document.getElementById("config_item_input");
		if (textarea) {
			textarea.value = initial_input;
			textarea.focus();
			textarea.select();
		}
	},

	show_fast_engine_chooser: function() {

		this.engine_choices = [];

		let divs = [];

		for (let filepath of Object.keys(engineconfig)) {

			if (filepath === "") {
				continue;
			}

			let ac = (this.engine.filepath === filepath) ? ` <span class="blue">(active)</span>` : "";

			divs.push(`<div class="enginechooser" id="engine_chooser_${this.engine_choices.length}"><span class="gray">${path.dirname(filepath)}</span>` +
					  `<br>    ${path.basename(filepath)}${ac}</div>`);

			this.engine_choices.push(filepath);					// After the above calc using length
		}

		if (divs.length === 0) {
			divs.push(`<div>No engines known yet.</div>`);
		} else {
			divs.unshift(`<div class="infoline green">Click to load.<br>Right-click to remove from ${engineconfig_io.filename}.</div>`);
		}

		fullbox_content.innerHTML = divs.join("");
		this.show_fullbox();
	},

	// ---------------------------------------------------------------------------------------------------------------------
	// Showing and hiding things...

	show_promotiontable: function(partial_move) {

		let pieces = this.tree.node.board.active === "w" ? ["Q", "R", "B", "N"] : ["q", "r", "b", "n"];

		for (let piece of pieces) {
			let td = document.getElementsByClassName("promotion_" + piece.toLowerCase())[0];		// Our 4 TDs each have a unique class.
			td.id = "promotion_chooser_" + partial_move + piece.toLowerCase();						// We store the actual move in the id.
			td.width = config.square_size;
			td.height = config.square_size;
			td.style["background-image"] = images[piece].string_for_bg_style;
		}

		promotiontable.style.display = "block";
	},

	hide_promotiontable: function() {
		promotiontable.style.display = "none";
	},

	show_fullbox: function() {
		this.set_behaviour("halt");
		this.hide_promotiontable();
		fullbox.style.display = "block";
	},

	hide_fullbox: function() {
		this.fullbox_config_item = null;
		this.fullbox_web_link = null;
		this.uci_option_rows = null;
		this.fullbox_comment_node = null;
		fullbox.style.display = "none";
	},

	escape: function() {					// Set things into a clean state.
		this.hide_fullbox();
		this.hide_promotiontable();
		if (this.active_square) {
			this.set_active_square(null);
			if (config.click_spotlight) {
				this.draw_canvas_arrows();
			}
		}
	},
};
