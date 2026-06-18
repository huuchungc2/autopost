UPDATE ai_provider_templates
SET default_model = 'cx/gpt-5.5-image',
    description = 'Tạo ảnh qua 9Router/Codex (OpenAI-compatible, trả về base64)'
WHERE slug = '9router-image';

UPDATE ai_providers ap
JOIN ai_provider_templates t ON ap.template_id = t.id
SET ap.model = 'cx/gpt-5.5-image'
WHERE t.slug = '9router-image'
  AND (
    ap.model IS NULL
    OR ap.model IN ('dall-e-3', 'dall-e-2', 'GPT 5.5 Image', 'gpt-5.5-image')
  );
