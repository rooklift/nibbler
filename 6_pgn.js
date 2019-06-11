"use strict";

function LoadPGN(o) {

	let startpos;

	if (o.tags.FEN && o.tags.SetUp === "1") {
		startpos = LoadFEN(o.tags.FEN);
	} else {
		startpos = LoadFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
	}

	let node = NewTree(startpos);

	let lines = o.movetext.split("\n");
	lines = lines.map(s => s.trim());

	let all_tokens = [];

	for (let line of lines) {
		let tokens = line.split(" ");
		tokens = tokens.filter(s => s !== "");
		tokens = tokens.map(s => s.trim());
		all_tokens = all_tokens.concat(tokens);
	}

	for (let token of all_tokens) {

		if (token === "1/2-1/2" || token === "1-0" || token === "0-1" || token === "*") {
			break;
		}

		if (token.endsWith(".")) {
			continue;
		}

		if (token.startsWith("$")) {
			continue;
		}

		let [move, error] = node.get_board().parse_pgn(token);

		if (error !== "") {
			throw `${token} -- ${error}`;
		}

		node = node.make_move(move);
	}

	return node.get_root();
}

function new_pgn_record() {
	return {
		tags: Object.create(null),
		movetext: ""
	};
}

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
	let b = 0;

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

function PreParsePGN(buf) {

	// Returns an array of the pgn_record objects, of at least length 1.

	let lines = split_buffer(buf);
	let current_movetext = new_byte_pusher();
	let games = [new_pgn_record()];

	let inside_brace = false;				// {} are comments
	let parentheses_depth = 0;				// () are variations
	
	for (let rawline of lines) {

		if (rawline.length === 0) {
			continue;
		}

		if (rawline[0] === 37) {			// Percent % sign is a special comment type.
			continue;
		}

		if (inside_brace === false && rawline[0] === 91) {			// Opening square bracket [ means this is a TAG line.

			if (current_movetext.length > 0) {

				// We have movetext already, so this must be a new game.
				// Write the found movetext to the object...

				games[games.length - 1].movetext = current_movetext.string();

				// And start a new one.

				games.push(new_pgn_record());
				current_movetext = new_byte_pusher();
			}

			// Parse the tag line...

			let line = decoder.decode(rawline).trim();

			if (line.endsWith("]")) {

				line = line.slice(1, line.length - 1);		// So now it's like:		Foo "bar etc"

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

		} else {								// This is a MOVETEXT line.

			if (current_movetext.length > 0) {
				current_movetext.push(32);		// Add a space to what we have.
			}

			for (let i = 0; i < rawline.length; i++) {

				let c = rawline[i];

				if (c === 123) {				// The opening brace {
					inside_brace = true;
					continue;
				}

				if (inside_brace) {
					if (c === 125) {			// The closing brace }
						inside_brace = false;
					}
					continue;
				}

				if (c === 40) {					// The opening parenthesis (
					parentheses_depth++;
					continue;
				}

				if (parentheses_depth > 0) {
					if (c === 41) {				// The closing parenthesis )
						parentheses_depth--;
					}
					continue;
				}

				// So, we are not in a brace nor a parenthesis...

				current_movetext.push(c);
			}
		}
	}

	if (current_movetext.length > 0 && games[games.length - 1].movetext === "") {
		games[games.length - 1].movetext = current_movetext.string();
	}

	return games;
}

function SavePGN(filename, startpos, moves) {

	let tags = [
		`[Event "Nibbler Line"]`,
		`[Site "The fevered dreams of a neural net"]`,
		`[Date "1970.01.01"]`,
		`[Round "1"]`,
		`[White "White"]`,
		`[Black "Black"]`,
		`[Result "*"]`
	];

	let board = startpos;
	let start_fen = board.fen();

	if (start_fen !== "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1") {
		tags.push(`[FEN "${start_fen}"]`);
		tags.push(`[SetUp "1"]`);
	}

	let move_items = [];

	for (let move of moves) {
		if (board.active === "w") {
			move_items.push(`${board.fullmove}.`);		// The move number e.g. "1."
		}
		move_items.push(board.nice_string(move));		// The nice move e.g. "Bxf7+"
		board = board.move(move);
	}

	let move_lines = [];
	let s = "";

	for (let move of move_items) {

		if (s.length + move.length > 80) {
			move_lines.push(s);
			s = "";
		}

		s += " " + move;
	}

	s += " *";
	move_lines.push(s);

	move_lines = move_lines.map(s => s.trim());

	let final_string = tags.join("\n") + "\n\n" + move_lines.join("\n") + "\n";

	fs.writeFileSync(filename, final_string);
}

function NewPGNLoader(buf) {
	
	let lines = split_buffer(buf);

	let node = NewTree();
	let roots = [];
	roots.push(node);

	let inside_brace = false;			// {} are comments. Braces do not nest.

	let callstack = [];					// When a parenthesis "(" opens, we record the node to "return" to later, on the "callstack".

	let token = new_byte_pusher();

	for (let rawline of lines) {

		if (rawline.length === 0) {
			continue;
		}

		if (rawline[0] === 37) {		// Percent % sign is a special comment type.
			continue;
		}

		if (inside_brace === false && rawline[0] === 91) {			// Opening square bracket [ means this is a TAG line.

			if (node.parent) {

				// Our current node has a parent, therefore the game has moves.
				// So this [ character must indicate a new game...

				node = NewTree();
				roots.push(node);
			}

			// Parse the tag line...

			let line = decoder.decode(rawline).trim();

			if (line.endsWith("]")) {

				line = line.slice(1, line.length - 1);				// So now it's like:		Foo "bar etc"

				let quote_i = line.indexOf(`"`);

				if (quote_i === -1) {
					continue;
				}

				let key = line.slice(0, quote_i).trim();
				let value = line.slice(quote_i + 1).trim();

				if (value.endsWith(`"`)) {
					value = value.slice(0, value.length - 1);
				}

				value = SafeString(value);							// Escape evil characters. IMPORTANT!

				if (!node.tags) {
					node.tags = Object.create(null);
				}

				node.tags[key] = value;
			}

		} else {													// This is a MOVETEXT line.

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
						node = NewTree();
						roots.push(node);
						continue;
					}

					// Probably an actual move...

					let [move, error] = node.get_board().parse_pgn(s);

					if (error !== "") {
						throw `"${s}" -- ${error}`;
					}

					node = node.make_move(move);
					console.log(move, node);
				}
			}
		}
	}

	// Ensure all roots have some tags object.

	for (let root of roots) {
		if (!root.tags) {
			root.tags = Object.create(null);
		}
	}

	// Delete empty game that we may well have started.

	if (roots[roots.length - 1].children.length === 0) {
		roots = roots.slice(0, roots.length - 1);
	}

	console.log(roots.length);

	return roots;
}
