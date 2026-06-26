/** FB colored post — preset map từ GPP worker (text_format_preset_id). */
const GF_GLOBAL = typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : {};
GF_GLOBAL.GF = GF_GLOBAL.GF || {};

GF_GLOBAL.GF.postFormat = {
  PRESETS: {
    '#18191a': '0',
    '#e2013b': '1903718606535395',
    '#dc7a5a': '303063890126415',
    '#c600ff': '1060186232989955',
    '#5d3fda': '1777259169190672',
    '#0073ff': '1365883126823705',
    '#8395d1': '6524876100975152',
    '#33234b': '319468561816672',
    '#5d6374': '1227086461613922',
  },

  presetId(hex) {
    const key = String(hex || '#18191A').toLowerCase();
    return this.PRESETS[key] || '0';
  },

  isColored(hex) {
    return this.presetId(hex) !== '0';
  },

  buildComposedText(plainText) {
    const text = String(plainText || '');
    const blocks = text.split('\n');
    return {
      blocks,
      block_types: blocks.map(() => 0),
      block_depths: blocks.map(() => 0),
      block_data: blocks.map(() => '[]'),
      entities: blocks.map(() => '[]'),
      entity_map: '{}',
      inline_styles: blocks.map(() => '[]'),
    };
  },

  applyToVariables(variables, { text, backgroundColor }) {
    const preset = this.presetId(backgroundColor);
    if (preset === '0') {
      variables.input.message = { ranges: [], text };
      return variables;
    }
    const composed = this.buildComposedText(text);
    variables.input.message = { ranges: [], text };
    variables.input.composed_text = composed;
    variables.input.text_format_preset_id = preset;
    return variables;
  },
};
