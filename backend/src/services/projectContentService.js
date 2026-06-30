import axios from 'axios';
import sharp from 'sharp';
import { query } from '../db.js';
import { generateText } from './aiService.js';
import { getProviderById } from './providerService.js';
import { generateImage } from './imageService.js';
import { storeImageBuffer } from './mediaStorage.js';
import { buildWebsiteBlogPrompt } from '../prompts/websiteBlogPrompt.js';
import { normalizeImportContent } from '../utils/importTextNormalize.js';

/**
 * Website là 1 "dự án" độc lập với fanpage Facebook (bảng `websites` riêng,
 * không phải lúc nào 1 website cũng gắn với 1 fanpage cụ thể). Brand voice
 * lấy từ Skill gán trực tiếp cho website (websites.skill_id).
 */
export async function getWebsiteGenerationConfig(websiteId) {
  const rows = await query(
    `SELECT w.id, w.name, w.domain, w.skill_id, w.text_provider_id, w.image_provider_id,
            w.publish_url, w.api_key, s.system_prompt AS skill_system_prompt
     FROM websites w
     LEFT JOIN skills s ON s.id = w.skill_id
     WHERE w.id = ? AND w.is_active = true`,
    [websiteId]
  );
  const website = rows[0];
  if (!website) return null;

  const textProvider = await getProviderById(website.text_provider_id);
  const imageProvider = await getProviderById(website.image_provider_id);

  return {
    website,
    textSystemPrompt: website.skill_system_prompt || '',
    textProvider,
    imageProvider,
  };
}

/**
 * Tương đương getProjectContext() trong prompts/HUONG-DAN-SU-DUNG.md, khớp
 * đúng DB thật của AutoPost — dùng bảng `websites` làm "dự án". Brand voice
 * lấy từ Skill text đang gán cho website. AutoPost chưa có bảng lưu
 * business_data/usp/hotline/faq_real — các mục này trả về placeholder
 * [CẦN BỔ SUNG: ...] thay vì bịa, kèm missingFields để caller hiển thị TODO
 * cho người dùng điền tay khi review.
 */
export async function getProjectContext(websiteId) {
  const config = await getWebsiteGenerationConfig(websiteId);
  if (!config) return null;
  const brandVoice = config.textSystemPrompt?.trim();

  const missingFields = [];
  const placeholder = (field, label) => {
    missingFields.push(field);
    return `[CẦN BỔ SUNG: ${label} — AutoPost chưa có dữ liệu này, điền tay khi review bài]`;
  };

  const lines = [
    `Tên dự án: ${config.website.name}`,
    `Giọng văn: ${brandVoice || placeholder('brand_voice', 'chưa gán Skill viết bài cho website này (vào Website → Sửa để gán)')}`,
    `Thông tin giá/dịch vụ: ${placeholder('business_data', 'giá/dịch vụ cụ thể')}`,
    `Điểm khác biệt: ${placeholder('usp', 'USP / điểm khác biệt')}`,
    `Hotline: ${placeholder('hotline', 'số hotline liên hệ')}`,
    `Câu hỏi khách hay hỏi: ${placeholder('faq_real', 'câu hỏi khách thật đã gặp')}`,
  ];

  return {
    websiteName: config.website.name,
    text: lines.join('\n'),
    missingFields,
    config,
  };
}

function splitOnDashSeparators(text) {
  return String(text || '')
    .split(/\n\s*---\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractField(block, label) {
  const re = new RegExp(`^${label}\\s*:\\s*(.+)$`, 'mi');
  const m = String(block || '').match(re);
  return m ? m[1].trim() : '';
}

/** Parse output theo format `---`-delimited mô tả trong website-blog-prompt.js. */
export function parseWebsiteBlogOutput(rawText) {
  const parts = splitOnDashSeparators(rawText);
  if (parts.length < 3) {
    return {
      title: '',
      metaDescription: '',
      slug: '',
      primaryKeyword: '',
      content: normalizeImportContent(rawText).trim(),
      imagePrompts: [],
      internalLinksSuggested: '',
      todoMissingInfo: '',
      parseFailed: true,
    };
  }

  const [header, content, footer] = parts;
  const imagePromptsRaw = extractField(footer, 'IMAGE_PROMPTS');
  const imagePrompts = imagePromptsRaw
    .split(/\n|;|(?=\d+[.)])/)
    .map((s) => s.replace(/^\d+[.)]\s*/, '').trim())
    .filter(Boolean);

  return {
    title: extractField(header, 'TITLE'),
    metaDescription: extractField(header, 'META_DESCRIPTION'),
    slug: extractField(header, 'SLUG'),
    primaryKeyword: extractField(header, 'PRIMARY_KEYWORD'),
    content: normalizeImportContent(content).trim(),
    imagePrompts,
    internalLinksSuggested: extractField(footer, 'INTERNAL_LINKS_SUGGESTED'),
    todoMissingInfo: extractField(footer, 'TODO_MISSING_INFO'),
    parseFailed: false,
  };
}

function slugify(value, fallback = 'bai-viet') {
  const s = String(value || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || fallback;
}

/**
 * Generate ảnh cho bài blog — dùng ĐÚNG cơ chế lưu trữ hiện tại của
 * AutoPost (storeImageBuffer: Google Drive hoặc local VPS tuỳ cấu hình
 * media_storage), chỉ thêm convert WebP (sharp) + đặt tên file theo slug
 * thay vì timestamp ngẫu nhiên. Website không có folder Drive riêng như
 * fanpage — luôn dùng folder gốc global (pageId = null).
 */
async function downloadBufferFromUrl(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(response.data);
}

export async function generateBlogImage(prompt, imageProvider, { slug, index = 1 } = {}) {
  const result = await generateImage(prompt, imageProvider, { persist: false, pageId: null });
  const dataUrlMatch = /^data:[^;]+;base64,(.+)$/.exec(result.image_url || '');
  const rawBuffer = dataUrlMatch
    ? Buffer.from(dataUrlMatch[1], 'base64')
    : await downloadBufferFromUrl(result.image_url);

  const webpBuffer = await sharp(rawBuffer).webp({ quality: 85 }).toBuffer();
  const filename = `${slugify(slug)}-${index}.webp`;
  const imageUrl = await storeImageBuffer(webpBuffer, {
    ext: 'webp',
    mimeType: 'image/webp',
    pageId: null,
    filename,
  });
  return { image_url: imageUrl, image_prompt: prompt };
}

/**
 * Generate bài blog website — tương đương generateWebsiteBlog() trong
 * prompts/HUONG-DAN-SU-DUNG.md. KHÔNG đụng vào flow/cronjob đăng bài
 * Facebook hiện tại — bài lưu posts.platform='website', status='draft'.
 */
export async function generateWebsiteBlog({ websiteId, topic, researchBrief = '' }) {
  const projectContext = await getProjectContext(websiteId);
  if (!projectContext) {
    const err = new Error('Website không tồn tại hoặc đã tắt');
    err.status = 404;
    throw err;
  }

  const config = projectContext.config;
  const prompt = buildWebsiteBlogPrompt({
    projectContext: projectContext.text,
    topic,
    researchBrief,
  });

  const raw = await generateText(prompt, config?.textProvider, '');
  const parsed = parseWebsiteBlogOutput(raw.text);

  let primaryImage = null;
  const primaryPrompt = parsed.imagePrompts?.[0];
  const slugForFile = parsed.slug || slugify(parsed.title || topic);
  if (primaryPrompt && config?.imageProvider) {
    try {
      primaryImage = await generateBlogImage(primaryPrompt, config.imageProvider, {
        slug: slugForFile,
        index: 1,
      });
    } catch (error) {
      // Không chặn tạo bài nếu generate ảnh lỗi — prompt vẫn lưu trong seo_meta để generate tay sau.
      console.error('generateBlogImage thất bại:', error.message);
    }
  }

  const seoMeta = {
    title: parsed.title,
    meta_description: parsed.metaDescription,
    slug: parsed.slug || slugForFile,
    primary_keyword: parsed.primaryKeyword,
    image_prompts: parsed.imagePrompts,
    internal_links_suggested: parsed.internalLinksSuggested,
    todo_missing_info: parsed.todoMissingInfo,
  };

  return {
    content: parsed.content,
    seoMeta,
    image_url: primaryImage?.image_url || null,
    image_prompt: primaryImage?.image_prompt || primaryPrompt || null,
    missingProjectFields: projectContext.missingFields,
    parseFailed: parsed.parseFailed,
  };
}
