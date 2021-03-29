"use strict";

function split_buffer(buf) {

	let start_time = performance.now();

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

	console.log(`PGN buffer-splitting took ${(performance.now() - start_time).toFixed(0)} ms.`);

	return lines;
}

function PreParsePGN(buf) {

	// Returns an array of pgn_record objects which have
	//		- a tags object
	//		- a movebuf list which contains the movetext lines for that game, as binary buffers.

	let games = [new_pgn_record()];
	let lines = split_buffer(buf);

	let start_time = performance.now();		// After split_buffer(), which has its own timer.

	for (let rawline of lines) {

		if (rawline.length === 0) {
			continue;
		}

		if (rawline[0] === 37) {			// Percent % sign is a special comment type.
			continue;
		}

		let tagline = "";

		if (rawline[0] === 91) {
			let s = decoder.decode(rawline).trim();
			if (s.endsWith(`"]`)) {
				tagline = s;
			}
		}

		if (tagline !== "") {

			if (games[games.length - 1].movebufs.length > 0) {
				// We have movetext already, so this must be a new game. Start it.
				games.push(new_pgn_record());
			}

			// Parse the tag line...

			tagline = tagline.slice(1, -1);								// So now it's like:		Foo "bar etc"

			let quote_i = tagline.indexOf(`"`);

			if (quote_i === -1) {
				continue;
			}

			let key = tagline.slice(0, quote_i).trim();
			let value = tagline.slice(quote_i + 1).trim();

			if (value.endsWith(`"`)) {
				value = value.slice(0, -1);
			}

			games[games.length - 1].tags[key] = SafeString(value);		// Escape evil characters. IMPORTANT!

		} else {

			games[games.length - 1].movebufs.push(rawline);

		}
	}

	console.log(`PGN pre-parsing took ${(performance.now() - start_time).toFixed(0)} ms.`);

	return games;
}
