(() => {
  // Idempotent: injected nhiều lần cũng không redeclare.
  if (globalThis.GF_SELECTORS && globalThis.gfPickSelector) return;

  const GF_SELECTORS = {
  vi: {
    postTrigger: [
      '[aria-placeholder*="viết"]',
      '[aria-placeholder*="nghĩ"]',
      '[aria-label*="viết gì"]',
      '[aria-label*="Viết bài"]',
      '[aria-label*="Tạo bài"]',
      '[aria-label*="bài viết công khai"]',
      'div[role="button"][aria-label*="viết"]',
      'div[role="button"][aria-label*="Write"]',
      'div[role="button"][aria-label*="Create"]',
      '[data-pagelet*="Composer"] div[role="button"]',
    ].join(', '),
    textbox: '[role="textbox"][contenteditable="true"], div[data-lexical-editor="true"]',
    photoBtn: '[aria-label="Ảnh/video"], [aria-label="Photo/video"], [aria-label*="Ảnh"], [aria-label*="Photo"]',
    fileInput: 'input[type="file"][accept*="image"]',
    postBtn: '[aria-label="Đăng"]',
    closeBtn: '[aria-label="Đóng hộp thoại của công cụ tạo"]',
    commentBox: '[aria-label="Viết bình luận..."], [aria-label="Write a comment..."], [role="textbox"][contenteditable="true"]',
    commentSubmit: '[aria-label="Đăng"], [aria-label="Post"]',
  },
  en: {
    postTrigger: '[aria-placeholder="Write something..."], [role="button"][aria-label*="Write"]',
    textbox: '[role="textbox"][contenteditable="true"]',
    photoBtn: '[aria-label="Photo/video"]',
    fileInput: 'input[type="file"][accept*="image"]',
    postBtn: '[aria-label="Post"]',
    closeBtn: '[aria-label="Close"]',
    commentBox: '[aria-label="Write a comment..."], [role="textbox"][contenteditable="true"]',
    commentSubmit: '[aria-label="Post"]',
  },
  };

  function gfPickSelector(lang, key) {
    const pack = GF_SELECTORS[lang] || GF_SELECTORS.vi;
    const alt = lang === 'vi' ? GF_SELECTORS.en : GF_SELECTORS.vi;
    return pack[key] || alt[key];
  }

  globalThis.GF_SELECTORS = GF_SELECTORS;
  globalThis.gfPickSelector = gfPickSelector;
})();
