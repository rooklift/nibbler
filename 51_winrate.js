"use strict";

function NewGrapher() {

	let grapher = Object.create(null);

	grapher.clear_graph = function() {
		while (graph.lastChild) {
			graph.removeChild(graph.lastChild);
		}
	};

	grapher.draw = function(node) {

		// FIXME: draw only occasionally, i.e. once a second, unless position in tree changes.

		this.clear_graph();

		let width = graph.getBoundingClientRect().right - graph.getBoundingClientRect().left;
		let height = graph.getBoundingClientRect().bottom - graph.getBoundingClientRect().top;

		// Horizontal (50%) line...
		this.add_line(0, height / 2, width, height / 2, "#666666", 1, true, true);

		let eval_list = node.future_eval_history();

		if (eval_list.length < 2) {
			return;
		}

		let last_x = null;
		let last_y = null;
		let last_n = null;

		let imaginary_length = 2048;

		for (let n of [128, 256, 512, 1024]) {
			if (eval_list.length < n) {
				imaginary_length = n;
				break;
			}
		}

		for (let n = 0; n < eval_list.length; n++) {

			let e = eval_list[n];

			if (e !== null) {

				let x = width * n / (imaginary_length);

				let y = (1 - e) * height;
				if (y < 1) y = 1;
				if (y > height - 2) y = height - 2;

				let interp = n - last_n !== 1;

				if (last_x !== null) {
					this.add_line(last_x, last_y, x, y, interp ? "#999999" : "white", 2, interp, false);
				}

				last_x = x;
				last_y = y;
				last_n = n;
			}
		}

		// Vertical position line...
		let depth = node.depth();
		this.add_line(width * depth / imaginary_length, height / 2 - 3, width * depth / imaginary_length, 0, "#6cccee", 1, true, true);
		this.add_line(width * depth / imaginary_length, height / 2 + 2, width * depth / imaginary_length, height, "#6cccee", 1, true, true);
	};

	grapher.add_line = function(x1, y1, x2, y2, colour, stroke_width, dashed, crisp) {
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
		graph.appendChild(element);
	};

	return grapher;
}
