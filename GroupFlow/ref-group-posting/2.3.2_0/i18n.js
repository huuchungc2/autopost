/**
 * Advanced i18n Helper with Manual Override Support
 */
const I18n = {
  // Store the custom dictionary here if loaded
  dictionary: null,

  /**
   * Initialize: Checks storage for a forced language override.
   * Returns a promise so we can await it before rendering the app.
   */
  init: async function () {
    try {
      // We use chrome.storage.local to share preference between Popup and Content Script
      const result = await chrome.storage.local.get("custom_i18n_dict");
      if (result.custom_i18n_dict) {
        this.dictionary = result.custom_i18n_dict;
        console.log("I18n: Custom language dictionary loaded.");
      }
    } catch (e) {
      console.warn("I18n: Failed to load custom dictionary", e);
    }
  },

  /**
   * Get a translated string.
   * Priority: Custom Dictionary -> Native chrome.i18n
   */
  t: function (key, substitutions = []) {
    if (!key) return "";

    // 1. Try Custom Dictionary (Manual Override)
    if (this.dictionary && this.dictionary[key]) {
      const entry = this.dictionary[key];
      let message = entry.message;

      // Handle Placeholders (e.g., replace $COUNT$ with the value)
      if (entry.placeholders && substitutions.length > 0) {
        for (const [phName, phDef] of Object.entries(entry.placeholders)) {
          // phDef.content usually looks like "$1"
          const indexStr = phDef.content.replace("$", ""); // Get "1"
          const index = parseInt(indexStr, 10) - 1; // Convert to 0-based index

          if (substitutions[index] !== undefined) {
            // Replace uppercase placeholder in message (e.g., $COUNT$)
            // Regex handles case insensitivity and $ signs
            const regex = new RegExp(`\\$${phName}\\$`, "gi");
            message = message.replace(regex, substitutions[index]);
          }
        }
      }
      return message;
    }

    // 2. Fallback to Native API
    return chrome.i18n.getMessage(key, substitutions) || key;
  },

  /**
   * Translate static HTML elements.
   */
  translatePage: function (rootElement = document) {
    const elements = rootElement.querySelectorAll("[data-i18n]");
    elements.forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const targetAttr = el.getAttribute("data-i18n-target"); // e.g., 'title', 'placeholder'
      const message = I18n.t(key);

      if (message) {
        if (targetAttr) {
          // Specific attribute targeting (e.g. for inputs with titles)
          el.setAttribute(targetAttr, message);
        } else if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
          el.placeholder = message;
        } else {
          // Check if element has child elements (like icons) we want to preserve?
          // For now, simpler is better: replace content.
          el.innerHTML = message;
        }
      }
    });
  },
};

// Auto-run logic
// We must Initialize first, THEN translate.
if (location.protocol === "chrome-extension:") {
  // Popup Context
  document.addEventListener("DOMContentLoaded", async () => {
    await I18n.init();
    I18n.translatePage();
  });
} else {
  // Content Script Context
  // We initialize immediately so it's ready when called
  I18n.init();
}
