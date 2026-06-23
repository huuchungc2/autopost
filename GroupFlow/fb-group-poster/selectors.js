const GF_SELECTORS = {
  vi: {
    postTrigger: '[aria-placeholder="Bạn viết gì đi..."], [role="button"][aria-label*="viết"]',
    textbox: '[role="textbox"][contenteditable="true"]',
    photoBtn: '[aria-label="Ảnh/video"]',
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

if (typeof window !== 'undefined') {
  window.GF_SELECTORS = GF_SELECTORS;
  window.gfPickSelector = gfPickSelector;
}
