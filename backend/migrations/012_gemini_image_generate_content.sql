-- Gemini image: dùng generateContent (không phải Imagen :predict)
UPDATE ai_provider_templates
SET
  name = 'Gemini Image',
  api_endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
  default_model = 'gemini-2.5-flash-image-preview',
  description = 'Xuất ảnh bằng Gemini (generateContent + inlineData)',
  key_help = 'Endpoint: .../models/gemini-2.5-flash-image-preview:generateContent?key=API_KEY'
WHERE slug = 'gemini-image';

UPDATE ai_providers
SET
  api_endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent',
  model = CASE
    WHEN model IS NULL OR TRIM(model) = '' OR model LIKE 'imagen%' THEN 'gemini-2.5-flash-image-preview'
    ELSE model
  END
WHERE provider_kind = 'gemini'
  AND type = 'image'
  AND (api_endpoint LIKE '%imagen%' OR api_endpoint LIKE '%:predict%' OR api_endpoint IS NULL OR TRIM(api_endpoint) = '');
