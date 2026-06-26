window.GF = window.GF || {};

GF.aiApi = {
  async getActiveProviders() {
    if (GF.localProviders) return GF.localProviders.getActiveProviders();
    const s = await GF.storage.getSettings();
    return {
      textProviderId: s.textProviderId,
      imageProviderId: s.imageProviderId,
      textProvider: null,
      imageProvider: null,
    };
  },

  async generatePost({ topic, textSystemPrompt, imageSystemPrompt, mediaType }) {
    if (!GF.localAi) throw new Error('Thiếu module localAi');
    const { textProvider } = await this.getActiveProviders();
    if (!textProvider) throw new Error('Chọn Text provider trong Cài đặt → AI Provider');
    return GF.localAi.generatePost({
      topic,
      textSystemPrompt,
      imageSystemPrompt,
      mediaType,
    });
  },

  usesProviderProxy() {
    return false;
  },

  async generateImage(prompt) {
    const { imageProvider } = await this.getActiveProviders();
    if (imageProvider && GF.localAi) {
      return GF.localAi.callImage(imageProvider, prompt);
    }
    const s = await GF.storage.getSettings();
    if (!s.routerApiKey) {
      throw new Error('Chọn Image provider trong Cài đặt hoặc nhập 9Router API key');
    }
    return GF.imageGen.generateDirect(prompt, s.routerApiKey, s.tidienBaseUrl);
  },

  async generateText(task, text, settings, mode) {
    const s = settings || (await GF.storage.getSettings());
    const { textProvider } = await this.getActiveProviders();
    if (textProvider && GF.localAi) {
      const prompts = {
        persuasive: 'Viết lại bài đăng Facebook group sau cho hấp dẫn, tự nhiên, có CTA nhẹ. Giữ tiếng Việt. Không thêm hashtag dư.',
        grammar: 'Sửa chính tả và ngữ pháp, giữ nguyên ý và độ dài tương đương:',
        spintax: 'Chuyển bài sau thành spintax {a|b|c} hợp lý, giữ ý chính. Chỉ trả nội dung spintax:',
      };
      let userPrompt;
      if (task === 'comment') {
        userPrompt = `Viết 1 comment ngắn tự nhiên để đẩy bài Facebook sau, không quảng cáo lộ liễu:\n${text}`;
      } else {
        userPrompt = `${prompts[mode] || prompts.persuasive}\n\n${text}`;
      }
      return GF.localAi.callText(textProvider, '', userPrompt);
    }
    if (!s.routerApiKey) {
      throw new Error('Chọn Text provider trong Cài đặt hoặc nhập 9Router API key');
    }
    if (task === 'comment') return GF.imageGen.generateCommentDirect(text, s.routerApiKey, s.tidienBaseUrl);
    return GF.imageGen.rewritePostDirect(text, s.routerApiKey, s.tidienBaseUrl, mode);
  },
};
