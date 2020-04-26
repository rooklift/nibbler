"use strict";

// FIXME: click on graph to go to the move.

function NewGrapher() {

	let grapher = Object.create(null);

	grapher.last_drawn_board = null;
	grapher.last_draw_time = -10000;
	grapher.last_position_marker_x = null;

	grapher.clear_graph = function() {

		let boundingrect = graph.getBoundingClientRect();
		let width = boundingrect.right - boundingrect.left;
		let height = boundingrect.bottom - boundingrect.top;
		
		// FIXME - check that the following lines auto-blank the canvas!

		graph.width = width;
		graph.height = height;
	}

	grapher.imaginary_length = function(real_length) {

		for (let n of [128, 256, 512, 1024]) {
			if (real_length <= n) {
				return n;
			}
		}

		return 2048;
	};

	grapher.draw = function(node, force) {
		if (force || performance.now() - grapher.last_draw_time > 500) {
			this.draw_everything(node);
		} else {
			this.clear_position_line();
			this.draw_position_line(node.future_eval_history().length, node);
		}
	}

	grapher.draw_everything = function(node) {

		this.last_drawn_board = node.get_board();
		this.last_draw_time = performance.now();

		this.clear_graph();
		let width = graph.width;		// After the above.
		let height = graph.height;

		// Horizontal (50%) line, drawn at -0.5 y to avoid anti-aliasing...
		this.add_line(0, height / 2 - 0.5, width, height / 2 - 0.5, "#666666", 1, true);

		let eval_list = node.future_eval_history();
		let imaginary_length = grapher.imaginary_length(eval_list.length);

		let last_x = null;
		let last_y = null;
		let last_n = null;

		for (let n = 0; n < eval_list.length; n++) {

			let e = eval_list[n];

			if (e !== null) {

				let x = width * n / imaginary_length;

				let y = (1 - e) * height;
				if (y < 1) y = 1;
				if (y > height - 2) y = height - 2;

				let interp = n - last_n !== 1;

				if (last_x !== null) {
					this.add_line(last_x, last_y, x, y, interp ? "#999999" : "white", 2, interp);
				}

				last_x = x;
				last_y = y;
				last_n = n;
			}
		}

		this.draw_position_line(eval_list.length, node);
	};

	grapher.draw_position_line = function(eval_list_length, node) {

		if (!node.parent) {
			return;
		}

		let width = graph.width;
		let height = graph.height;
		let imaginary_length = grapher.imaginary_length(eval_list_length);
		let depth = node.depth();
		let colour = node.is_main_line() ? "#6cccee" : "#ffff00";

		let x = Math.floor(width * depth / imaginary_length) + 0.5;

		this.add_line(x, height / 2 - 3, x, 0, colour, 1, true);
		this.add_line(x, height / 2 + 2, x, height, colour, 1, true);

		this.last_position_marker_x = x;
	};

	grapher.clear_position_line = function() {

		let x = this.last_position_marker_x;

		if (x === null) {
			return;
		}

		let width = graph.width;
		let height = graph.height;

		this.add_line(x, height / 2 - 3, x, 0, "black", 1, true);
		this.add_line(x, height / 2 + 2, x, height, "black", 1, true);
	};

	grapher.add_line = function(x1, y1, x2, y2, colour, stroke_width, dashed) {

		// FIXME - delete this function.

		graphctx.strokeStyle = colour;
		graphctx.lineWidth = stroke_width;

		if (dashed) {
			graphctx.setLineDash([2, 2]);
		} else {
			graphctx.setLineDash([]);
		}

		graphctx.beginPath();
		graphctx.moveTo(x1, y1);
		graphctx.lineTo(x2, y2);
		graphctx.stroke();
	};

	return grapher;
}
