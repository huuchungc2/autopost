window.GF = window.GF || {};

GF.spintax = {
  spin(text) {
    if (!text || !text.includes('{')) return text;
    return text.replace(/\{([^{}]+)\}/g, (_, options) => {
      const parts = options.split('|').map((s) => s.trim()).filter(Boolean);
      if (!parts.length) return '';
      return parts[Math.floor(Math.random() * parts.length)];
    });
  },
  pickVariation(variations, index) {
    const list = variations.filter((v) => v && v.trim());
    if (!list.length) return '';
    return list[index % list.length];
  },
};
