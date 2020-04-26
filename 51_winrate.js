"use strict";

// FIXME: click on graph to go to the move.

function NewGrapher() {

	let grapher = Object.create(null);

	grapher.last_drawn_board = null;
	grapher.last_draw_time = -10000;
	grapher.last_position_marker_x = null;

	grapher.draws = 0;
	grapher.skips = 0;

	grapher.clear_graph = function() {

		let boundingrect = graph.getBoundingClientRect();
		let width = boundingrect.right - boundingrect.left;
		let height = boundingrect.bottom - boundingrect.top;
		
		// This clears the canvas...

		graph.width = width;
		graph.height = height;
	}

	grapher.imaginary_length = function(real_length) {

		// What length we'll pretend the eval list is for the sake of consistency.
		// Everything is +1 so the root node can fit with n ply.

		for (let n = 64; n < 2048; n += 64) {
			if (real_length <= n + 1) {
				return n + 1;
			}
		}

		return 2048 + 1;
	};

	grapher.draw = function(node, force) {
		if (force || performance.now() - grapher.last_draw_time > 500) {
			this.draw_everything(node);
			this.draws++;
		} else {
			this.clear_position_line();
			this.draw_position_line(node.future_eval_history().length, node);
			this.skips++;
		}
	}

	grapher.draw_everything = function(node) {

		this.clear_graph();
		let width = graph.width;		// After the above.
		let height = graph.height;

		grapher.draw_50_percent_line(width, height);

		let eval_list = node.future_eval_history();
		let imaginary_length = grapher.imaginary_length(eval_list.length);

		// We make lists of contiguous edges that can be drawn at once...

		let runs = this.make_runs(eval_list, width, height, imaginary_length);

		// Draw our normal runs...

		graphctx.strokeStyle = "white";
		graphctx.lineWidth = 2;
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
		graphctx.lineWidth = 2;
		graphctx.setLineDash([2, 2]);

		for (let run of runs.dashed_runs) {
			graphctx.beginPath();
			graphctx.moveTo(run[0].x1, run[0].y1);
			for (let edge of run) {
				graphctx.lineTo(edge.x2, edge.y2);
			}
			graphctx.stroke();
		}

		// Finish...

		this.draw_position_line(eval_list.length, node);

		this.last_drawn_board = node.get_board();
		this.last_draw_time = performance.now();
	};

	grapher.make_runs = function(eval_list, width, height, imaginary_length) {

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

				let x = width * n / imaginary_length;

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
		graphctx.strokeStyle = "#666666";
		graphctx.lineWidth = 1;
		graphctx.setLineDash([2, 2]);
		graphctx.beginPath();
		graphctx.moveTo(0, height / 2 - 0.5);
		graphctx.lineTo(width, height / 2 - 0.5);
		graphctx.stroke();
	};

	grapher.draw_position_line = function(eval_list_length, node) {

		this.last_position_marker_x = null;

		if (!node.parent) {
			return;
		}

		let width = graph.width;
		let height = graph.height;
		let imaginary_length = grapher.imaginary_length(eval_list_length);
		let depth = node.depth();

		let x = Math.floor(width * depth / imaginary_length) + 0.5;

		graphctx.strokeStyle = node.is_main_line() ? "#6cccee" : "#ffff00";
		graphctx.lineWidth = 1;
		graphctx.setLineDash([2, 2]);

		graphctx.beginPath();
		graphctx.moveTo(x, height / 2 - 3);
		graphctx.lineTo(x, 0);
		graphctx.stroke();

		graphctx.beginPath();
		graphctx.moveTo(x, height / 2 + 2);
		graphctx.lineTo(x, height);
		graphctx.stroke();

		this.last_position_marker_x = x;
	};

	grapher.clear_position_line = function() {

		// This leaves some ugly artifacts on the canvas.

		let x = this.last_position_marker_x;

		if (x === null) {
			return;
		}

		let width = graph.width;
		let height = graph.height;

		graphctx.strokeStyle = "black";
		graphctx.lineWidth = 1;
		graphctx.setLineDash([]);

		graphctx.beginPath();
		graphctx.moveTo(x, height / 2 - 3);
		graphctx.lineTo(x, 0);
		graphctx.stroke();

		graphctx.beginPath();
		graphctx.moveTo(x, height / 2 + 2);
		graphctx.lineTo(x, height);
		graphctx.stroke();
	};

	return grapher;
}
