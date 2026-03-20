"use strict"

// Drag improvements submitted by ObnubiladO in PR #291

const drag_handler = {

	drag_state: null,

	cancel_drag: function() {							// Must also be called after a successful drag. (Maybe misnamed, hmm?)

		if (!this.drag_state) {
			return;
		}

		if (this.drag_state.floating) {					// Drag is in progress...
			hub.set_active_square(null);
			this.drag_state.floating.remove();
			this.drag_state.floating = null;			// Not strictly needed.
		}

		this.drag_state.from_element.style.opacity = "";

		this.drag_state = null;
		document.body.classList.remove("dragging-piece");

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
			from_square: overlay_td.id.slice(8),		// e.g. "e4" or similar.
			piece_style: piece_style,
			rect: rect,

			startX: event.clientX,
			startY: event.clientY,

			offsetX: rect.width / 2,
			offsetY: rect.height / 2,

			floating: null,								// The actual element - not created until we're sure we're really dragging.
		};
	},

	mousemove_handler: function(event) {

		if (!this.drag_state) {
			return;
		}

		// I dunno if this can happen but for safety...

		if (!(event.buttons & 1)) {						// Bitmask: right-most bit means left click is down.
			console.log("drag_handler: mousemove handler saw active drag state while button 1 up!")
			this.cancel_drag();
			return;
		}

		let dx = event.clientX - this.drag_state.startX;
		let dy = event.clientY - this.drag_state.startY;
		let dist = Math.hypot(dx, dy);

		if (!this.drag_state.floating) {

			// Treat small mouse movement as a normal click so boardfriends_click keeps its select/move behavior.

			if (dist < 5) {
				return;
			}

			// Drag starting now!

			hub.set_active_square(Point(this.drag_state.from_square));
			if (config.click_spotlight) {
				hub.draw_canvas_arrows();
			}

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

			document.body.classList.add("dragging-piece");			// This is just a css change.
			this.drag_state.from_element.style.opacity = "0.35";

			this.drag_state.floating = floating;
		}

		this.drag_state.floating.style.left = (event.clientX - this.drag_state.offsetX) + "px";
		this.drag_state.floating.style.top = (event.clientY - this.drag_state.offsetY) + "px";
	},

	mouseup_handler: function(event) {

		if (hub.grapher.dragging) {
			hub.grapher.dragging = false;				// Always stop graph dragging.
		}

		if (!this.drag_state) {
			return;
		}

		if (event.button !== 0) {
			return;
		}

		if (this.drag_state.floating) {					// Real drag was in progress...

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
				let move = this.drag_state.from_square + target_element.id.slice(8);
				let ok = hub.move(move);
				if (!ok && config.click_spotlight) {	// The spotlight needs to be cleared.
					hub.draw_canvas_arrows();
				}
			}
		}

		this.cancel_drag();								// Final cleanup needed in all cases.
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
