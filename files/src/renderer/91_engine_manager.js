"use strict";

const engine_resource_scheduler = require("./modules/engine_resource_scheduler");
const engine_game_analysis = require("./modules/engine_game_analysis");

function NewEngineManager(hub, options = null) {
	let manager = Object.create(null);
	let settings = options || {};

	manager.hub = hub;
	manager.sessions = Object.create(null);
	manager.primary_session = null;
	manager.secondary_session = null;
	manager.next_session_id = 1;
	manager.engine_factory = settings.engine_factory || ((owner, engine_options) => NewEngine(owner, engine_options));
	manager.profile_loader = settings.profile_loader || (profile_key => engineconfig[profile_key] || null);
	manager.resource_scheduler = settings.resource_scheduler || engine_resource_scheduler.createEngineResourceScheduler({
		totalThreads: settings.total_threads,
	});
	manager.game_analysis_queues = Object.create(null);

	manager.primary = function() {
		return this.primary_session ? this.primary_session.engine : null;
	};

	manager.secondary = function() {
		return this.secondary_session ? this.secondary_session.engine : null;
	};

	manager.primary_session_id = function() {
		return this.primary_session ? this.primary_session.sessionId : null;
	};

	manager.secondary_session_id = function() {
		return this.secondary_session ? this.secondary_session.sessionId : null;
	};

	manager.get_session = function(session_id) {
		return this.sessions[session_id] || null;
	};

	manager.list_sessions = function() {
		return Object.values(this.sessions);
	};

	manager.assign_to_tab = function(session_id, tab_id) {
		let session = this.get_session(session_id);
		if (!session || tab_id === null || tab_id === undefined) return false;
		let tab = this.hub.tab_manager ? this.hub.tab_manager.find(tab_id) : null;
		if (this.hub.tab_manager && !tab) return false;
		if (session.tabId !== null && this.hub.tab_manager) {
			let previous_tab = this.hub.tab_manager.find(session.tabId);
			if (previous_tab) previous_tab.engine_session_ids = previous_tab.engine_session_ids.filter(id => id !== session_id);
		}
		session.tabId = tab_id;
		if (tab) {
			if (!tab.engine_session_ids.includes(session_id)) tab.engine_session_ids.push(session_id);
		}
		return true;
	};

	manager.unassign_from_tab = function(session_id) {
		let session = this.get_session(session_id);
		if (!session) return false;
		if (session.tabId !== null && this.hub.tab_manager) {
			let tab = this.hub.tab_manager.find(session.tabId);
			if (tab) tab.engine_session_ids = tab.engine_session_ids.filter(id => id !== session_id);
		}
		session.tabId = null;
		return true;
	};

	manager.unassign_tab = function(tab_id) {
		for (let session of this.list_sessions()) {
			if (session.tabId === tab_id) session.tabId = null;
		}
		if (this.hub.tab_manager) {
			let tab = this.hub.tab_manager.find(tab_id);
			if (tab) tab.engine_session_ids = [];
		}
	};

	manager.sessions_for_tab = function(tab_id) {
		return this.list_sessions().filter(session => session.tabId === tab_id);
	};

	manager.session_for_engine = function(engine) {
		return this.list_sessions().find(session => session.engine === engine) || null;
	};

	manager.handle_event = function(name, engine, event) {
		let session = this.session_for_engine(engine);
		if (!session) return false;
		let sink = this.make_event_sink(session);
		if (typeof sink[name] !== "function") return false;
		sink[name](engine, event);
		return true;
	};

	manager.dispatch_analysis = function(session) {
		if (!session.analysisRequest || !session.engine ||
			!session.engine.ever_received_uciok || !session.engine.ever_received_readyok) return false;
		let request = session.analysisRequest;
		session.engine.set_search_desired(request.node, request.limit, request.limit_by_time, request.searchmoves);
		return true;
	};

	manager.start_analysis = function(tab_id, node, limits = {}) {
		let sessions = this.sessions_for_tab(tab_id);
		if (!node || sessions.length === 0) return false;
		let request = {
			node,
			nodeId: node.id || null,
			limit: limits.limit === undefined ? null : limits.limit,
			limit_by_time: !!limits.limit_by_time,
			searchmoves: Array.isArray(limits.searchmoves) ? limits.searchmoves.slice() : [],
		};
		for (let session of sessions) {
			session.analysisRequest = request;
			this.dispatch_analysis(session);
		}
		return true;
	};

	manager.stop_analysis = function(tab_id) {
		let sessions = this.sessions_for_tab(tab_id);
		if (sessions.length === 0) return false;
		for (let session of sessions) {
			session.analysisRequest = null;
			if (session.engine && typeof session.engine.set_search_desired === "function") {
				session.engine.set_search_desired(null);
			}
		}
		return true;
	};

	manager.advance_game_analysis = function(tab_id) {
		let job = this.game_analysis_queues[tab_id];
		if (!job) return false;
		let item = job.queue.next();
		if (!item) return false;
		job.activeSessionIds = new Set(this.sessions_for_tab(tab_id).map(session => session.sessionId));
		this.start_analysis(tab_id, item.node, job.limits);
		return true;
	};

	manager.start_game_analysis = function(tab_id, positions, limits = {}) {
		if (!Array.isArray(positions) || positions.length === 0 || this.sessions_for_tab(tab_id).length === 0) return false;
		this.game_analysis_queues[tab_id] = {
			queue: engine_game_analysis.createGameAnalysisQueue(positions),
			limits,
			activeSessionIds: new Set(),
		};
		return this.advance_game_analysis(tab_id);
	};

	manager.handle_game_bestmove = function(session) {
		let tab_id = session.tabId;
		let job = this.game_analysis_queues[tab_id];
		if (!job || !job.activeSessionIds.has(session.sessionId)) return;
		job.activeSessionIds.delete(session.sessionId);
		if (job.activeSessionIds.size > 0) return;
		let item_results = {
			bySession: this.get_results(tab_id),
			consensus: this.get_consensus(tab_id),
		};
		job.queue.complete(item_results);
		this.advance_game_analysis(tab_id);
	};

	manager.game_analysis_status = function(tab_id) {
		let job = this.game_analysis_queues[tab_id];
		if (!job) return {done: true, pending: 0, results: [], failures: []};
		return {
			done: job.queue.done(),
			pending: job.queue.pending(),
			results: job.queue.results(),
			failures: job.queue.failures(),
		};
	};

	manager.get_results = function(tab_id) {
		let results = Object.create(null);
		for (let session of this.sessions_for_tab(tab_id)) {
			results[session.sessionId] = session.resultsStore.results();
		}
		return results;
	};

	manager.get_consensus = function(tab_id, options = {}) {
		return engine_lab.createConsensus(this.get_results(tab_id), options);
	};

	manager.allocate_resources = function(tab_id, mode = "balanced", custom = {}) {
		let allocations = this.resource_scheduler.allocate(this.sessions_for_tab(tab_id), mode, custom);
		for (let session of this.sessions_for_tab(tab_id)) {
			session.allocatedThreads = allocations[session.sessionId];
		}
		return allocations;
	};

	manager.profile = function(profile_key) {
		let profile = this.profile_loader(profile_key);
		if (!profile || typeof profile !== "object") {
			throw new Error(`Unknown engine profile: ${profile_key}`);
		}
		return profile;
	};

	manager.make_event_sink = function(session) {
		let manager_ref = this;
		return {
			onReady(engine, event) {
				session.processGeneration = event.processGeneration;
				session.lifecycleState = "ready";
				session.uciState = "idle";
				if (event.name) session.name = event.name;
				manager_ref.dispatch_analysis(session);
			},
			onInfo(engine, event) {
				session.processGeneration = event.processGeneration;
				session.lastInfo = event;
				session.resultsStore.update(Object.assign({
					sessionId: session.sessionId,
					engineName: session.name || "",
					nodeId: event.node && event.node.id ? event.node.id : null,
				}, event));
			},
			onBestmove(engine, event) {
				session.processGeneration = event.processGeneration;
				session.lastBestmove = event;
				manager_ref.handle_game_bestmove(session);
			},
			onError(engine, event) {
				session.processGeneration = event.processGeneration;
				manager_ref.fail_session(session, event.message);
			},
			onExit(engine, event) {
				session.processGeneration = event.processGeneration;
				session.lastExit = event;
				if (!event.expected) manager_ref.fail_session(session, "Engine exited");
			},
			onStateChanged(engine, event) {
				session.processGeneration = event.processGeneration;
				session.searchState = event.searchState;
				session.activeSearchId = event.searchId;
				if (event.searchState === "searching" && event.searchId !== null) {
					session.resultsStore.beginSearch(event.searchId);
				}
			},
			find_tab_for_node(node) {
				return manager_ref.hub && typeof manager_ref.hub.find_tab_for_node === "function" ?
					manager_ref.hub.find_tab_for_node(node) : null;
			},
			active_tab() {
				return manager_ref.hub && typeof manager_ref.hub.active_tab === "function" ?
					manager_ref.hub.active_tab() : null;
			},
			with_tab(tab, callback) {
				if (manager_ref.hub && typeof manager_ref.hub.with_tab === "function") {
					return manager_ref.hub.with_tab(tab, callback);
				}
				return callback(tab);
			},
			info_handler: {
				engine_cycle: 0,
				engine_subcycle: 0,
				receive() {},
				err_receive(line) {
					session.lastError = line;
				},
			},
			receive_misc(line) {
				manager_ref.receive_misc(session, line);
			},
			receive_bestmove(line, node) {
				session.lastBestmove = {line, node};
			},
			err_receive(line) {
				session.lastError = line;
			},
			on_error(engine, error) {
				manager_ref.fail_session(session, error);
			},
		};
	};

	manager.receive_misc = function(session, line) {
		if (typeof line !== "string") return;

		if (line.startsWith("id name ")) {
			session.name = line.slice("id name ".length).trim();
			session.engine.name = session.name;
			return;
		}

		if (line.startsWith("uciok")) {
			session.uciState = "waiting_ready";
			session.engine.send("isready");
			return;
		}

		if (line.startsWith("readyok")) {
			session.lifecycleState = "ready";
			session.uciState = "idle";
			session.engine.send_ucinewgame();
			this.dispatch_analysis(session);
		}
	};

	manager.fail_session = function(session, error) {
		session.lifecycleState = "failed";
		session.uciState = "idle";
		session.lastError = error ? error.toString() : "Unknown engine error";
	};

	manager.attach_primary = function(engine, profile_key = "") {
		if (!engine) throw new Error("Cannot attach an empty primary engine");
		if (this.primary_session) this.remove_session(this.primary_session.sessionId);

		let session = {
			sessionId: "engine-session-" + this.next_session_id++,
			role: "primary",
			profileKey: profile_key || engine.filepath || "",
			engine,
			lifecycleState: engine.exe ? "starting" : "not_started",
			uciState: "idle",
			started: !!engine.exe,
			name: engine.name || "",
			lastError: null,
			lastBestmove: null,
			lastInfo: null,
			lastExit: null,
			processGeneration: 0,
			searchState: "idle",
			activeSearchId: null,
			tabId: null,
			analysisRequest: null,
			resultsStore: engine_lab.createMultiPVStore(),
			requestedThreads: 1,
			allocatedThreads: 1,
		};
		this.sessions[session.sessionId] = session;
		this.primary_session = session;
		return session;
	};

	manager.create_session = function(profile_key, role = "secondary") {
		if (role !== "secondary") {
			throw new Error("Only secondary sessions can be created directly");
		}
		if (this.secondary_session) {
			throw new Error("EngineManager supports a maximum of two sessions");
		}

		let profile = this.profile(profile_key);
		let session = {
			sessionId: "engine-session-" + this.next_session_id++,
			role,
			profileKey: profile_key,
			engine: null,
			lifecycleState: "not_started",
			uciState: "idle",
			started: false,
			name: "",
			lastError: null,
			lastBestmove: null,
			lastInfo: null,
			lastExit: null,
			processGeneration: 0,
			searchState: "idle",
			activeSearchId: null,
			tabId: null,
			analysisRequest: null,
			resultsStore: engine_lab.createMultiPVStore(),
			requestedThreads: 1,
			allocatedThreads: 1,
		};
		session.event_sink = this.make_event_sink(session);
		session.engine = this.engine_factory(this.hub, {
			event_sink: session.event_sink,
			role,
			ack_to_main: false,
		});
		this.sessions[session.sessionId] = session;
		this.secondary_session = session;
		return session.sessionId;
	};

	manager.start_session = function(session_id) {
		let session = this.get_session(session_id);
		if (!session) throw new Error(`Unknown engine session: ${session_id}`);
		if (session.lifecycleState === "ready") return true;

		if (!session.started) {
			let profile = this.profile(session.profileKey);
			let args = Array.isArray(profile.args) ? profile.args.slice() : [];
			if (!session.engine.setup(session.profileKey, args)) {
				this.fail_session(session, "Engine failed to start");
				return false;
			}
			session.started = true;
		}

		session.lifecycleState = "starting";
		session.uciState = "waiting_ready";
		session.engine.send("uci");
		return true;
	};

	manager.stop_session = function(session_id) {
		let session = this.get_session(session_id);
		if (!session) return false;
		if (session.engine && typeof session.engine.set_search_desired === "function") {
			session.engine.set_search_desired(null);
		}
		session.uciState = "idle";
		return true;
	};

	manager.restart_session = function(session_id) {
		let old_session = this.get_session(session_id);
		if (!old_session) throw new Error(`Unknown engine session: ${session_id}`);

		let role = old_session.role;
		let profile_key = old_session.profileKey;
		let event_sink = role === "secondary" ? old_session.event_sink : this.hub;
		if (old_session.engine && typeof old_session.engine.shutdown === "function") {
			old_session.engine.shutdown();
		}

		old_session.engine = this.engine_factory(this.hub, {
			event_sink,
			role,
			ack_to_main: role === "primary",
		});
		old_session.lifecycleState = "not_started";
		old_session.uciState = "idle";
		old_session.started = false;
		old_session.lastError = null;
		return this.start_session(session_id);
	};

	manager.start_comparison = function(first_profile_key, second_profile_key) {
		if (!first_profile_key || !second_profile_key || first_profile_key === second_profile_key) {
			throw new Error("Comparison requires two different engine profiles");
		}
		if (!this.primary_session) {
			throw new Error("A primary engine must be attached before comparison starts");
		}
		if (this.primary_session.profileKey !== first_profile_key) {
			throw new Error("The first comparison profile must match the primary engine");
		}
		if (this.secondary_session) this.stop_comparison();

		let secondary_id = this.create_session(second_profile_key, "secondary");
		if (!this.primary_session.started && !this.start_session(this.primary_session.sessionId)) return false;
		if (!this.start_session(secondary_id)) return false;
		return {
			primarySessionId: this.primary_session.sessionId,
			secondarySessionId: secondary_id,
		};
	};

	manager.start_comparison_for_tab = function(tab_id, first_profile_key, second_profile_key) {
		if (this.hub.tab_manager && !this.hub.tab_manager.find(tab_id)) return false;
		let result = this.start_comparison(first_profile_key, second_profile_key);
		if (!result) return false;
		this.assign_to_tab(result.primarySessionId, tab_id);
		this.assign_to_tab(result.secondarySessionId, tab_id);
		return result;
	};

	manager.stop_comparison = function() {
		if (!this.secondary_session) return false;
		let session_id = this.secondary_session.sessionId;
		this.stop_session(session_id);
		if (this.secondary_session.engine && typeof this.secondary_session.engine.shutdown === "function") {
			this.secondary_session.engine.shutdown();
		}
		this.remove_session(session_id);
		return true;
	};

	manager.remove_session = function(session_id) {
		let session = this.sessions[session_id];
		if (!session) return false;
		this.unassign_from_tab(session_id);
		if (this.primary_session === session) this.primary_session = null;
		if (this.secondary_session === session) this.secondary_session = null;
		delete this.sessions[session_id];
		return true;
	};

	manager.stop_all = function() {
		let sessions = this.list_sessions();
		for (let session of sessions) {
			this.stop_session(session.sessionId);
			if (session.engine && typeof session.engine.shutdown === "function") {
				session.engine.shutdown();
			}
		}
		this.sessions = Object.create(null);
		this.primary_session = null;
		this.secondary_session = null;
		return Promise.resolve();
	};

	return manager;
}
