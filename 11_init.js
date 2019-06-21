"use strict";

// The main process waits for renderer_ready signal
// before displaying the window. But in the event
// of an exception during load, we should display
// it as well, so we can get the console.

window.addEventListener("error", () => {
    ipcRenderer.send("renderer_ready", null);
});
