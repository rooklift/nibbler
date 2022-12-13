"use strict";

function new_pgn_record() {
	return {
		tags: Object.create(null),
		movebufs: []
	};
}

function PreParsePGN(buf) {								// buf should be the buffer for a single game, only.

	// Partial parse of the buffer. Generates a tags object and a list of buffers, each of which is a line
	// in the movetext. Not so sure this approach makes sense any more, if it ever did. In particular,
	// there's no really great reason why the movetext needs to be split into lines at all.
	//
	// Never fails. Always returns a valid object (though possibly containing illegal movetext).

	let game = new_pgn_record();
	let lines = split_buffer(buf);

	for (let rawline of lines) {

		if (rawline.length === 0) {
			continue;
		}

		if (rawline[0] === 37) {						// Percent % sign is a special comment type.
			continue;
		}

		let tagline;

		if (game.movebufs.length === 0) {				// If we have movetext then this can't be a tag line.
			if (rawline[0] === 91) {
				let s = decoder.decode(rawline).trim();
				if (s.endsWith(`]`)) {
					tagline = s;
				}
			}
		}

		if (tagline) {

			tagline = tagline.slice(1, -1).trim();		// So now it's like:		Foo "bar etc"

			let first_space_i = tagline.indexOf(` `);

			if (first_space_i === -1) {
				continue;
			}

			let key = tagline.slice(0, first_space_i).trim();
			let value = tagline.slice(first_space_i + 1).trim();

			if (value.startsWith(`"`)) value = value.slice(1);
			if (value.endsWith(`"`)) value = value.slice(0, -1);
			value = value.trim();

			game.tags[key] = SafeStringHTML(UnsafeStringPGN(value));		// Undo PGN escaping then add HTML escaping.

		} else {

			game.movebufs.push(rawline);

		}
	}

	return game;
}

function LoadPGNRecord(o) {				// This can throw!

	// Parse of the objects produced above, to generate a game tree.
	// Tags are placed into the root's own tags object.

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
				// Strings like "..." get decomposed to a series of "." tokens since each one terminates the token in front of it.

				if (s[0] === ".") {
					s = s.slice(1);				// s is now guaranteed not to start with "."
				}

				// Parse s.

				if (s === "" || s === "+" || s.startsWith("$") || StringIsNumeric(s)) {
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

					// If the problem specifically is one of Kd4, Ke4, Kd5, Ke5, it's probably just a DGT board thing
					// due to the kings being moved to indicate the result.

					if (s.includes("Kd4") || s.includes("Ke4") || s.includes("Kd5") || s.includes("Ke5") ||
						s.includes("Kxd4") || s.includes("Kxe4") || s.includes("Kxd5") || s.includes("Kxe5"))
					{
						finished = true;
						break;
					} else {
						DestroyTree(root);
						throw `"${s}" -- ${error}`;
					}
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
