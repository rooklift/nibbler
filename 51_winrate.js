"use strict";

function clear_graph() {
	while (graph.lastChild) {
	    graph.removeChild(graph.lastChild);
	}
}

function draw_winrate(node) {

	// FIXME: draw only occasionally, i.e. once a second, unless position in tree changes.

	clear_graph();

	let width = graph.getBoundingClientRect().right - graph.getBoundingClientRect().left;
	let height = graph.getBoundingClientRect().bottom - graph.getBoundingClientRect().top;

	// add_line(0, height / 2, width, height / 2, "#6cccee", 1, true);

	let eval_list = node.future_eval_history();

	if (eval_list.length < 2) {
		return;
	}

	let last_x = null;
	let last_y = null;
	let last_n = null;

	for (let n = 0; n < eval_list.length; n++) {

		let e = eval_list[n];

		if (e !== null) {

			let x = width * n / (eval_list.length - 1);
			let y = (1 - e) * height;

			let interp = n - last_n !== 1;

			if (last_x !== null) {
				add_line(last_x, last_y, x, y, interp ? "#666666" : "white", 2, interp);
			}

			last_x = x;
			last_y = y;
			last_n = n;
		}
	}

	let depth = node.depth();

	if (depth !== 0 && depth !== eval_list.length - 1) {
		add_line(width * depth / (eval_list.length - 1), 0, width * depth / (eval_list.length - 1), height, "#6cccee", 1, true);
	}
}

function add_line(x1, y1, x2, y2, colour, stroke_width, dashed) {
	let element = document.createElementNS("http://www.w3.org/2000/svg", "line");
	element.setAttributeNS(null, "x1", x1);
	element.setAttributeNS(null, "y1", y1);
	element.setAttributeNS(null, "x2", x2);
	element.setAttributeNS(null, "y2", y2);
	element.setAttributeNS(null, "stroke", colour);
	element.setAttributeNS(null, "stroke-width", stroke_width);
	if (dashed) {
		element.setAttributeNS(null, "stroke-dasharray", "4");
	}
	graph.appendChild(element);

}
