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

function new_byte_pusher() {

	// I bet Node has something like this, but I didn't read the docs.

	return {

		storage: new Uint8Array(128),
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
