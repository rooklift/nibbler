"use strict";

// ---------------------------------------------------------------------------------------------------------
// Undo/Redo stack for Nibbler tree operations.
//
// This implementation uses deep tree cloning for reliability. Since Nibbler modifies
// tree nodes in-place, we need to create complete copies before operations to enable
// proper restoration during undo.
//
// Memory: Each clone duplicates the entire game tree. With max_size of 50, and typical
// game trees being small, this is acceptable for an MVP.
// ---------------------------------------------------------------------------------------------------------

function NewUndoStack(hub) {

	let stack = Object.create(null);

	stack.hub = hub;
	stack.undo_stack = [];			// Array of {tree_clone, current_node_id, description}
	stack.redo_stack = [];
	stack.max_size = 50;
	stack.suppress_flag = false;	// Set to true during internal restore ops

	// ---------------------------------------------------------------------------------------------------------------------
	// Deep clone a node and its descendants.
	//
	// Since node IDs are generated from a global counter, cloned nodes get new unique IDs.
	// We store a mapping from original_id -> clone so we can restore the active node.
	// ---------------------------------------------------------------------------------------------------------------------

	stack.clone_tree = function(root) {
		// Returns {clone: new_root, id_map: {original_id: cloned_node}}

		if (!root) return {clone: null, id_map: {}};

		let id_map = Object.create(null);		// Maps original node.id -> cloned node

		function clone_node(orig, parent_clone) {
			// Create a new node with the same board state
			// We can't easily call NewNode() because it requires parent/move/board
			// So we manually copy the important fields...

			let clone = Object.create(node_prototype);

			// Generate new unique ID (NewNode increments next_node_id, so just do it manually)
			clone.id = next_node_id++;
			live_nodes[clone.id.toString()] = clone;

			// Board -- this is immutable for a node, so we can reference the same board object
			clone.board = orig.board;

			// Move string
			clone.move = orig.move;
			clone.__nice_move = orig.__nice_move;

			// Depth and tree structure
			clone.depth = orig.depth;
			clone.parent = parent_clone;
			clone.children = [];	// We'll fill this by cloning children

			// Graph stuff
			clone.graph_length_knower = orig.graph_length_knower;	// Shared reference, OK

			// Analysis table -- IMPORTANT: deep copy? or reference?
			// For MVP, let's just reference the same table. If the user modifies analysis
			// differently after undo, this could be weird, but for tree operations it's fine.
			clone.table = orig.table;		// Reference, not clone
			clone.searchmoves = Array.isArray(orig.searchmoves) ? orig.searchmoves.slice() : [];
			clone.comment_before = typeof orig.comment_before === "string" ? orig.comment_before : "";
			clone.comment_after = typeof orig.comment_after === "string" ? orig.comment_after : "";
			clone.annotation = typeof orig.annotation === "string" ? orig.annotation : null;
			clone.position_nag = position_annotations.find(orig.position_nag) ? orig.position_nag : null;
			clone.user_arrows = Array.isArray(orig.user_arrows) ? orig.user_arrows.map(item => Object.assign({}, item)) : [];
			clone.user_highlights = Array.isArray(orig.user_highlights) ? orig.user_highlights.map(item => Object.assign({}, item)) : [];

			// Tags -- only on root
			if (orig.tags) {
				clone.tags = Object.assign(Object.create(null), orig.tags);
			}

			// Lifecycle flags
			clone.destroyed = false;

			// Record the mapping
			id_map[orig.id.toString()] = clone;

			// Recursively clone children
			for (let child of orig.children) {
				let child_clone = clone_node(child, clone);
				clone.children.push(child_clone);
			}

			return clone;
		}

		let cloned_root = clone_node(root, null);
		return {clone: cloned_root, id_map: id_map};
	};

	// ---------------------------------------------------------------------------------------------------------------------
	// Snapshot and restore
	// ---------------------------------------------------------------------------------------------------------------------

	stack.snapshot = function() {
		// Capture full state: tree clone + current node id mapping + other hub state

		let hub = this.hub;
		let tree = hub.tree;

		// Clone the entire tree and get id mapping
		let tree_info = this.clone_tree(tree.root);

		// Find what the current node's clone is
		let cloned_current_node = tree_info.id_map[tree.node.id.toString()];
		let cloned_current_id = cloned_current_node ? cloned_current_node.id : tree_info.clone.id;

		// Find leela_lock_node clone if any
		let cloned_lock_id = null;
		if (hub.leela_lock_node) {
			let cloned_lock = tree_info.id_map[hub.leela_lock_node.id.toString()];
			if (cloned_lock) {
				cloned_lock_id = cloned_lock.id;
			}
		}

		return {
			root: tree_info.clone,
			id_map: tree_info.id_map,					// In case we need it
			current_node_id: cloned_current_id,
			leela_lock_node_id: cloned_lock_id,
			active_square: hub.active_square,
			behaviour: hub.behaviour
		};
	};

	stack.restore = function(snap) {
		// Restore from a snapshot

		let hub = this.hub;
		let tree = hub.tree;

		// We don't need the old tree anymore, but we don't actively destroy it
		// to avoid issues with live_nodes[]... The GC can get it later.

		// Replace the tree root
		tree.root = snap.root;

		// Find the current node by id in the cloned tree
		let node = live_nodes[snap.current_node_id.toString()];
		if (!node) {
			console.log("UndoStack.restore(): could not find node id " + snap.current_node_id);
			node = tree.root;
		}
		tree.node = node;

		// Restore leela_lock_node if it was set
		if (snap.leela_lock_node_id !== null) {
			let lock_node = live_nodes[snap.leela_lock_node_id.toString()];
			hub.leela_lock_node = lock_node || null;
		} else {
			hub.leela_lock_node = null;
		}

		// Restore other state
		hub.active_square = snap.active_square;

		// Invalidate caches and bump tree_version so movelist redraws.
		// CRITICAL: must call dom_from_scratch() explicitly because we're
		// bypassing tree.set_node(), which would normally trigger redraws.
		tree.tree_version++;
		tree.ordered_nodes_cache = null;
		tree.ordered_nodes_cache_version = -1;
		tree.dom_from_scratch();

		// Let hub redraw, but DON'T record this in the undo stack
		this.suppress_flag = true;
		hub.set_behaviour(snap.behaviour);
		hub.position_changed(false, true);
		this.suppress_flag = false;
	};

	// ---------------------------------------------------------------------------------------------------------------------
	// Main public API
	// ---------------------------------------------------------------------------------------------------------------------

	stack.can_undo = function() {
		return this.undo_stack.length > 0;
	};

	stack.can_redo = function() {
		return this.redo_stack.length > 0;
	};

	stack.undo_description = function() {
		if (this.undo_stack.length === 0) return "";
		return this.undo_stack[this.undo_stack.length - 1].description;
	};

	stack.redo_description = function() {
		if (this.redo_stack.length === 0) return "";
		return this.redo_stack[this.redo_stack.length - 1].description;
	};

	stack.undo = function() {
		if (this.undo_stack.length === 0) {
			console.log("UndoStack: nothing to undo");
			return false;
		}

		// Stop engine first if running
		if (this.hub.behaviour !== "halt") {
			this.hub.set_behaviour("halt");
		}

		// Current state becomes redoable
		let current = this.snapshot();
		current.description = this.undo_stack[this.undo_stack.length - 1].description;
		this.redo_stack.push(current);

		// Limit redo stack
		if (this.redo_stack.length > this.max_size) {
			this.redo_stack = this.redo_stack.slice(this.redo_stack.length - this.max_size);
		}

		// Restore the previous state
		let item = this.undo_stack.pop();
		this.restore(item);
		this.hub.set_special_message("Undo: " + item.description, "blue");
		return true;
	};

	stack.redo = function() {
		if (this.redo_stack.length === 0) {
			console.log("UndoStack: nothing to redo");
			return false;
		}

		if (this.hub.behaviour !== "halt") {
			this.hub.set_behaviour("halt");
		}

		// Current state becomes undoable
		let current = this.snapshot();
		current.description = this.redo_stack[this.redo_stack.length - 1].description;
		this.undo_stack.push(current);

		// Limit undo stack
		if (this.undo_stack.length > this.max_size) {
			this.undo_stack = this.undo_stack.slice(this.undo_stack.length - this.max_size);
		}

		// Restore the redo state
		let item = this.redo_stack.pop();
		this.restore(item);
		this.hub.set_special_message("Redo: " + item.description, "blue");
		return true;
	};

	// ---------------------------------------------------------------------------------------------------------------------
	// Wrap a function call with undo recording
	// ---------------------------------------------------------------------------------------------------------------------

	stack.wrap = function(description, fn) {
		// Records state before calling fn(), then records state after.
		// Returns whatever fn() returned.

		if (this.suppress_flag) {
			return fn();
		}

		// Stop engine before any tree modification, then restore the user's mode
		// after a successful operation.
		let previous_behaviour = this.hub.behaviour;
		if (previous_behaviour !== "halt") {
			this.hub.set_behaviour("halt");
		}

		let before = this.snapshot();

		// Execute the wrapped function
		let result = fn();

		// Only record if we're not suppressed and the tree actually changed
		// (We can't easily check for change, so just record always)

		let after = this.snapshot();

		// Create undo item from BEFORE snapshot
		let item = {
			root: before.root,
			id_map: before.id_map,
			current_node_id: before.current_node_id,
			leela_lock_node_id: before.leela_lock_node_id,
			active_square: before.active_square,
			behaviour: before.behaviour,
			description: description
		};

		this.undo_stack.push(item);
		this.redo_stack = [];		// New action clears redo stack

		// Limit undo stack size
		if (this.undo_stack.length > this.max_size) {
			this.undo_stack = this.undo_stack.slice(this.undo_stack.length - this.max_size);
		}

		if (previous_behaviour !== "halt") {
			this.hub.set_behaviour(previous_behaviour);
		}

		return result;
	};

	return stack;
}
