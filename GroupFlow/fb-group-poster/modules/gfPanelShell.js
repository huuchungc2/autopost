/**
 * Floating panel shell — giống GroupPostingPro: iframe cố định trên trang.
 * Chịu extension reload: listener + iframe được làm mới khi context invalidated.
 */
(() => {
  const PANEL_W = '440px';
  const PANEL_H = '92vh';
  const HIDDEN_RIGHT = `-${PANEL_W}`;

  const state = window.__gfPanelShellState || {
    mounted: false,
    open: false,
    iframe: null,
    style: null,
  };
  window.__gfPanelShellState = state;

  function runtimeAlive() {
    try {
      return Boolean(chrome.runtime?.id);
    } catch {
      return false;
    }
  }

  function showDeadBanner() {
    let banner = document.getElementById('gf-panel-dead-banner');
    if (banner) return;
    banner = document.createElement('div');
    banner.id = 'gf-panel-dead-banner';
    banner.style.cssText = [
      'position:fixed', 'top:16px', 'right:16px', 'z-index:2147483647',
      'max-width:320px', 'padding:14px 16px', 'border-radius:12px',
      'background:#1e293b', 'color:#f8fafc', 'font:13px/1.45 system-ui,sans-serif',
      'box-shadow:0 8px 24px rgba(0,0,0,.25)',
    ].join(';');
    banner.innerHTML = '<strong>GroupFlow cần làm mới</strong><br>'
      + 'Extension vừa reload/cập nhật.<br>'
      + '<b>F5 trang này</b> rồi bấm icon extension lại.';
    document.body.appendChild(banner);
  }

  function teardownPanel() {
    if (state.iframe?.parentNode) state.iframe.remove();
    state.iframe = null;
    state.style = null;
    state.mounted = false;
    state.open = false;
  }

  function ensurePanel() {
    if (!runtimeAlive()) {
      showDeadBanner();
      return false;
    }
    document.getElementById('gf-panel-dead-banner')?.remove();

    if (state.mounted && state.iframe) return true;

    state.iframe = document.createElement('iframe');
    state.iframe.className = 'GroupFlowPanel';
    state.iframe.setAttribute('title', 'GroupFlow');
    state.iframe.src = chrome.runtime.getURL('sidepanel.html');
    state.style = state.iframe.style;
    state.style.position = 'fixed';
    state.style.top = '4%';
    state.style.right = HIDDEN_RIGHT;
    state.style.width = PANEL_W;
    state.style.height = PANEL_H;
    state.style.maxHeight = '96vh';
    state.style.zIndex = '2147483646';
    state.style.border = 'none';
    state.style.borderRadius = '14px';
    state.style.boxShadow = 'rgba(14, 30, 37, 0.12) 0px 2px 4px, rgba(14, 30, 37, 0.32) 0px 2px 16px';
    state.style.background = 'transparent';
    state.style.transition = 'right 0.35s ease-in-out';
    document.body.appendChild(state.iframe);
    state.mounted = true;
    return true;
  }

  function show() {
    if (!ensurePanel()) return;
    state.style.right = '12px';
    state.open = true;
  }

  function hide() {
    if (!state.mounted || !state.style) return;
    state.style.right = HIDDEN_RIGHT;
    state.open = false;
  }

  function toggle() {
    if (!runtimeAlive()) {
      showDeadBanner();
      return;
    }
    if (state.open) hide();
    else show();
  }

  function onPanelMessage(msg, _sender, sendResponse) {
    if (!runtimeAlive()) {
      showDeadBanner();
      sendResponse?.({ ok: false, error: 'context_invalidated' });
      return false;
    }
    if (msg?.type === 'GF_TOGGLE_PANEL') {
      toggle();
      sendResponse({ ok: true, open: state.open });
      return false;
    }
    if (msg?.type === 'GF_PANEL_OPEN') {
      show();
      sendResponse({ ok: true });
      return false;
    }
    if (msg?.type === 'GF_PANEL_CLOSE') {
      hide();
      sendResponse({ ok: true });
      return false;
    }
    if (msg?.type === 'GF_PANEL_RESET') {
      teardownPanel();
      sendResponse({ ok: true });
      return false;
    }
    return false;
  }

  // Sau extension reload, listener cũ chết — đăng ký lại mỗi lần script chạy.
  if (runtimeAlive()) {
    chrome.runtime.onMessage.addListener(onPanelMessage);
  }

  window.addEventListener('message', (e) => {
    if (e.data?.type === 'GF_PANEL_CLOSE') hide();
  });

  window.__gfPanelShell = { show, hide, toggle, teardownPanel, runtimeAlive };
})();
