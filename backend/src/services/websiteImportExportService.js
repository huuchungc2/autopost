import XLSX from 'xlsx';
import { normalizeImportContent } from '../utils/importTextNormalize.js';

export const WEBSITE_TEMPLATE_COLUMNS = [
  'tieu_de',
  'slug',
  'meta_description',
  'tu_khoa_chinh',
  'noi_dung',
  'prompt_anh',
];

export const WEBSITE_HEADER_ALIASES = {
  tieu_de: ['tieu_de', 'title', 'tieu_de_bai'],
  slug: ['slug'],
  meta_description: ['meta_description', 'meta_desc', 'mo_ta_meta'],
  tu_khoa_chinh: ['tu_khoa_chinh', 'primary_keyword', 'tu_khoa'],
  noi_dung: ['noi_dung', 'content', 'noi_dung_bai'],
  prompt_anh: ['prompt_anh', 'prompt', 'image_prompt'],
};

/** Bắt buộc cột `noi_dung` để parser nhận diện đúng hàng header (xem parseSheetRows trong postImportExportService.js). */
export const WEBSITE_REQUIRED_FIELD = 'noi_dung';

export function buildWebsiteImportTemplateXlsx() {
  const wb = XLSX.utils.book_new();

  const guideLines = [
    ['Mẫu import bài Website Blog AutoPost'],
    [''],
    ['6 cột ở sheet Import:'],
    ['  tieu_de — tiêu đề bài (H1)'],
    ['  slug — chữ thường, không dấu, gạch ngang (vd: xe-khach-sai-gon-tanh-linh)'],
    ['  meta_description — 150-160 ký tự'],
    ['  tu_khoa_chinh — từ khoá chính SEO'],
    ['  noi_dung — nội dung bài đầy đủ (bắt buộc)'],
    ['  prompt_anh — mô tả ảnh tiếng Anh; AI generate ảnh nếu bật "tự generate ảnh" lúc import'],
    [''],
    ['Khi import trên app: chọn website đích, upload file. Mọi bài lưu dạng nháp (status=draft), không tự đăng lên đâu cả.'],
    [''],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(guideLines), 'Huong dan');

  const importRows = [
    WEBSITE_TEMPLATE_COLUMNS,
    [
      'Kinh nghiệm chọn xe khách Sài Gòn - Tánh Linh',
      'xe-khach-sai-gon-tanh-linh',
      'Tổng hợp kinh nghiệm chọn xe khách tuyến Sài Gòn - Tánh Linh an toàn, giá tốt, đúng giờ.',
      'xe khách sài gòn tánh linh',
      'Nội dung bài viết đầy đủ...',
      'A photo of a comfortable coach bus interior, no text',
    ],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(importRows), 'Import');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function normalizeWebsiteImportRows(rows, defaultWebsiteId) {
  const websiteId = Number(defaultWebsiteId);
  if (!websiteId) {
    return {
      rows: [],
      errors: [{ line: '?', error: 'Thiếu website đích' }],
    };
  }

  const normalized = [];
  const errors = [];

  for (const row of rows) {
    const line = row._line || '?';
    const content = normalizeImportContent(row.noi_dung || '').trim();

    if (!content) {
      errors.push({ line, error: 'Thiếu nội dung (noi_dung)' });
      continue;
    }

    const promptText = String(row.prompt_anh || '').trim();

    normalized.push({
      line,
      website_id: websiteId,
      content,
      image_prompt: promptText || null,
      seo_meta: {
        title: String(row.tieu_de || '').trim(),
        slug: String(row.slug || '').trim(),
        meta_description: String(row.meta_description || '').trim(),
        primary_keyword: String(row.tu_khoa_chinh || '').trim(),
      },
    });
  }

  return { rows: normalized, errors };
}
