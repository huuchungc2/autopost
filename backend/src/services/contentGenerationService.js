import { generateText } from './aiService.js';
import { normalizeImportContent } from '../utils/importTextNormalize.js';

const DEFAULT_TEXT_RULES = `Viết bài Facebook bằng tiếng Việt, hấp dẫn, có emoji phù hợp.`;

const DEFAULT_IMAGE_RULES = `image_prompt: tiếng Anh, mô tả một khung hình cụ thể khớp nội dung bài; phong cách ảnh thật hoặc minh họa đẹp; không có chữ/chữ overlay trên ảnh; bố cục vuông 1:1.`;

const DEFAULT_VIDEO_RULES = `video_prompt: tiếng Anh, mô tả cảnh quay video ngắn (15–60s) khớp nội dung bài; góc máy, chuyển động, mood rõ ràng; tỉ lệ dọc 9:16 phù hợp Reels/Story; không chữ trên hình.`;

function combineSkillBlock(skills, label) {
  if (!skills?.length) return '';
  if (skills.length === 1) return skills[0].system_prompt;
  return skills
    .map((s, i) => `[${label} ${i + 1}: ${s.name}]\n${s.system_prompt}`)
    .join('\n\n');
}

export function resolveMediaMode({ mediaType, imageSkills, videoSkills, imageProvider }) {
  if (mediaType === 'video') return 'video';
  if (mediaType === 'image') return 'image';
  if (mediaType === 'none') return 'none';
  if (imageSkills?.length || imageProvider) return 'image';
  if (videoSkills?.length) return 'video';
  return 'none';
}

export function buildJsonFormatInstruction(mediaMode) {
  if (mediaMode === 'image') {
    return `Trả về CHỈ một JSON hợp lệ (không markdown, không giải thích), dạng:
{"content":"nội dung bài Facebook đầy đủ","image_prompt":"mô tả ảnh tiếng Anh khớp bài"}`;
  }
  if (mediaMode === 'video') {
    return `Trả về CHỈ một JSON hợp lệ (không markdown, không giải thích), dạng:
{"content":"nội dung bài Facebook đầy đủ","video_prompt":"mô tả video tiếng Anh khớp bài"}`;
  }
  return `Trả về CHỈ một JSON hợp lệ (không markdown, không giải thích), dạng:
{"content":"nội dung bài Facebook đầy đủ"}`;
}

export function buildGenerationSystemPrompt({
  textPrompt = '',
  imagePrompt = '',
  videoPrompt = '',
  mediaMode = 'image',
}) {
  const parts = [];

  if (textPrompt) {
    parts.push(`[SKILL VIẾT BÀI]\n${textPrompt}`);
  } else {
    parts.push(`[QUY TẮC VIẾT BÀI]\n${DEFAULT_TEXT_RULES}`);
  }

  if (mediaMode === 'image') {
    parts.push(`[SKILL ẢNH — chỉ dùng cho trường image_prompt]\n${imagePrompt || DEFAULT_IMAGE_RULES}`);
  } else if (mediaMode === 'video') {
    parts.push(`[SKILL VIDEO — chỉ dùng cho trường video_prompt]\n${videoPrompt || DEFAULT_VIDEO_RULES}`);
  }

  parts.push(buildJsonFormatInstruction(mediaMode));
  return parts.join('\n\n');
}

function extractJsonObject(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    // continue
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // continue
    }
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  return null;
}

export function parseGenerationResponse(rawText, mediaMode = 'image') {
  const parsed = extractJsonObject(rawText);

  if (parsed?.content) {
    return {
      content: normalizeImportContent(parsed.content).trim(),
      image_prompt: parsed.image_prompt ? String(parsed.image_prompt).trim() : '',
      video_prompt: parsed.video_prompt ? String(parsed.video_prompt).trim() : '',
    };
  }

  return {
    content: normalizeImportContent(rawText).trim(),
    image_prompt: '',
    video_prompt: '',
    parseFailed: true,
  };
}

export function buildFallbackImagePrompt(topic, content) {
  const snippet = String(content || '').replace(/\s+/g, ' ').slice(0, 280);
  return `Facebook post illustration about "${topic}". Scene matching this post: ${snippet}. Warm lighting, no text overlay, square 1:1 composition, photorealistic.`;
}

export function buildFallbackVideoPrompt(topic, content) {
  const snippet = String(content || '').replace(/\s+/g, ' ').slice(0, 280);
  return `Short vertical social video (9:16) about "${topic}". Scene: ${snippet}. Smooth camera movement, cinematic, no on-screen text.`;
}

export function buildImageQueueFields({ image_prompt, image_url }) {
  const prompt = String(image_prompt || '').trim();
  const needsImage = Boolean(prompt) && !image_url;
  return {
    auto_generate_image: needsImage,
    image_job_status: needsImage ? 'pending' : null,
    save_image_local: true,
  };
}

export async function generatePostWithMedia({
  topic,
  userPrompt,
  config,
  mediaMode,
}) {
  const mode = mediaMode || config.mediaMode || 'image';
  const systemPrompt = buildGenerationSystemPrompt({
    textPrompt: config.textSystemPrompt,
    imagePrompt: config.imageSystemPrompt,
    videoPrompt: config.videoSystemPrompt,
    mediaMode: mode,
  });

  const raw = await generateText(userPrompt, config.textProvider, systemPrompt);
  const parsed = parseGenerationResponse(raw.text, mode);

  let image_url = null;
  let image_prompt = null;
  let video_prompt = null;
  let resolvedMediaType = 'none';

  if (mode === 'image') {
    image_prompt = parsed.image_prompt || buildFallbackImagePrompt(topic, parsed.content);
    resolvedMediaType = image_prompt ? 'image' : 'none';
  } else if (mode === 'video') {
    video_prompt = parsed.video_prompt || buildFallbackVideoPrompt(topic, parsed.content);
    resolvedMediaType = 'video';
  }

  const queue = buildImageQueueFields({ image_prompt, image_url });

  return {
    content: parsed.content,
    image_url,
    image_prompt,
    video_prompt,
    media_type: resolvedMediaType,
    parseFailed: parsed.parseFailed || false,
    ...queue,
  };
}
