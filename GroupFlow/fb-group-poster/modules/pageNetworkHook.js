(function installGfPageNetworkHook() {
  if (window.__gfPageNetworkHooked) return;
  window.__gfPageNetworkHooked = true;

  const emit = (text) => {
    try {
      window.postMessage({ source: 'gf-page-hook', type: 'ingest', text }, '*');
    } catch { /* ignore */ }
  };

  const origFetch = window.fetch;
  window.fetch = async (...args) => {
    const res = await origFetch(...args);
    try {
      const clone = res.clone();
      clone.text().then(emit).catch(() => {});
    } catch { /* ignore */ }
    return res;
  };

  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function sendPatched(...args) {
    this.addEventListener('load', function onLoad() {
      try {
        if (typeof this.responseText === 'string') emit(this.responseText);
      } catch { /* ignore */ }
    });
    return origSend.apply(this, args);
  };
})();
