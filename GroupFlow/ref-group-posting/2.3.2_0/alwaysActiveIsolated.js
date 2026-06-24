// alwaysActiveIsolated.js
// Runs in ISOLATED world at document_start. Duplicate the "always active" logic.

(function () {
  const port = document.getElementById("lwys-ctv-port");

  function block(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  // Redefine doc properties
  try {
    Object.defineProperty(document, "visibilityState", {
      get() {
        return "visible";
      },
    });
    Object.defineProperty(document, "webkitVisibilityState", {
      get() {
        return "visible";
      },
    });
    Object.defineProperty(document, "hidden", {
      get() {
        return false;
      },
    });
    Object.defineProperty(document, "webkitHidden", {
      get() {
        return false;
      },
    });
  } catch (e) {
    console.warn("ISOLATED: cannot redefine doc visibility:", e);
  }

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

  // Hook requestAnimationFrame
  let lastTime = 0;
  const originalRAF = window.requestAnimationFrame;
  window.requestAnimationFrame = function (callback) {
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

  console.log("alwaysActiveIsolated.js (ISOLATED world) loaded.");
})();
