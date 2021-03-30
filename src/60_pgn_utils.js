"use strict";

function split_buffer(buf) {

	// Split a binary buffer into an array of binary buffers corresponding to lines.

	let lines = [];

	let push = (arr) => {
		if (arr.length > 0 && arr[arr.length - 1] === 13) {		// Discard \r
			lines.push(Buffer.from(arr.slice(0, -1)));
		} else {
			lines.push(Buffer.from(arr));
		}
	};

	let a = 0;
	let b;

	if (buf.length > 3 && buf[0] === 239 && buf[1] === 187 && buf[2] === 191) {
		a = 3;			// 1st slice will skip byte order mark (BOM).
	}

	for (b = 0; b < buf.length; b++) {
		let ch = buf[b];
		if (ch === 10) {					// Split on \n
			let line = buf.slice(a, b);
			push(line);
			a = b + 1;
		}
	}

	if (a !== b) {		// We haven't added the last line before EOF.
		let line = buf.slice(a, b);
		push(line);
	}

	return lines;
}

function new_byte_pusher(size) {

	if (!size || size <= 0) {
		size = 16;
	}

	// I bet Node has something like this, but I didn't read the docs.

	return {

		storage: new Uint8Array(size),
		length: 0,							// Both the length and also the next index to write to.

		push: function(c) {
			if (this.length >= this.storage.length) {
				let new_storage = new Uint8Array(this.storage.length * 2);
				for (let n = 0; n < this.storage.length; n++) {
					new_storage[n] = this.storage[n];
				}
				this.storage = new_storage;
			}
			this.storage[this.length] = c;
			this.length++;
		},

		reset: function() {
			this.length = 0;
		},

		bytes: function() {
			return this.storage.slice(0, this.length);
		},

		string: function() {
			return decoder.decode(this.bytes());
		}
	};
}

function new_pgndata(buf, indices) {		// Made by the PGN file loader. Used by the hub.

	let ret = {buf, indices};

	ret.count = function() {
		return this.indices.length;
	};

	ret.getrecord = function(n) {
		if (typeof n !== "number" || n < 0 || n >= this.indices.length) {
			return null;
		}
		return PreParsePGN(this.buf.slice(this.indices[n], this.indices[n + 1]));		// if n + 1 is out-of-bounds, still works.
	};

	ret.string = function(n) {
		if (typeof n !== "number" || n < 0 || n >= this.indices.length) {
			return "";
		}
		return this.buf.slice(this.indices[n], this.indices[n + 1]).toString();			// For debugging.
	};

	return ret;
}

// ------------------------------------------------------------------------------------------------------------------------------

function SavePGN(filename, node) {
	let s = make_pgn_string(node);
	try {
		fs.writeFileSync(filename, s);
	} catch (err) {
		alert(err);
	}
}

function PGNToClipboard(node) {
	let s = make_pgn_string(node);
	clipboard.writeText(s);
}

// ------------------------------------------------------------------------------------------------------------------------------

function make_pgn_string(node) {

	let root = node.get_root();
	let start_fen = root.board.fen(true);

	if (!root.tags) {							// This should be impossible.
		root.tags = Object.create(null);
	}

	// Let's set the Result tag if possible...

	let main_line_end = root.get_end();
	let terminal_reason = main_line_end.terminal_reason();

	if (terminal_reason === "") {
		// Pass - leave it unchanged since we know nothing
	} else if (terminal_reason === "Checkmate") {
		root.tags.Result = main_line_end.board.active === "w" ? "0-1" : "1-0";
	} else {
		root.tags.Result = "1/2-1/2";
	}

	// Convert tag object to PGN formatted strings...

	let tags = [];

	for (let t of ["Event", "Site", "Date", "Round", "White", "Black", "Result"]) {
		if (root.tags[t]) {
			tags.push(`[${t} "${root.tags[t]}"]`);
		}
	}

	if (start_fen !== "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1") {
		if (root.board.normalchess === false) {
			tags.push(`[Variant "Chess960"]`);
		}
		tags.push(`[FEN "${start_fen}"]`);
		tags.push(`[SetUp "1"]`);
	}

	let movetext = make_movetext(root);
	let final = tags.join("\n") + "\n\n" + movetext + "\n";
	return final;
}

function make_movetext(node) {

	let root = node.get_root();
	let ordered_nodes = get_ordered_nodes(root);

	let tokens = [];

	for (let item of ordered_nodes) {

		if (item === root) continue;

		// As it stands, item could be a "(" or ")" string, or an actual node...

		if (typeof item === "string") {
			tokens.push(item);
		} else {
			let item_token = item.token(true);
			let subtokens = item_token.split(" ").filter(z => z !== "");
			for (let subtoken of subtokens) {
				tokens.push(subtoken);
			}
		}
	}

	if (root.tags && root.tags.Result) {
		tokens.push(root.tags.Result);
	} else {
		tokens.push("*");
	}

	// Now it's all about wrapping to 80 chars...

	let lines = [];
	let line = "";

	for (let token of tokens) {
		if (line.length + token.length > 79) {
			if (line !== "") {
				lines.push(line);
			}
			line = token;
		} else {
			if (line.length > 0 && line.endsWith("(") === false && token !== ")") {
				line += " ";
			}
			line += token;
		}
	}
	if (line !== "") {
		lines.push(line);
	}

	return lines.join("\n");
}

// The following is to order the nodes into the order they would be written
// to screen or PGN. The result does contain root, which shouldn't be drawn.
//
// As a crude hack, the list also contains "(" and ")" elements to indicate
// where brackets should be drawn.

function get_ordered_nodes(node) {
	let list = [];
	__order_nodes(node, list, false);
	return list;
}

function __order_nodes(node, list, skip_self_flag) {

	// Write this node itself...

	if (!skip_self_flag) {
		list.push(node);
	}

	// Write descendents as long as there's no branching,
	// or return if we reach a node with no children.

	while (node.children.length === 1) {
		node = node.children[0];
		list.push(node);
	}

	if (node.children.length === 0) {
		return;
	}

	// So multiple child nodes exist...

	let main_child = node.children[0];
	list.push(main_child);

	for (let child of node.children.slice(1)) {
		list.push("(");
		__order_nodes(child, list, false);
		list.push(")");
	}

	__order_nodes(main_child, list, true);
}
