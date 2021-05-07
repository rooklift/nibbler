"use strict";

function NewGrapher() {

	let grapher = Object.create(null);

	grapher.clear_graph = function() {

		let boundingrect = graph.getBoundingClientRect();
		let width = window.innerWidth - boundingrect.left - 16;
		let height = boundingrect.bottom - boundingrect.top;

		// This clears the canvas...

		graph.width = width;
		graph.height = height;
	};

	grapher.draw = function(node, force) {
		if (config.graph_height <= 0) {
			return;
		}
		this.draw_everything(node);
	};

	grapher.draw_everything = function(node) {

		this.clear_graph();
		let width = graph.width;		// After the above.
		let height = graph.height;

		let eval_list = node.future_eval_history();

		this.draw_50_percent_line(width, height);
		this.draw_position_line(eval_list.length, node);

		// We make lists of contiguous edges that can be drawn at once...

		let runs = this.make_runs(eval_list, width, height, node.graph_length_knower.val);

		// Draw our normal runs...

		graphctx.strokeStyle = "white";
		graphctx.lineWidth = config.graph_line_width;
		graphctx.setLineDash([]);

		for (let run of runs.normal_runs) {
			graphctx.beginPath();
			graphctx.moveTo(run[0].x1, run[0].y1);
			for (let edge of run) {
				graphctx.lineTo(edge.x2, edge.y2);
			}
			graphctx.stroke();
		}

		// Draw our dashed runs...

		graphctx.strokeStyle = "#999999";
		graphctx.lineWidth = config.graph_line_width;
		graphctx.setLineDash([config.graph_line_width, config.graph_line_width]);

		for (let run of runs.dashed_runs) {
			graphctx.beginPath();
			graphctx.moveTo(run[0].x1, run[0].y1);
			for (let edge of run) {
				graphctx.lineTo(edge.x2, edge.y2);
			}
			graphctx.stroke();
		}
	};

	grapher.make_runs = function(eval_list, width, height, graph_length) {

		// Returns an object with 2 arrays (normal_runs and dashed_runs).
		// Each of those is an array of arrays of contiguous edges that can be drawn at once.

		let all_edges = [];

		let last_x = null;
		let last_y = null;
		let last_n = null;

		// This loop creates all edges that we are going to draw, and marks each
		// edge as dashed or not...

		for (let n = 0; n < eval_list.length; n++) {

			let e = eval_list[n];

			if (e !== null) {

				let x = width * n / graph_length;

				let y = (1 - e) * height;
				if (y < 1) y = 1;
				if (y > height - 2) y = height - 2;

				if (last_x !== null) {
					all_edges.push({
						x1: last_x,
						y1: last_y,
						x2: x,
						y2: y,
						dashed: n - last_n !== 1,
					});
				}

				last_x = x;
				last_y = y;
				last_n = n;
			}
		}

		// Now we make runs of contiguous edges that share a style...

		let normal_runs = [];
		let dashed_runs = [];

		let run = [];
		let current_meta_list = normal_runs;	// Will point at normal_runs or dashed_runs.

		for (let edge of all_edges) {
			if ((edge.dashed && current_meta_list !== dashed_runs) || (!edge.dashed && current_meta_list !== normal_runs)) {
				if (run.length > 0) {
					current_meta_list.push(run);
				}
				current_meta_list = edge.dashed ? dashed_runs : normal_runs;
				run = [];
			}
			run.push(edge);
		}
		if (run.length > 0) {
			current_meta_list.push(run);
		}

		return {normal_runs, dashed_runs};
	};

	grapher.draw_50_percent_line = function(width, height) {

		// Avoid anti-aliasing... (FIXME: we assumed graph size was even)
		let pixel_y_adjustment = config.graph_line_width % 2 === 0 ? 0 : -0.5;

		graphctx.strokeStyle = "#666666";
		graphctx.lineWidth = config.graph_line_width;
		graphctx.setLineDash([config.graph_line_width, config.graph_line_width]);
		graphctx.beginPath();
		graphctx.moveTo(0, height / 2 + pixel_y_adjustment);
		graphctx.lineTo(width, height / 2 + pixel_y_adjustment);
		graphctx.stroke();
	};

	grapher.draw_position_line = function(eval_list_length, node) {

		if (eval_list_length < 2) {
			return;
		}

		let width = graph.width;
		let height = graph.height;

		// Avoid anti-aliasing with x value, line up with 50 percent line (above) with y value...
		let pixel_x_adjustment = config.graph_line_width % 2 === 0 ? 0 : 0.5;
		let pixel_y_adjustment = config.graph_line_width % 2 === 0 ? 0 : -0.5;

		let x = Math.floor(width * node.depth / node.graph_length_knower.val) + pixel_x_adjustment;

		graphctx.strokeStyle = node.is_main_line() ? "#6cccee" : "#ffff00";
		graphctx.lineWidth = config.graph_line_width;
		graphctx.setLineDash([config.graph_line_width, config.graph_line_width]);

		graphctx.beginPath();
		graphctx.moveTo(x, height / 2 + pixel_y_adjustment - config.graph_line_width - 1);
		graphctx.lineTo(x, 0);
		graphctx.stroke();

		graphctx.beginPath();
		graphctx.moveTo(x, height / 2 + pixel_y_adjustment + config.graph_line_width + 1);
		graphctx.lineTo(x, height);
		graphctx.stroke();
	};

	grapher.node_from_click = function(node, event) {

		if (!event || config.graph_height <= 0) {
			return null;
		}

		let mousex = event.offsetX;
		if (typeof mousex !== "number") {
			return null;
		}

		let width = graph.width;
		if (typeof width !== "number" || width < 1) {
			return null;
		}

		let node_list = node.future_node_history();
		if (node_list.length === 0) {
			return null;
		}

		// OK, everything is valid...

		let click_depth = Math.round(node.graph_length_knower.val * mousex / width);

		if (click_depth < 0) click_depth = 0;
		if (click_depth >= node_list.length) click_depth = node_list.length - 1;

		return node_list[click_depth];
	};

	return grapher;
}
