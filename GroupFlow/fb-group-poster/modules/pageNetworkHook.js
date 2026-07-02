(function installGfPageNetworkHook() {
  if (window.__gfPageNetworkHooked) return;
  window.__gfPageNetworkHooked = true;

  const emit = (text) => {
    try {
      window.postMessage({ source: 'gf-page-hook', type: 'ingest', text }, '*');
    } catch { /* ignore */ }
  };

  // __dyn/__csr là bitset mã hoá module JS/CSS trang đang tải — chỉ có ý nghĩa khi lấy đúng giá
  // trị THẬT từ request mà chính trang Facebook tự gửi đi (không tự sinh ngẫu nhiên được). Bắt
  // trong body của request GraphQL/comet thật do trang tự gửi lúc user browse bình thường.
  const emitReqBody = (bodyText) => {
    try {
      if (!bodyText || typeof bodyText !== 'string' || !bodyText.includes('__dyn=')) return;
      const params = new URLSearchParams(bodyText);
      const dyn = params.get('__dyn');
      const csr = params.get('__csr');
      if (dyn || csr) {
        window.postMessage({ source: 'gf-page-hook', type: 'ingest-req', dyn, csr }, '*');
      }
    } catch { /* ignore */ }
  };

  const origFetch = window.fetch;
  window.fetch = async (...args) => {
    try {
      const body = args[1]?.body;
      if (typeof body === 'string') emitReqBody(body);
    } catch { /* ignore */ }
    const res = await origFetch(...args);
    try {
      const clone = res.clone();
      clone.text().then(emit).catch(() => {});
    } catch { /* ignore */ }
    return res;
  };

  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function sendPatched(...args) {
    try {
      if (typeof args[0] === 'string') emitReqBody(args[0]);
    } catch { /* ignore */ }
    this.addEventListener('load', function onLoad() {
      try {
        if (typeof this.responseText === 'string') emit(this.responseText);
      } catch { /* ignore */ }
    });
    return origSend.apply(this, args);
  };
})();
