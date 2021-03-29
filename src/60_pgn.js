"use strict";

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

function LoadPGNRecord(o) {				// Can throw, either by itself, or by allowing a throw from LoadFEN to propagate.

	let startpos;

	if (o.tags.FEN) {					// && o.tags.SetUp === "1"  - but some writers don't do this.
		try {
			startpos = LoadFEN(o.tags.FEN);
		} catch (err) {
			throw err;					// Rethrow - the try/catch here is just to be explicit about this case.
		}
	} else {
		startpos = LoadFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
	}

	let root = NewRoot(startpos);
	let node = root;

	let inside_brace = false;			// {} are comments. Braces do not nest.

	let callstack = [];					// When a parenthesis "(" opens, we record the node to "return" to later, on the "callstack".

	let token = new_byte_pusher();

	let finished = false;

	for (let rawline of o.movebufs) {

		if (rawline.length === 0) {
			continue;
		}

		if (rawline[0] === 37) {		// Percent % sign is a special comment type.
			continue;
		}

		for (let i = 0; i < rawline.length; i++) {

			// Note that, when adding characters to our current token, we peek forwards
			// to check if it's the end of the token. Therefore, it's safe for these
			// special characters to fire a continue immediately.

			let c = rawline[i];

			if (c === 123) {									// The opening brace { for a comment
				inside_brace = true;
				continue;
			}

			if (inside_brace) {
				if (c === 125) {								// The closing brace }
					inside_brace = false;
				}
				continue;
			}

			if (c === 40) {										// The opening parenthesis (
				callstack.push(node);
				node = node.parent;								// Unplay the last move.
				continue;
			}

			if (c === 41) {										// The closing parenthesis )
				node = callstack[callstack.length - 1];
				callstack = callstack.slice(0, -1);
				continue;
			}

			// So...

			token.push(c);

			// Is the current token complete?
			// We'll start a new token when we see any of the following...

			let peek = rawline[i + 1];

			if (
			peek === undefined		||			// end of line
			peek <= 32				||			// whitespace
			peek === 40				||			// (
			peek === 41				||			// )
			peek === 46				||			// .
			peek === 123) {						// {

				let s = token.string().trim();
				token.reset();					// For the next round.

				// The above conditional means "." can only appear as the first character.

				if (s[0] === ".") {
					s = s.slice(1);
				}

				// Parse s.

				if (s === "" || s.startsWith("$") || StringIsNumeric(s)) {
					// Useless token.
					continue;
				}

				if (s === "1/2-1/2" || s === "1-0" || s === "0-1" || s === "*") {
					finished = true;
					break;
				}

				// Probably an actual move...

				let [move, error] = node.board.parse_pgn(s);

				if (error) {
					DestroyTree(root);
					throw `"${s}" -- ${error}`;
				}

				node = node.make_move(move, true);
			}
		}

		if (finished) {
			break;
		}
	}

	// Save all tags into the root.

	if (!root.tags) {
		root.tags = Object.create(null);
	}
	for (let key of Object.keys(o.tags)) {
		root.tags[key] = o.tags[key];
	}

	return root;
}

// -------------------------------------------------------------------------

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
