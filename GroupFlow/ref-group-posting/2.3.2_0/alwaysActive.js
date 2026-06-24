// alwaysActive.js
// Runs in MAIN world at document_start. Forces the page to think it's visible.

(function () {
  // Create a DOM element to share state
  let port = document.getElementById("lwys-ctv-port");
  if (port) {
    port.remove();
  } else {
    port = document.createElement("span");
    port.id = "lwys-ctv-port";
    document.documentElement.append(port);
  }
  port.dataset.hidden = document.hidden;
  port.dataset.enabled = true;

  port.addEventListener("state", () => {
    port.dataset.hidden = document.hidden;
  });

  // Just a small function to block an event
  function block(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  // Redefine visibility APIs
  try {
    Object.defineProperty(Document.prototype, "visibilityState", {
      configurable: true,
      get() {
        return "visible";
      },
    });
    Object.defineProperty(Document.prototype, "webkitVisibilityState", {
      configurable: true,
      get() {
        return "visible";
      },
    });
    Object.defineProperty(Document.prototype, "hidden", {
      configurable: true,
      get() {
        return false;
      },
    });
    Object.defineProperty(Document.prototype, "webkitHidden", {
      configurable: true,
      get() {
        return false;
      },
    });
  } catch (e) {
    console.warn("Cannot redefine document visibility:", e);
  }

  // Intercept events that might indicate the page is not active
  document.addEventListener("visibilitychange", block, true);
  document.addEventListener("webkitvisibilitychange", block, true);
  window.addEventListener("pagehide", block, true);
  window.addEventListener("blur", block, true);
  window.addEventListener("focus", block, true);
  window.addEventListener("mouseout", block, true);
  window.addEventListener("mouseleave", block, true);
  window.addEventListener("lostpointercapture", block, true);

  // Force hasFocus to always return true
  Document.prototype.hasFocus = new Proxy(Document.prototype.hasFocus, {
    apply(target, self, args) {
      return true;
    },
  });

  // Hook requestAnimationFrame to keep frames going
  let lastTime = 0;
  const originalRAF = window.requestAnimationFrame;
  window.requestAnimationFrame = function (callback) {
    // If the page tries to slow down or skip frames while "hidden," we override
    const currTime = Date.now();
    const timeToCall = Math.max(0, 16 - (currTime - lastTime));
    const id = setTimeout(() => {
      callback(performance.now());
    }, timeToCall);
    lastTime = currTime + timeToCall;
    return id;
  };

  const originalCancelRAF = window.cancelAnimationFrame;
  window.cancelAnimationFrame = function (id) {
    clearTimeout(id);
    return originalCancelRAF(id);
  };

  console.log("alwaysActive.js (MAIN world) loaded.");
})();
