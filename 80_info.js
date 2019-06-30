"use strict";

function NewInfoHandler() {

	let ih = Object.create(null);

	ih.table = Object.create(null);			// Map of move (e.g. "e2e4") --> info object.
	ih.board = null;
	ih.version = 0;							// Incremented on any change.
	ih.nodes = 0;							// Stat sent by engine.
	ih.nps = 0;								// Stat sent by engine.

	ih.ever_received_info = false;
	ih.stderr_log = "";

	ih.one_click_moves = New2DArray(8, 8);	// Array of possible one-click moves. Updated by draw_arrows().
	ih.info_clickers = [];					// Elements in the infobox. Updated by draw_infobox().

	ih.last_highlight_dest = null;			// Used to skip redraws.
	ih.last_drawn_version = null;			// Used to skip redraws.

	ih.clear = function(board) {
		if (!board) {
			throw "ih.clear(): need board";
		}
		this.table = Object.create(null);
		this.board = board;
		this.version++;
		this.nodes = 0;
		this.nps = 0;
	};

	ih.err_receive = function(s) {

		if (typeof s !== "string") {
			return;
		}

		if (this.stderr_log.length > 50000) {
			return;
		}

		if (s.includes("WARNING") || s.includes("error")) {
			this.stderr_log += `<span class="red">${s}</span><br>`;
		} else {
			this.stderr_log += `${s}<br>`;
		}
	};

	ih.receive = function(s, board) {

		if (typeof s !== "string" || !board) {
			return;
		}

		// We use the board to check legality (only of the first move in the PV,
		// later moves are checked if we ever try to use them.)

		if (this.board !== board) {
			console.log("ih.receive(): Received unexpected board.");
			return;
		}

		if (s.startsWith("info") && s.includes(" pv ")) {

			this.ever_received_info = true;
			this.version++;

			// info depth 13 seldepth 48 time 5603 nodes 67686 score cp 40 hashfull 204 nps 12080 tbhits 0 multipv 2
			// pv d2d4 g8f6 c2c4 e7e6 g2g3 f8b4 c1d2 b4e7 g1f3 e8g8 d1c2 a7a6 f1g2 b7b5 e1g1 c8b7 f1c1 b7e4 c2d1 b5c4 c1c4 a6a5 d2e1 h7h6 c4c1 d7d6

			let move = InfoVal(s, "pv");
			let move_info;

			if (this.table[move]) {						// We already have move info for this move.
				move_info = this.table[move];
			} else {									// We don't.
				if (board.illegal(move) !== "") {
					Log(`... Nibbler: invalid move received!: ${move}`);
					return;
				}
				move_info = new_info(board, move);
				this.table[move] = move_info;
			}

			let tmp;

			tmp = parseInt(InfoVal(s, "cp"), 10);		// Score in centipawns
			if (Number.isNaN(tmp) === false) {
				move_info.cp = tmp;				
			}

			tmp = parseInt(InfoVal(s, "multipv"), 10);	// Leela's ranking of the move, starting at 1
			if (Number.isNaN(tmp) === false) {
				move_info.multipv = tmp;
			}

			tmp = parseInt(InfoVal(s, "nodes"), 10);
			if (Number.isNaN(tmp) === false) {
				this.nodes = tmp;
			}

			tmp = parseInt(InfoVal(s, "nps"), 10);
			if (Number.isNaN(tmp) === false) {
				this.nps = tmp;
			}

			let new_pv = InfoPV(s);

			if (new_pv.length > 0) {
				if (CompareArrays(new_pv, move_info.pv) === false) {
					move_info.nice_pv_cache = null;
					move_info.pv = new_pv;
				}
			}

		} else if (s.startsWith("info string")) {

			this.ever_received_info = true;
			this.version++;

			// info string d2d4  (293 ) N:   12845 (+121) (P: 20.10%) (Q:  0.09001) (D:  0.000) (U: 0.02410) (Q+U:  0.11411) (V:  0.1006)

			let move = InfoVal(s, "string");

			let move_info;

			if (this.table[move]) {						// We already have move info for this move.
				move_info = this.table[move];
			} else {									// We don't.
				if (board.illegal(move) !== "") {
					Log(`... Nibbler: invalid move received!: ${move}`);
					return;
				}
				move_info = new_info(board, move);
				this.table[move] = move_info;
			}

			let tmp;

			tmp = parseInt(InfoVal(s, "N:"), 10);
			if (Number.isNaN(tmp) === false) {
				move_info.n = tmp;
			}

			tmp = parseFloat(InfoVal(s, "(D:"));
			if (Number.isNaN(tmp) === false) {
				move_info.d = tmp;
			}

			tmp = parseFloat(InfoVal(s, "(U:"));
			if (Number.isNaN(tmp) === false) {
				move_info.u = tmp;
			}

			tmp = parseFloat(InfoVal(s, "(Q+U:"));
			if (Number.isNaN(tmp) === false) {
				move_info.q_plus_u = tmp;
			}

			move_info.p = InfoVal(s, "(P:");			// Worst case here is just empty string, which is OK.

			tmp = parseFloat(InfoVal(s, "(Q:"));
			if (Number.isNaN(tmp) === false) {
				move_info.q = tmp;
			}
		}
	};

	ih.sorted = function() {

		let info_list = [];

		for (let o of Object.values(this.table)) {
			info_list.push(o);
		}

		info_list.sort((a, b) => {

			// node count - higher is better...

			if (a.n < b.n) {
				return 1;
			}
			if (a.n > b.n) {
				return -1;
			}

			// centipawn score - higher is better...

			if (a.cp < b.cp) {
				return 1;
			}
			if (a.cp > b.cp) {
				return -1;
			}

			// MultiPV ranking is not reliable since we might have searchmoves,
			// however we can at least use it as a final tie-break.

			if (a.multipv < b.multipv) {
				return -1;
			}
			if (a.multipv > b.multipv) {
				return 1;
			}

			return 0;
		});

		return info_list;
	};

	ih.must_draw_infobox = function() {
		this.last_drawn_version = null;
	};

	ih.draw_infobox = function(mouse_point, active_square, leela_should_go, active_colour, searchmoves) {

		if (config.search_nodes !== "infinite" && (searchmoves.length === 1)) {

			statusbox.innerHTML = `<span class="yellow">Node limit with exactly ONE searchmove might not return data.</span>`;

		} else {

			let status_string = "";

			if (leela_should_go === false) {
				status_string += `<span class="yellow">${config.versus === "" ? "HALTED " : "YOUR MOVE "}</span>`;
			}

			status_string += `<span class="gray">Nodes: ${NString(this.nodes)}, N/s: ${NString(this.nps)}</span>`;

			if (typeof config.search_nodes === "number" && this.nodes > config.search_nodes) {
				status_string += ` <span class="blue">(limit exceeded)</span>`;
			}

			statusbox.innerHTML = status_string;
		}

		// Display stderr and return if we've never seen any info...

		if (!this.ever_received_info) {
			if (this.stderr_log.length > 0) {
				infobox.innerHTML = this.stderr_log;
			}
			return;
		}

		// By default we're highlighting nothing...
		let highlight_dest = null;
		let one_click_move = "__none__";

		// But if the hovered square actually has a one-click move available, highlight its variation,
		// unless we have an active (i.e. clicked) square...
		if (mouse_point && mouse_point !== Point(null) && this.one_click_moves[mouse_point.x][mouse_point.y] && !active_square) {
			highlight_dest = mouse_point;
			one_click_move = this.one_click_moves[mouse_point.x][mouse_point.y];
		}

		// Maybe we can skip drawing the infobox, and just return...

		if (this.last_drawn_version === this.version) {
			if (this.last_highlight_dest === highlight_dest) {
				return;
			}
		}

		this.last_highlight_dest = highlight_dest;
		this.last_drawn_version = this.version;

		// OK I guess we're drawing...

		let info_list = this.sorted();
		let elements = [];								// Not HTML elements, just our own objects.

		for (let i = 0; i < info_list.length; i++) {

			let new_elements = [];

			let info = info_list[i];

			let value_string = "?";
			if (config.show_cp) {
				let cp = info.cp;
				if (config.cp_white_pov && active_colour === "b") {
					cp = 0 - cp;
				}
				value_string = (cp / 100).toFixed(2);
				if (cp > 0) {
					value_string = "+" + value_string;
				}
			} else {
				value_string = info.value_string(1) + "%";
			}

			if (config.searchmoves_buttons) {
				if (ArrayIncludes(searchmoves, info.move)) {
					new_elements.push({
						class: "yellow",
						text: "focused: ",
						searchmove: info.move,
					});
				} else {
					new_elements.push({
						class: "gray",
						text: "focus? ",
						searchmove: info.move,
					});
				}
			}

			new_elements.push({
				class: "blue",
				text: value_string + " ",
			});

			let colour = active_colour;

			let nice_pv = info.nice_pv();

			for (let n = 0; n < nice_pv.length; n++) {
				let nice_move = nice_pv[n];
				let element = {
					class: colour === "w" ? "white" : "pink",
					text: nice_move + " ",
					move: info.pv[n],
				};
				if (nice_move.includes("O-O")) {
					element.class += " nobr";
				}
				new_elements.push(element);
				colour = OppositeColour(colour);
			}

			let extra_stat_strings = [];

			if (config.show_n) {
				if (typeof info.n === "number" && typeof this.nodes === "number" && this.nodes > 0) {
					extra_stat_strings.push(`N: ${(100 * info.n / this.nodes).toFixed(2)}%`);
				} else {
					extra_stat_strings.push(`N: ?`);
				}
			}

			if (config.show_p) {
				extra_stat_strings.push(`P: ${info.p}`);
			}

			if (config.show_q) {
				if (typeof info.q === "number") {
					extra_stat_strings.push(`Q: ${info.q.toFixed(3)}`);
				} else {
					extra_stat_strings.push(`Q: ?`);
				}
			}

			if (config.show_u) {
				if (typeof info.u === "number" && info.n > 0) {						// Checking n is correct.
					extra_stat_strings.push(`U: ${info.u.toFixed(3)}`);
				} else {
					extra_stat_strings.push(`U: ?`);
				}
			}

			if (config.show_q_plus_u) {
				if (typeof info.q_plus_u === "number" && info.n > 0) {				// Checking n is correct.
					extra_stat_strings.push(`Q+U: ${info.q_plus_u.toFixed(5)}`);
				} else {
					extra_stat_strings.push(`Q+U: ?`);
				}
			}

			if (extra_stat_strings.length > 0) {
				new_elements.push({
					class: "gray",
					text: "(" + extra_stat_strings.join(", ") + ")"
				});
			}

			if (info.move === one_click_move) {
				for (let e of new_elements) {
					e.class += " redback";
				}
			}

			if (new_elements.length > 0) {					// Always true.
				new_elements[new_elements.length - 1].text += "<br><br>";
			}

			elements = elements.concat(new_elements);
		}

		// Generate the new innerHTML for the infobox <div>

		let new_inner_parts = [];

		for (let n = 0; n < elements.length; n++) {
			let part = `<span id="infobox_${n}" class="${elements[n].class}">${elements[n].text}</span>`;
			new_inner_parts.push(part);
		}

		// Setting innerHTML is performant. Direct DOM manipulation is worse, somehow.
		// This does have the disadvantage that there's possibly some flicker when
		// using a :hover CSS selector, I find.

		infobox.innerHTML = new_inner_parts.join("");

		// And save our elements so that we know what clicks mean.

		this.info_clickers = elements;						// We actually only need the move or its absence in each object. Meh.
	};

	ih.moves_from_click = function(event) {
		let n = EventPathN(event, "infobox_");
		return this.moves_from_click_n(n);
	};

	ih.moves_from_click_n = function(n) {

		if (typeof n !== "number") {
			return [];
		}

		// This is a bit icky, it relies on the fact that our clickers list
		// has some objects that lack a move property (the blue info bits).

		if (!this.info_clickers || n < 0 || n >= this.info_clickers.length) {
			return [];
		}

		let move_list = [];

		// Work backwards until we get to the start of the line...

		for (; n >= 0; n--) {
			let element = this.info_clickers[n];
			if (!element || !element.move) {
				break;
			}
			move_list.push(element.move);
		}

		move_list.reverse();

		return move_list;
	};

	ih.searchmove_from_click = function(event) {

		let n = EventPathN(event, "infobox_");
		if (typeof n !== "number") {
			return null;
		}

		if (!this.info_clickers || n < 0 || n >= this.info_clickers.length) {
			return null;
		}

		if (this.info_clickers[n].searchmove) {
			return this.info_clickers[n].searchmove;
		}

		return null;
	};

	ih.draw_arrows = function() {

		context.lineWidth = 8;
		context.textAlign = "center";
		context.textBaseline = "middle";
		context.font = config.board_font;

		let arrows = [];
		let heads = [];

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				this.one_click_moves[x][y] = null;
			}
		}

		let info_list = this.sorted();

		if (info_list.length > 0) {
			
			for (let i = 0; i < info_list.length; i++) {

				if (info_list[i].u < config.uncertainty_cutoff || i === 0) {

					let [x1, y1] = XY(info_list[i].move.slice(0, 2));
					let [x2, y2] = XY(info_list[i].move.slice(2, 4));

					let loss = 0;

					if (typeof info_list[0].q === "number" && typeof info_list[i].q === "number") {
						loss = info_list[0].value() - info_list[i].value();
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
						colour: colour,
						x1: x1,
						y1: y1,
						x2: x2,
						y2: y2,
						info: info_list[i]
					});

					if (!this.one_click_moves[x2][y2]) {
						this.one_click_moves[x2][y2] = info_list[i].move;
						heads.push({
							colour: colour,
							x2: x2,
							y2: y2,
							info: info_list[i]
						});
					}
				}
			}
		}

		// It looks best if the longest arrows are drawn underneath. Manhattan distance is good enough.
		// For the sake of displaying the best pawn promotion (of the 4 possible), sort ties are broken
		// by winrate, with lower winrates drawn first.

		arrows.sort((a, b) => {
			if (Math.abs(a.x2 - a.x1) + Math.abs(a.y2 - a.y1) < Math.abs(b.x2 - b.x1) + Math.abs(b.y2 - b.y1)) {
				return 1;
			}
			if (Math.abs(a.x2 - a.x1) + Math.abs(a.y2 - a.y1) > Math.abs(b.x2 - b.x1) + Math.abs(b.y2 - b.y1)) {
				return -1;
			}
			if (a.info.n < b.info.n) {
				return -1;
			}
			if (a.info.n > b.info.n) {
				return 1;
			}
			return 0;
		});

		for (let o of arrows) {
			let cc1 = CanvasCoords(o.x1, o.y1);
			let cc2 = CanvasCoords(o.x2, o.y2);
			context.strokeStyle = o.colour;
			context.fillStyle = o.colour;
			context.beginPath();
			context.moveTo(cc1.cx, cc1.cy);
			context.lineTo(cc2.cx, cc2.cy);
			context.stroke();
		}

		for (let o of heads) {
			let cc2 = CanvasCoords(o.x2, o.y2);
			context.fillStyle = o.colour;
			context.beginPath();
			context.arc(cc2.cx, cc2.cy, 12, 0, 2 * Math.PI);
			context.fill();
			context.fillStyle = "black";

			let s = "?";

			switch (config.arrowhead_type) {
			case 0:
				s = o.info.value_string(0);
				break;
			case 1:
				if (this.nodes <= 0) {
					s = "?";
					break;
				}
				s = (100 * o.info.n / this.nodes).toFixed(0);
				break;
			case 2:
				let pstr = o.info.p;
				if (pstr.endsWith("%")) {
					pstr = pstr.slice(0, pstr.length - 1);
				}
				let p = parseFloat(pstr);
				if (Number.isNaN(p) === false) {
					s = p.toFixed(0);
				}
				break;
			case 3:
				s = o.info.multipv;
				break;
			default:
				s = "!";
				break;
			}

			context.fillText(s, cc2.cx, cc2.cy + 1);
		}
	};

	return ih;
}

// --------------------------------------------------------------------------------------------

const info_prototype = {

	nice_pv: function() {

		// Human readable moves. Since there's no real guarantee that our
		// moves list is legal, we legality check them.

		if (this.nice_pv_cache) {
			return Array.from(this.nice_pv_cache);
		}

		let tmp_board = this.board;

		if (!this.pv || this.pv.length === 0) {		// Should be impossible.
			this.pv = [this.move];
		}

		let ret = [];

		for (let move of this.pv) {
			if (tmp_board.illegal(move) !== "") {
				break;
			}
			ret.push(tmp_board.nice_string(move));
			tmp_board = tmp_board.move(move);
		}

		this.nice_pv_cache = ret;
		return Array.from(this.nice_pv_cache);
	},

	value: function() {								// Rescale Q to 0..1 range.

		if (typeof this.q !== "number") {
			return 0;
		}

		if (this.q < -1) {
			return 0;
		}

		if (this.q > 1) {
			return 1;
		}

		return (this.q + 1) / 2;
	},

	value_string: function(dp) {

		// Reminder: if we ever go back to supporting winrate_as_q (i.e. -100 to 100 scale) we will need
		// to remember NOT to show it that way when putting stats into a node in "Serious" Mode.

		if (typeof this.q !== "number") {
			return "?";
		}
		return (this.value() * 100).toFixed(dp);
	}
};

function new_info(board, move) {

	// In some places elsewhere we might assume these things will have sensible values, so
	// better not initialise most things to null. Best to use neutral-ish values, especially
	// since some info (cp and q) can be carried (inverted) into the next step of a line...

	let info = Object.create(info_prototype);
	info.board = board;
	info.cp = 0;
	info.d = 0;
	info.move = move;
	info.multipv = 1;
	info.n = 0;
	info.p = "?";					// Note we receive P as a string, unlike the other stuff.
	info.pv = [];
	info.nice_pv_cache = null;
	info.q = 0;
	info.q_plus_u = 1;
	info.u = 1;
	return info;
}
