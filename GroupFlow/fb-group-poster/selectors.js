(() => {
  // Idempotent: injected nhiều lần cũng không redeclare.
  if (globalThis.GF_SELECTORS && globalThis.gfPickSelector) return;

  const GF_SELECTORS = {
  vi: {
    postTrigger: [
      '[aria-placeholder*="Bạn viết gì"]',
      '[aria-placeholder*="bạn viết gì"]',
      '[aria-placeholder*="viết gì"]',
      '[aria-placeholder*="Hãy viết"]',
      '[aria-placeholder*="hãy viết"]',
      '[aria-label*="Bài viết công khai"]',
      '[aria-label*="bài viết công khai"]',
      '[aria-label*="Tạo bài viết"]',
      '[aria-label*="tạo bài viết"]',
      '[aria-label*="Create a public post"]',
      '[aria-placeholder*="Write something"]',
      '[aria-placeholder*="write something"]',
      '[aria-placeholder*="nghĩ"]',
      '[aria-label*="Viết bài"]',
      '[aria-label*="Tạo bài"]',
      'div[role="button"][aria-label*="công khai"]',
      'div[role="button"][aria-label*="public"]',
      '[role="main"] [aria-placeholder*="viết"]',
      '[role="main"] [aria-placeholder*="Write"]',
      '[data-pagelet="GroupInlineComposer"] [aria-placeholder]',
      '[data-pagelet="GroupInlineComposer"] div[role="textbox"]',
      '[data-pagelet*="Composer"] [aria-placeholder]',
    ].join(', '),
    textbox: '[role="textbox"][contenteditable="true"], div[data-lexical-editor="true"]',
    photoBtn: '[aria-label="Ảnh/video"], [aria-label="Photo/video"], [aria-label*="Ảnh"], [aria-label*="Photo"], [aria-label*="Hình ảnh"]',
    fileInput: 'input[type="file"][accept*="image"], input[type="file"][accept*="video"]',
    postBtn: '[aria-label="Đăng"], [aria-label="Đăng bài"], [aria-label="Post"], [aria-label="Publish"]',
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
