"use strict";

// The last workspace is intentionally independent of engine analysis and config.json.
// Moves are stored as UCI strings, so nested variations can be reconstructed exactly.
const fs = require("fs");
const path = require("path");

const FILENAME = "last-session.json";
const VERSION = 1;
const MAX_NODES = 200000;
const MAX_FILE_SIZE = 128 * 1024 * 1024;

function node_path(root, node) {
	let result = [];
	while (node && node !== root && node.parent) {
		let index = node.parent.children.indexOf(node);
		if (index < 0) return [];
		result.unshift(index);
		node = node.parent;
	}
	return node === root ? result : [];
}

function export_node(node, counter) {
	if (++counter.count > MAX_NODES) throw new Error("Session tree is too large");
	return {
		move: node.move || null,
		annotation: node.annotation || null,
		position_nag: node.position_nag == null ? null : node.position_nag,
		comment_before: node.comment_before || "",
		comment_after: node.comment_after || "",
		user_arrows: node.user_arrows || [],
		user_highlights: node.user_highlights || [],
		children: node.children.map(child => export_node(child, counter)),
	};
}

function create_snapshot(hub) {
	let count = {count: 0};
	return {
		version: VERSION,
		active_index: hub.tab_manager.tabs.findIndex(tab => tab.id === hub.tab_manager.active_tab_id),
		tabs: hub.tab_manager.tabs.map(tab => ({
			fen: tab.tree.root.board.fen(true),
			tags: tab.tree.root.tags || {},
			tree: export_node(tab.tree.root, count),
			selected: node_path(tab.tree.root, tab.tree.node),
			flip: !!tab.flip,
			source: (tab.pgndata && tab.pgndata.source) || tab.session_source || null,
		})),
	};
}

function import_node(node, record, count) {
	if (!record || typeof record !== "object" || !Array.isArray(record.children)) {
		throw new Error("Invalid saved move tree");
	}
	if (++count.count > MAX_NODES) throw new Error("Saved move tree is too large");
	node.annotation = typeof record.annotation === "string" ? record.annotation : null;
	node.position_nag = Number.isInteger(record.position_nag) ? record.position_nag : null;
	node.comment_before = typeof record.comment_before === "string" ? record.comment_before : "";
	node.comment_after = typeof record.comment_after === "string" ? record.comment_after : "";
	node.user_arrows = Array.isArray(record.user_arrows) ? record.user_arrows : [];
	node.user_highlights = Array.isArray(record.user_highlights) ? record.user_highlights : [];
	for (let child of record.children) {
		if (!child || typeof child.move !== "string" || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(child.move)) {
			throw new Error("Invalid saved chess move");
		}
		import_node(node.make_move(child.move, true), child, count);
	}
}

function restore_snapshot(hub, snapshot, create_root, destroy_tree) {
	if (!snapshot || snapshot.version !== VERSION || !Array.isArray(snapshot.tabs) || snapshot.tabs.length === 0) {
		return false;
	}

	let restored = [];
	let count = {count: 0};
	for (let index = 0; index < snapshot.tabs.length; index++) {
		let saved = snapshot.tabs[index];
		let root = null;
		try {
			if (!saved || typeof saved.fen !== "string" || !saved.tree) throw new Error("Invalid saved tab");
			root = create_root(saved.fen);
			import_node(root, saved.tree, count);
			root.tags = Object.assign(Object.create(null), saved.tags && typeof saved.tags === "object" && !Array.isArray(saved.tags) ? saved.tags : {});
			let selected = root;
			if (Array.isArray(saved.selected)) {
				for (let step of saved.selected) {
					if (!Number.isInteger(step) || step < 0 || !selected.children[step]) throw new Error("Invalid selected move");
					selected = selected.children[step];
				}
			}
			restored.push({index, root, selected, flip: !!saved.flip, source: typeof saved.source === "string" ? saved.source : null});
		} catch (error) {
			console.log("Skipping damaged saved tab:", String(error));
			if (root && destroy_tree) {
				try {
					destroy_tree(root);
				} catch (cleanup_error) {
					console.log("Could not dispose damaged saved tab:", String(cleanup_error));
				}
			}
		}
	}
	if (restored.length === 0) return false;

	let manager = hub.tab_manager;
	for (let index = 0; index < restored.length; index++) {
		let tab = index === 0 ? manager.tabs[0] : manager.new_tab();
		let saved = restored[index];
		if (destroy_tree) destroy_tree(tab.tree.root);
		tab.tree.root = saved.root;
		tab.tree.node = saved.selected;
		tab.tree.tree_version++;
		tab.tree.ordered_nodes_cache = null;
		tab.tree.ordered_nodes_cache_version = -1;
		tab.flip = saved.flip;
		tab.session_source = saved.source;
		tab.node_to_clean = saved.selected;
		tab.behaviour = "halt";
		tab.title = saved.root.tags.White && saved.root.tags.Black ?
			saved.root.tags.White + " - " + saved.root.tags.Black : saved.source || "New game";
	}
	let target = restored.findIndex(entry => entry.index === snapshot.active_index);
	manager.active_tab_id = manager.tabs[target < 0 ? 0 : target].id;
	return true;
}

function create_store(user_data_directory) {
	let filepath = path.join(user_data_directory, FILENAME);
	let backup = filepath + ".bak";
	let previous_text = null;
	let preserve_backup = false;
	function read(file) {
		try {
			if (fs.statSync(file).size > MAX_FILE_SIZE) throw new Error("Session file is too large");
			return JSON.parse(fs.readFileSync(file, "utf8"));
		} catch (error) {
			if (fs.existsSync(file)) console.log("Could not load", file, String(error));
			return null;
		}
	}
	return {
		filepath,
		load() {
			let snapshot = read(filepath);
			if (snapshot && snapshot.version === VERSION && Array.isArray(snapshot.tabs)) return snapshot;
			return this.load_backup();
		},
		load_backup() {
			let snapshot = read(backup);
			if (snapshot && snapshot.version === VERSION && Array.isArray(snapshot.tabs)) {
				preserve_backup = true;
				return snapshot;
			}
			return null;
		},
		save(hub) {
			let text = JSON.stringify(create_snapshot(hub));
			if (text === previous_text) return false;
			fs.mkdirSync(user_data_directory, {recursive: true});
			let temporary = filepath + ".tmp";
			try {
				fs.writeFileSync(temporary, text, "utf8");
				// Only rotate a valid existing file to the backup.
				if (!preserve_backup && read(filepath)) fs.copyFileSync(filepath, backup);
				fs.renameSync(temporary, filepath);
				previous_text = text;
				preserve_backup = false;
				return true;
			} finally {
				if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
			}
		},
	};
}

module.exports = {create_snapshot, restore_snapshot, create_store};
