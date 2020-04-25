"use strict";

function clear_graph() {
	while (graph.lastChild) {
	    graph.removeChild(graph.lastChild);
	}
}

function draw_winrate(node) {

	clear_graph();

	let width = graph.getBoundingClientRect().right - graph.getBoundingClientRect().left;
	let height = graph.getBoundingClientRect().bottom - graph.getBoundingClientRect().top;

	add_line(0, height / 2, width, height / 2, "#6cccee", 1, true);

	let eval_list = node.future_eval_history();

	let last_x = null;
	let last_y = null;

	for (let n = 0; n < eval_list.length; n++) {

		let e = eval_list[n];

		if (e !== null) {

			let x = width * n / eval_list.length;
			let y = (1 - e) * 100;

			if (last_x !== null) {
				add_line(last_x, last_y, x, y, "white", 2, false);
			}

			last_x = x;
			last_y = y;
		}
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
