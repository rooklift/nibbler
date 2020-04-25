"use strict";

function NewGrapher() {

	let grapher = Object.create(null);

	grapher.last_drawn_board = null;
	grapher.last_draw_time = performance.now();

	grapher.clear_graph = function() {
		while (graph.lastChild) {
			graph.removeChild(graph.lastChild);
		}
	};

	grapher.clear_pos_line = function() {

		let top = document.getElementById("graph_pos_top");
		let bottom = document.getElementById("graph_pos_bottom");

		if (top && bottom) {
			graph.removeChild(top);
			graph.removeChild(bottom);
		}
	};

	grapher.draw = function(node, force) {

		let boundingrect = graph.getBoundingClientRect();

		let width = boundingrect.right - boundingrect.left;
		let height = boundingrect.bottom - boundingrect.top;

		let eval_list = node.future_eval_history();

		let imaginary_length = 2048;

		for (let n of [128, 256, 512, 1024]) {
			if (eval_list.length < n) {
				imaginary_length = n;
				break;
			}
		}

		if (force || performance.now() - grapher.last_draw_time > 500) {

			this.last_drawn_board = node.get_board();
			this.last_draw_time = performance.now();

			this.clear_graph();

			if (eval_list.length < 2) {
				return;
			}

			// Horizontal (50%) line...
			this.add_line(0, height / 2, width, height / 2, "#666666", 1, true, true, null);

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
						this.add_line(last_x, last_y, x, y, interp ? "#999999" : "white", 2, interp, false, null);
					}

					last_x = x;
					last_y = y;
					last_n = n;
				}
			}
		} else {
			this.clear_pos_line();
		}

		// Vertical position line...
		let depth = node.depth();
		let colour = node.is_main_line() ? "#6cccee" : "#ffff00";
		this.add_line(width * depth / imaginary_length, height / 2 - 3, width * depth / imaginary_length, 0, colour, 1, true, true, "graph_pos_top");
		this.add_line(width * depth / imaginary_length, height / 2 + 2, width * depth / imaginary_length, height, colour, 1, true, true, "graph_pos_bottom");
	};

	grapher.add_line = function(x1, y1, x2, y2, colour, stroke_width, dashed, crisp, id) {
		let element = document.createElementNS("http://www.w3.org/2000/svg", "line");
		element.setAttributeNS(null, "x1", x1);
		element.setAttributeNS(null, "y1", y1);
		element.setAttributeNS(null, "x2", x2);
		element.setAttributeNS(null, "y2", y2);
		element.setAttributeNS(null, "stroke", colour);
		element.setAttributeNS(null, "stroke-width", stroke_width);
		if (dashed) {
			element.setAttributeNS(null, "stroke-dasharray", "2");
		}
		if (crisp) {
			element.setAttributeNS(null, "shape-rendering", "crispEdges");
		}
		if (id) {
			element.setAttributeNS(null, "id", id);
		}
		graph.appendChild(element);
	};

	return grapher;
}
