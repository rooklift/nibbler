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

// Restores what a move's comment says about its analysis and clock. The [%eval] goes into the parent position's
// table, which is where engine lines for that move go, so the graph and the move list show it straight away.
function ApplyPgnAnalysis(node, parsed) {

	if (parsed.clock !== null) {
		node.clock_after = parsed.clock;
	}

	if (!parsed.evaluation || !node.parent) {
		return;
	}

	let parent = node.parent;
	let ev = parsed.evaluation;
	let white_to_move = parent.board.active === "w";
	let info = NewInfo(parent.board, node.move);

	info.__from_pgn = true;
	info.__touched = true;
	info.depth = ev.depth;

	if (ev.mate !== null) {
		let mate = white_to_move ? ev.mate : -ev.mate;		// Engine lines are from the side to move, as here
		info.mate = mate;
		info.cp = mate > 0 ? 32000 : -32000;
		info.q = mate > 0 ? 1 : -1;
	} else {
		let cp = white_to_move ? ev.cp : -ev.cp;
		info.cp = cp;
		info.q = QfromPawns(cp / 100);
	}

	parent.table.moveinfo[node.move] = info;
	parent.table.version++;
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
	let brace_comment = new_byte_pusher();

	let callstack = [];					// When a parenthesis "(" opens, we record the node to "return" to later, on the "callstack".

	let token = new_byte_pusher();
	let pending_comment_before = "";
	let pending_graphics_before = {
		user_arrows: [],
		user_highlights: [],
	};
	let last_significant_was_move = false;

	let finished = false;

	function append_comment_text(target, field, text) {
		if (!text) {
			return;
		}
		if (target[field]) {
			target[field] += " " + text;
		} else {
			target[field] = text;
		}
	}

	function append_graphics(target, graphics) {
		if (graphics.user_arrows.length > 0) {
			target.user_arrows = target.user_arrows.concat(graphics.user_arrows);
		}
		if (graphics.user_highlights.length > 0) {
			target.user_highlights = target.user_highlights.concat(graphics.user_highlights);
		}
	}

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
				brace_comment.reset();
				continue;
			}

			if (inside_brace) {
				if (c === 125) {								// The closing brace }
					inside_brace = false;

					let raw_comment = decoder.decode(brace_comment.bytes()).trim();
					let parsed_comment = ParsePgnGraphicsComment(raw_comment);
					let target_is_after_move = last_significant_was_move && node && node.move;

					if (target_is_after_move) {
						ApplyPgnAnalysis(node, parsed_comment);
						let text_after = parsed_comment.text;
						if (parsed_comment.evaluation && IsPgnStatsText(text_after)) {
							text_after = "";					// Nibbler's own summary of the [%eval], which make_stats() writes again on export.
						}
						append_comment_text(node, "comment_after", text_after);
						append_graphics(node, parsed_comment);
					} else {
						if (parsed_comment.text) {
							pending_comment_before = pending_comment_before ? pending_comment_before + " " + parsed_comment.text : parsed_comment.text;
						}
						append_graphics(pending_graphics_before, parsed_comment);
					}
				} else {
					brace_comment.push(c);
				}
				continue;
			}

			if (c === 40) {										// The opening parenthesis (
				callstack.push(node);
				node = node.parent;								// Unplay the last move.
				last_significant_was_move = false;
				continue;
			}

			if (c === 41) {										// The closing parenthesis )
				node = callstack[callstack.length - 1];
				callstack = callstack.slice(0, -1);
				last_significant_was_move = false;
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

					if (s.startsWith("$")) {
						// NAGs describe the preceding move or the position after it.
						if (/^\$\d+$/.test(s) && last_significant_was_move && node && node.move) {
							let nag = Number(s.slice(1));
							if (position_annotations.find(nag)) {
								node.position_nag = nag;
							} else {
								let move_quality = [null, "!", "?", "!!", "??", "!?", "?!"];
								if (move_quality[nag]) node.annotation = move_quality[nag];
							}
						}
						continue;
					}
					if (s === "" || s === "+" || StringIsNumeric(s)) {
					// Useless token.
					continue;
				}

				if (s === "1/2-1/2" || s === "1-0" || s === "0-1" || s === "*") {
					finished = true;
					break;
				}

				// Probably an actual move...

				let annotation = "";
				[s, annotation] = SplitPgnAnnotationSuffix(s);

				if (s === "") {
					// A glyph written as its own word, e.g. "e4 !?", belongs to the move before it.
					if (annotation && last_significant_was_move && node.move) {
						node.annotation = PgnAnnotationSuffix(annotation) || null;
					}
					continue;
				}

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
				if (pending_comment_before !== "") {
					node.comment_before = pending_comment_before;
					pending_comment_before = "";
				}
				if (pending_graphics_before.user_arrows.length > 0) {
					node.user_arrows = pending_graphics_before.user_arrows;
					pending_graphics_before.user_arrows = [];
				}
				if (pending_graphics_before.user_highlights.length > 0) {
					node.user_highlights = pending_graphics_before.user_highlights;
					pending_graphics_before.user_highlights = [];
				}
				node.annotation = PgnAnnotationSuffix(annotation) || null;
				last_significant_was_move = true;
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
