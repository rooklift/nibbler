"use strict";

function split_buffer(buf) {

	// Split a binary buffer into an array of binary buffers corresponding to lines.

	let lines = [];

	let push = (arr) => {
		if (arr.length > 0 && arr[arr.length - 1] === 13) {		// Discard \r
			lines.push(arr.slice(0, arr.length - 1));
		} else {
			lines.push(arr);
		}
	};

	let a = 0;
	let b;

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

		bytes: function() {
			return this.storage.slice(0, this.length);
		},

		string: function() {
			return decoder.decode(this.bytes());
		}
	};
}

function new_pgn_record() {
	return {
		tags: Object.create(null),
		movebufs: []
	};
}

function PreParsePGN(buf) {

	// Returns an array of pgn_record objects which have
	//		- a tags object
	//		- a movebuf list which contains the movetext lines for that game, as a binary buffer.

	let games = [new_pgn_record()];
	let lines = split_buffer(buf);

	for (let rawline of lines) {

		if (rawline.length === 0) {
			continue;
		}

		if (rawline[0] === 37) {			// Percent % sign is a special comment type.
			continue;
		}

		if (rawline[0] === 91) {			// This is probably a TAG line...... FIXME: might catch [ inside a comment. Hmm.

			if (games[games.length - 1].movebufs.length > 0) {
				// We have movetext already, so this must be a new game. Start it.
				games.push(new_pgn_record());
			}

			// Parse the tag line...

			let line = decoder.decode(rawline).trim();

			if (line.endsWith("]")) {

				line = line.slice(1, line.length - 1);						// So now it's like:		Foo "bar etc"

				let quote_i = line.indexOf(`"`);

				if (quote_i === -1) {
					continue;
				}

				let key = line.slice(0, quote_i).trim();
				let value = line.slice(quote_i + 1).trim();

				if (value.endsWith(`"`)) {
					value = value.slice(0, value.length - 1);
				}

				games[games.length - 1].tags[key] = SafeString(value);		// Escape evil characters. IMPORTANT!
			}

		} else {

			games[games.length - 1].movebufs.push(rawline);

		}
	}

	return games;
}

function LoadPGNRecord(o) {

	let startpos;

	if (o.tags.FEN && o.tags.SetUp === "1") {
		startpos = LoadFEN(o.tags.FEN);
	} else {
		startpos = LoadFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
	}

	let root = NewTree(startpos);
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
				callstack = callstack.slice(0, callstack.length - 1);
				continue;
			}

			// So, we are not in a brace nor a parenthesis...

			token.push(c);

			// It the current token complete?

			let peek = rawline[i + 1];

			if (
			peek === undefined		||			// end of line
			peek <= 32				||			// whitespace
			peek === 40				||			// (
			peek === 41				||			// )
			peek === 46				||			// .
			peek === 123) {						// {

				let initial_s = token.string();
				let s = initial_s.trim();

				token = new_byte_pusher();			// For the next round.

				// Parse s.

				if (s === "" || s.endsWith(".") || s.startsWith("$") || peek === 46) {
					// Useless token.
					continue;
				}

				if (s === "1/2-1/2" || s === "1-0" || s === "0-1" || s === "*") {
					finished = true;
					break;
				}

				// Probably an actual move...

				let [move, error] = node.get_board().parse_pgn(s);

				if (error !== "") {
					throw `"${s}" -- ${error}`;
				}

				node = node.make_move(move);
			}
		}

		if (finished) {
			break;
		}
	}

	// Add a tags property into the root.

	root.tags = Object.create(null);

	for (let key of Object.keys(o.tags)) {
		root.tags[key] = o.tags[key];
	}

	return root;
}


function SavePGN(filename, node) {

	let tags = [
		`[Event "Nibbler Line"]`,
		`[Site "The fevered dreams of a neural net"]`,
		`[Date "1970.01.01"]`,
		`[Round "1"]`,
		`[White "White"]`,
		`[Black "Black"]`,
		`[Result "*"]`
	];

	node = node.get_root();

	let startpos = node.get_board();
	let board = startpos;
	let start_fen = board.fen();

	if (start_fen !== "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1") {
		tags.push(`[FEN "${start_fen}"]`);
		tags.push(`[SetUp "1"]`);
	}

	let s = StringPGN(node);

	let final = tags.join("\n") + "\n\n" + s + "\n";

	fs.writeFileSync(filename, final);
}

function StringPGN(node) {

	node = node.get_root();
	let tokens = [];
	write_tree(node, tokens, false, true);
	tokens.push("*");

	// Now it's all about wrapping to 80 chars...

	let lines = [];
	let line = "";

	for (let token of tokens) {
		if (line.length + token.length > 79) {
			lines.push(line);
			line = token;
		} else {
			if (line.length > 0) {
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

function write_tree(node, tokens, skip_self_flag, force_number_string) {

	if (node.move && node.parent && !skip_self_flag) {
		if (node.parent.get_board().active === "w" || force_number_string) {
			tokens.push(node.parent.get_board().next_number_string());
		}
		tokens.push(node.nice_move());
	}

	if (node.children.length === 0) {
		return;
	}

	if (node.children.length === 1) {
		write_tree(node.children[0], tokens, false, false);
		return;
	}

	let main_child = node.children[0];

	if (node.get_board().active === "w") {
		tokens.push(node.get_board().next_number_string());
	}
	tokens.push(main_child.nice_move());

	for (let child of node.children.slice(1)) {
		tokens.push("(");
		write_tree(child, tokens, false, true);
		tokens.push(")");
	}

	write_tree(main_child, tokens, true, false);
}
