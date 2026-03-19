"use strict"

// Drag improvements submitted by ObnubiladO in PR #291

const drag_handler = {

	drag_state: null,

	cancel_drag: function() {							// Must also be called after a successful drag. (Maybe misnamed, hmm?)

		if (!this.drag_state) {
			return;
		}

		if (this.drag_state.floating && this.drag_state.floating.parentNode) {
			this.drag_state.floating.remove();
		}

		if (this.drag_state.from_element) {
			this.drag_state.from_element.style.opacity = "";
		}

		if (this.drag_state.started) {
			hub.set_active_square(null);				// Real drags must clear the click-selected source square; mere clicks must not.
		}

		this.drag_state = null;
		boardfriends.classList.remove("dragging-piece");

		if (config.click_spotlight) {
			hub.draw_canvas_arrows();					// Might need to clear spotlight arrows.
		}
	},

	mousedown_event_on_board_td: function(overlay_td, event) {

		if (event.button !== 0) {
			return;
		}

		event.preventDefault();

		let piece_style = overlay_td.style.backgroundImage;
		if (!piece_style) {
			return;
		}

		let rect = overlay_td.getBoundingClientRect();

		this.drag_state = {
			from_element: overlay_td,
			piece_style,
			rect,

			startX: event.clientX,
			startY: event.clientY,

			offsetX: rect.width / 2,
			offsetY: rect.height / 2,

			floating: null,								// NOT CREATED UNTIL THE DRAG REALLY STARTS:
			started: false								// i.e. when this is set to true.
		};
	},

	mousemove_handler: function(event) {

		if (!this.drag_state) {
			return;
		}

		let dx = event.clientX - this.drag_state.startX;
		let dy = event.clientY - this.drag_state.startY;
		let dist = Math.hypot(dx, dy);

		if (!this.drag_state.started) {

			// Treat small mouse movement as a normal click so boardfriends_click keeps its select/move behavior.

			if (dist < 5) {
				return;
			}

			// Drag starting now!

			let floating = document.createElement("div");			// A custom ghost piece instead of HTML5 drag-and-drop.

			floating.style.position = "fixed";
			floating.style.pointerEvents = "none";
			floating.style.width = this.drag_state.rect.width + "px";
			floating.style.height = this.drag_state.rect.height + "px";
			floating.style.backgroundImage = this.drag_state.piece_style;
			floating.style.backgroundSize = "contain";
			floating.style.backgroundRepeat = "no-repeat";
			floating.style.zIndex = 1000;

			document.body.appendChild(floating);

			this.drag_state.from_element.style.opacity = "0.35";

			boardfriends.classList.add("dragging-piece");

			this.drag_state.floating = floating;
			this.drag_state.started = true;
		}

		if (this.drag_state.floating) {					// I don't think this can be false?
			this.drag_state.floating.style.left = (event.clientX - this.drag_state.offsetX) + "px";
			this.drag_state.floating.style.top = (event.clientY - this.drag_state.offsetY) + "px";
		}
	},

	mouseup_handler: function(event) {

		if (hub.grapher.dragging) {
			hub.grapher.dragging = false;				// Always stop graph dragging.
		}

		if (!this.drag_state) {
			return;
		}

		if (!this.drag_state.started) {					// Early cancel i.e. after a mere click.
			this.cancel_drag();
			return;
		}

		hub.set_active_square(null);

		let e = document.elementFromPoint(event.clientX, event.clientY);
		let target_element = null;

		while (e && e !== document.body) {
			if (e.id && e.id.startsWith("overlay_")) {
				target_element = e;
				break;
			}
			e = e.parentElement;
		}

		if (target_element) {
			let move = this.drag_state.from_element.id.slice(8) + target_element.id.slice(8);
			let ok = hub.move(move);
			if (!ok && config.click_spotlight) {		// The spotlight needs to be cleared.
				hub.draw_canvas_arrows();
			}
		}

		this.cancel_drag();
	}
};

// Setup drag-and-drop...

window.addEventListener("mousemove", (event) => {
	drag_handler.mousemove_handler(event);
});

window.addEventListener("mouseup", (event) => {
	drag_handler.mouseup_handler(event);
});


window.addEventListener("drop", (event) => {
	event.preventDefault();
	if (drag_handler.drag_state) {						// Ignore if handler is in the middle of internal piece drag.
		return;
	}
	let dt = event.dataTransfer;
	if (dt && dt.files && dt.files.length > 0) {
		hub.handle_file_drop(event);
	}
});

window.addEventListener("blur", () => {
	drag_handler.cancel_drag();
});

window.addEventListener("mouseleave", () => {
	drag_handler.cancel_drag();
});

// Native dragenter / dragover prevention is required so external file drops are accepted by the window...

window.addEventListener("dragenter", (event) => {
	event.preventDefault();
});

window.addEventListener("dragover", (event) => {
	event.preventDefault();
});
