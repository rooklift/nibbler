"use strict";

function make_renderer() {

	let renderer = Object.create(null);

	renderer.active_square = null;						// Square clicked by user.
	renderer.versus = "";								// Colours that Leela is "playing".
	renderer.ever_received_info = false;				// When false, we write stderr log instead of move info.
	renderer.stderr_log = "";							// All output received from the engine's stderr.
	renderer.pgn_choices = null;						// All games found when opening a PGN file.
	renderer.mousex = null;								// Raw mouse X on the canvas, e.g. between 0 and 640.
	renderer.mousey = null;								// Raw mouse Y on the canvas, e.g. between 0 and 640.
	renderer.one_click_moves = New2DArray(8, 8);		// 2D array of [x][y] --> move string or null.

	renderer.movelist_handler = NewMovelistHander();	// Object that deals with the movelist at the bottom.
	renderer.infobox_handler = NewInfoboxHandler();		// Object that deals with the infobox on the right.
	renderer.info_table = NewInfoTable();				// Holds info about the engine evaluations.
	renderer.node = NewTree();							// Our current place in the current tree.

	fenbox.value = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

	// --------------------------------------------------------------------------------------------

	renderer.position_changed = (new_game_flag) => {

		renderer.info_table.clear();

		renderer.escape();
		renderer.movelist_handler.draw(renderer.node);
		fenbox.value = renderer.node.fen();

		if (renderer.leela_should_go()) {
			renderer.go(new_game_flag);
		} else {
			renderer.halt();
		}
	};

	renderer.set_versus = (s) => {
		renderer.versus = s;
		renderer.infobox_handler.draw(renderer, true);			// true so the draw is not wrongly skipped
		if (renderer.leela_should_go()) {
			renderer.go();
		} else {
			renderer.halt();
		}
	};

	renderer.move = (s) => {		// It is safe to call this with illegal moves.

		if (typeof s !== "string") {
			console.log(`renderer.move(${s}) - bad argument`);
			return false;
		}

		let board = renderer.node.get_board();

		// Add promotion if needed and not present...

		if (s.length === 4) {
			let source = Point(s.slice(0, 2));
			if (board.piece(source) === "P" && source.y === 1) {
				console.log(`Move ${s} was promotion but had no promotion piece set; adjusting to ${s + "q"}`);
				s += "q";
			}
			if (board.piece(source) === "p" && source.y === 6) {
				console.log(`Move ${s} was promotion but had no promotion piece set; adjusting to ${s + "q"}`);
				s += "q";
			}
		}

		// The promised legality check...

		let illegal_reason = board.illegal(s);
		if (illegal_reason !== "") {
			console.log(`renderer.move(${s}) - ${illegal_reason}`);
			return false;
		}

		renderer.node = renderer.node.make_move(s);
		renderer.position_changed();
		return true;
	};

	renderer.play_info_index = (n) => {
		let info_list = renderer.info_table.sorted();
		if (n >= 0 && n < info_list.length) {
			renderer.move(info_list[n].move);
		}
	};

	renderer.prev = () => {
		if (renderer.node.parent) {
			renderer.node = renderer.node.parent;
			renderer.position_changed();
		}
	};

	renderer.next = () => {							// FIXME? Doesn't remember current line.
		if (renderer.node.children.length > 0) {
			renderer.node = renderer.node.children[0];
			renderer.position_changed();
		}
	};

	renderer.goto_root = () => {
		let root = renderer.node.get_root();
		if (renderer.node !== root) {
			renderer.node = root;
			renderer.position_changed();
		}
	};

	renderer.goto_end = () => {
		let end = renderer.node.get_end();
		if (renderer.node !== end) {
			renderer.node = end;
			renderer.position_changed();
		}
	};

	renderer.return_to_main_line = () => {

		let root = renderer.node.get_root();
		let main_line = root.future_history();
		let history = renderer.node.history();

		let node = root;

		for (let n = 0; n < history.length; n++) {
			if (main_line[n] !== history[n]) {
				break;
			}
			if (node.children.length === 0) {
				break;
			}
			node = node.children[0];
		}

		if (renderer.node !== node) {
			renderer.node = node;
			renderer.position_changed();
		}
	};

	renderer.promote_to_main_line = () => {
		renderer.node.promote_to_main_line();
		renderer.movelist_handler.draw(renderer.node);
	};

	renderer.delete_move = () => {

		if (!renderer.node.parent) {
			return;
		}

		renderer.node = renderer.node.detach();
		renderer.position_changed();
	};

	renderer.load_fen = (s) => {

		if (s.trim() === renderer.node.get_board().fen()) {
			return;
		}

		let newpos;

		try {
			newpos = LoadFEN(s);
		} catch (err) {
			alert(err);
			return;
		}

		renderer.node = NewTree(newpos);
		renderer.position_changed(true);
	};

	renderer.new_game = () => {
		renderer.node = NewTree();
		renderer.position_changed(true);
	};

	// --------------------------------------------------------------------------------------------
	// PGN...

	renderer.save = (filename) => {
		SavePGN(filename, renderer.node);
	};

	renderer.open = (filename) => {
		let buf = fs.readFileSync(filename);
		renderer.load_pgn_buffer(buf);
	};

	renderer.load_pgn_from_string = (s) => {
		let buf = Buffer.from(s);
		renderer.load_pgn_buffer(buf);
	};

	renderer.load_pgn_buffer = (buf) => {

		let new_pgn_choices = PreParsePGN(buf);

		if (new_pgn_choices.length === 1) {
			let success = renderer.load_pgn_object(new_pgn_choices[0]);
			if (success) {
				renderer.pgn_choices = new_pgn_choices;		// We only want to set this to a 1 value array if it actually worked.
			}
		} else {
			renderer.pgn_choices = new_pgn_choices;			// Setting it to a multi-value array is "always" OK.
			renderer.show_pgn_chooser();					// Now we need to have the user choose a game.
		}
	};

	renderer.load_pgn_object = (o) => {						// Returns true or false - whether this actually succeeded.

		let new_root;

		try {
			new_root = LoadPGNRecord(o);
		} catch (err) {
			alert(err);
			return false;
		}

		renderer.node = new_root;
		renderer.position_changed(true);

		return true;
	};

	renderer.show_pgn_chooser = () => {

		if (!renderer.pgn_choices) {
			alert("No PGN loaded");
			return;
		}

		renderer.set_versus("");		// It's lame to run the GPU when we're clearly switching games.

		let lines = [];

		let max_ordinal_length = renderer.pgn_choices.length.toString().length;
		let padding = "";
		for (let n = 0; n < max_ordinal_length - 1; n++) {
			padding += "&nbsp;";
		}

		for (let n = 0; n < renderer.pgn_choices.length; n++) {

			if (n === 9 || n === 99 || n === 999 || n === 9999 || n === 99999 || n === 999999) {
				padding = padding.slice(0, padding.length - 6);
			}

			let p = renderer.pgn_choices[n];

			let s;

			if (p.tags.Result === "1-0") {
				s = `${padding}${n + 1}. <span class="blue">${p.tags.White}</span> - ${p.tags.Black}`;
			} else if (p.tags.Result === "0-1") {
				s = `${padding}${n + 1}. ${p.tags.White} - <span class="blue">${p.tags.Black}</span>`;
			} else {
				s = `${padding}${n + 1}. ${p.tags.White} - ${p.tags.Black}`;
			}

			if (p.tags.Opening) {
				s += `  <span class="gray">(${p.tags.Opening})</span>`;
			}

			lines.push(`<li id="chooser_${n}">${s}</li>`);
		}

		pgnchooser.innerHTML = "<ul>" + lines.join("") + "</ul>";
		pgnchooser.style.display = "block";
	};

	renderer.hide_pgn_chooser = () => {
		pgnchooser.style.display = "none";
	};

	renderer.pgnchooser_click = (event) => {

		let n;

		for (let item of event.path) {
			if (typeof item.id === "string" && item.id.startsWith("chooser_")) {
				n = parseInt(item.id.slice(8), 10);
				break;
			}
		}

		if (n === undefined) {
			return;
		}

		if (renderer.pgn_choices && n >= 0 && n < renderer.pgn_choices.length) {
			renderer.load_pgn_object(renderer.pgn_choices[n]);
		}
	};

	renderer.validate_pgn = (filename) => {
		let buf = fs.readFileSync(filename);		// i.e. binary buffer object
		let pgn_list = PreParsePGN(buf);

		for (let n = 0; n < pgn_list.length; n++) {

			let o = pgn_list[n];

			try {
				LoadPGNRecord(o);
			} catch (err) {
				alert(`Game ${n + 1} - ${err.toString()}`);
				return false;
			}
		}

		alert(`This file seems OK. ${pgn_list.length} ${pgn_list.length === 1 ? "game" : "games"} checked.`);
		return true;
	};

	// --------------------------------------------------------------------------------------------
	// Engine stuff...

	renderer.leela_should_go = () => {
		return renderer.versus.includes(renderer.node.get_board().active);
	};

	renderer.receive = (s) => {
		if (s.startsWith("info")) {
			renderer.ever_received_info = true;
			renderer.info_table.receive(s, renderer.node.get_board());
		}
		if (s.startsWith("error")) {
			renderer.err_receive(s);
		}
	};

	renderer.err_receive = (s) => {
		if (s.indexOf("WARNING") !== -1 || s.indexOf("error") !== -1) {
			renderer.stderr_log += `<span class="red">${s}</span><br>`;
		} else {
			renderer.stderr_log += `${s}<br>`;
		}
	};

	renderer.halt = () => {
		send("stop");
	};

	renderer.go = (new_game_flag) => {

		renderer.hide_pgn_chooser();

		send("stop");
		if (new_game_flag) {
			send("ucinewgame");
		}

		let start_fen = renderer.node.get_root().fen();

		let setup;
		if (start_fen === "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1") {
			setup = "startpos";
		} else {
			setup = `fen ${start_fen}`;
		}

		send(`position ${setup} moves ${renderer.node.history().join(" ")}`);
		sync();																		// See comment on how sync() works
		send("go infinite");
	};

	renderer.reset_leela_cache = () => {
		if (renderer.leela_should_go()) {
			renderer.go(true);
		} else {
			send("ucinewgame");
		}
	};

	renderer.switch_weights = (filename) => {
		renderer.set_versus("");
		setoption("WeightsFile", filename);
	};

	renderer.set_cpuct = (val) => {
		setoption("CPuct", val);
		renderer.set_versus(renderer.versus);		// Restart the search.
	};

	// --------------------------------------------------------------------------------------------
	// Visual stuff...

	renderer.square_size = () => {
		return config.board_size / 8;
	};

	renderer.escape = () => {						// Set things into a clean state.
		renderer.hide_pgn_chooser();
		renderer.active_square = null;
		renderer.draw();
	};

	renderer.toggle_debug_css = () => {
		let ss = document.styleSheets[0];
		let i = 0;
		for (let rule of Object.values(ss.cssRules)) {
			if (rule.selectorText && rule.selectorText === "*") {
				ss.deleteRule(i);
				return;
			}
			i++;
		}
		ss.insertRule("* {outline: 1px dotted red;}");
	};

	// --------------------------------------------------------------------------------------------
	// Clickers... (except the PGN clicker, which is in the PGN section).

	renderer.mouse_to_point = (mousex, mousey) => {

		// Assumes mousex and mousey are relative to canvas top left.

		if (typeof mousex !== "number" || typeof mousey !== "number") {
			return null;
		}

		let rss = renderer.square_size();

		let boardx = Math.floor(mousex / rss);
		let boardy = Math.floor(mousey / rss);

		if (boardx < 0 || boardy < 0 || boardx > 7 || boardy > 7) {
			return null;
		}

		if (config.flip) {
			boardx = 7 - boardx;
			boardy = 7 - boardy;
		}

		return Point(boardx, boardy);
	};

	renderer.canvas_click = (event) => {

		let p = renderer.mouse_to_point(event.offsetX, event.offsetY);
		if (!p) {
			return;
		}

		let ocm = renderer.one_click_moves[p.x][p.y];
		let board = renderer.node.get_board();

		if (!renderer.active_square && ocm) {
			renderer.move(ocm);
			return;
		}

		if (renderer.active_square) {

			let move = renderer.active_square.s + p.s;		// e.g. "e2e4" - note promotion char is handled by renderer.move()
			renderer.active_square = null;

			let success = renderer.move(move);		// move() will draw if it succeeds...
			if (!success) {
				renderer.draw();					// ... but if it doesn't, we draw to show the active_square cleared.
			}

			return;

		} else {

			if (board.active === "w" && board.is_white(p)) {
				renderer.active_square = p;
			}
			if (board.active === "b" && board.is_black(p)) {
				renderer.active_square = p;
			}
		}

		renderer.draw();
	};

	renderer.infobox_click = (event) => {

		let moves = renderer.infobox_handler.moves_from_click(event);

		if (!moves || moves.length === 0) {
			return;
		}

		// Legality checks... best to assume nothing.

		let tmp_board = renderer.node.get_board();
		for (let move of moves) {
			if (tmp_board.illegal(move) !== "") {
				return;
			}
			tmp_board = tmp_board.move(move);
		}

		for (let move of moves) {
			renderer.node = renderer.node.make_move(move);
		}
		renderer.position_changed();
	};

	renderer.movelist_click = (event) => {

		let node = renderer.movelist_handler.node_from_click(event);

		if (!node || node.get_root() !== renderer.node.get_root()) {
			return;
		}

		renderer.node = node;
		renderer.position_changed();
	};

	// --------------------------------------------------------------------------------------------

	renderer.canvas_coords = (x, y) => {

		// Given the x, y coordinates on the board (a8 is 0, 0)
		// return an object with the canvas coordinates for
		// the square, and also the centre. Also has rss.
		//
		//      x1,y1--------
		//        |         |
		//        |  cx,cy  |
		//        |         |
		//        --------x2,y2

		let rss = renderer.square_size();
		let x1 = x * rss;
		let y1 = y * rss;
		let x2 = x1 + rss;
		let y2 = y1 + rss;

		if (config.flip) {
			[x1, x2] = [(rss * 8) - x2, (rss * 8) - x1];
			[y1, y2] = [(rss * 8) - y2, (rss * 8) - y1];
		}

		let cx = x1 + rss / 2;
		let cy = y1 + rss / 2;

		return {x1, y1, x2, y2, cx, cy, rss};
	};

	renderer.draw_board = (light, dark) => {

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				if (x % 2 === y % 2) {
					context.fillStyle = light;
				} else {
					context.fillStyle = dark;
				}

				let cc = renderer.canvas_coords(x, y);

				if (renderer.active_square === Point(x, y)) {
					context.fillStyle = config.active_square;
				}

				context.fillRect(cc.x1, cc.y1, cc.rss, cc.rss);
			}
		}
	};

	renderer.draw_piece = (o) => {
		let cc = renderer.canvas_coords(o.x, o.y);
		context.drawImage(images[o.piece], cc.x1, cc.y1, cc.rss, cc.rss);
	};

	renderer.draw_arrow_line = (o) => {		// Doesn't draw the arrowhead
		let cc1 = renderer.canvas_coords(o.x1, o.y1);
		let cc2 = renderer.canvas_coords(o.x2, o.y2);
		context.strokeStyle = o.colour;
		context.fillStyle = o.colour;
		context.beginPath();
		context.moveTo(cc1.cx, cc1.cy);
		context.lineTo(cc2.cx, cc2.cy);
		context.stroke();
	};

	renderer.draw_head = (o) => {
		let cc = renderer.canvas_coords(o.x, o.y);
		context.fillStyle = o.colour;
		context.beginPath();
		context.arc(cc.cx, cc.cy, 12, 0, 2 * Math.PI);
		context.fill();
		context.fillStyle = "black";
		context.fillText(`${o.info.value_string(0)}`, cc.cx, cc.cy + 1);
	};

	renderer.draw_position = () => {

		context.lineWidth = 8;
		context.textAlign = "center";
		context.textBaseline = "middle";
		context.font = config.board_font;

		let pieces = [];
		let board = renderer.node.get_board();

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				if (board.state[x][y] === "") {
					continue;
				}
				pieces.push({
					fn: renderer.draw_piece,
					piece: board.state[x][y],
					colour: board.state[x][y].toUpperCase() === board.state[x][y] ? "w" : "b",
					x: x,
					y: y
				});
			}
		}

		let info_list = renderer.info_table.sorted();

		let arrows = [];
		let heads = Object.create(null);

		// Clear our 2D array of one-click moves.
		// We will shortly update it with valid ones.
		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				renderer.one_click_moves[x][y] = null;
			}
		}

		if (info_list.length > 0) {

			let best_nodes = info_list[0].n;
			
			for (let i = 0; i < info_list.length; i++) {

				let [x1, y1] = XY(info_list[i].move.slice(0, 2));
				let [x2, y2] = XY(info_list[i].move.slice(2, 4));

				if (info_list[i].n >= best_nodes * config.node_display_threshold) {

					let loss = 0;

					if (typeof info_list[0].value === "number" && typeof info_list[i].value === "number") {
						loss = info_list[0].value - info_list[i].value;
					}

					let colour;

					if (i === 0) {
						colour = config.best_colour;
					} else if (loss > config.terrible_move_threshold) {
						colour = config.terrible_colour;
					} else if (loss > config.bad_move_threshold) {
						colour = config.bad_colour;
					} else {
						colour = config.good_colour;
					}

					arrows.push({
						fn: renderer.draw_arrow_line,
						colour: colour,
						x1: x1,
						y1: y1,
						x2: x2,
						y2: y2
					});

					// We only draw the best ranking for each particular target square.
					// At the same time, the square becomes available for one-click
					// movement; we set the relevant info in renderer.one_click_moves.

					if (heads[info_list[i].move.slice(2, 4)] === undefined) {
						heads[info_list[i].move.slice(2, 4)] = {
							fn: renderer.draw_head,
							colour: colour,
							info: info_list[i],
							x: x2,
							y: y2
						};
						renderer.one_click_moves[x2][y2] = info_list[i].move;
					}
				}
			}
		}

		// It looks best if the longest arrows are drawn underneath. Manhattan distance is good enough.

		arrows.sort((a, b) => {
			if (Math.abs(a.x2 - a.x1) + Math.abs(a.y2 - a.y1) < Math.abs(b.x2 - b.x1) + Math.abs(b.y2 - b.y1)) {
				return 1;
			}
			if (Math.abs(a.x2 - a.x1) + Math.abs(a.y2 - a.y1) > Math.abs(b.x2 - b.x1) + Math.abs(b.y2 - b.y1)) {
				return -1;
			}
			return 0;
		});

		let drawables = [];

		for (let o of pieces) {
			if (o.colour !== board.active) {
				drawables.push(o);
			}
		}

		drawables = drawables.concat(arrows);

		for (let o of pieces) {
			if (o.colour === board.active) {
				drawables.push(o);
			}
		}

		drawables = drawables.concat(Object.values(heads));

		for (let o of drawables) {
			o.fn(o);
		}
	};

	renderer.draw = () => {

		// Not using requestAnimationFrame the normal way. But it still
		// may make the "animation" smoother, I think.

		requestAnimationFrame(() => {
			renderer.infobox_handler.draw(renderer);
			renderer.draw_board(config.light_square, config.dark_square);
			renderer.draw_position();
		});
	};

	renderer.draw_loop = () => {
		renderer.draw();
		setTimeout(renderer.draw_loop, config.update_delay);
	};

	return renderer;
}
