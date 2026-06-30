import XLSX from 'xlsx';
import { normalizeImportContent } from '../utils/importTextNormalize.js';

export const MAX_IMPORT_ROWS = 500;

export const TEMPLATE_COLUMNS = [
  'noi_dung',
  'prompt_anh',
  'ngay_dang',
  'gio_dang',
];

export const HEADER_ALIASES = {
  noi_dung: ['noi_dung', 'content', 'noi_dung_bai', 'caption', 'noi_dung'],
  prompt_anh: ['prompt_anh', 'prompt', 'image_prompt'],
  ngay_dang: ['ngay_dang', 'scheduled_date', 'ngay', 'noi_dang'],
  gio_dang: ['gio_dang', 'scheduled_time', 'gio', 'gio_dang'],
};

function normalizeHeader(cell) {
  return String(cell || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

export function parseCsvText(text, { headerAliases = HEADER_ALIASES } = {}) {
  const raw = String(text || '').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const dataLines = lines.filter((l) => !l.startsWith('#'));

  if (!dataLines.length) {
    return { headers: [], rows: [] };
  }

  const headerCells = parseCsvLine(dataLines[0]).map(normalizeHeader);
  const fieldIndex = {};

  for (const [field, aliases] of Object.entries(headerAliases)) {
    const idx = headerCells.findIndex((h) => aliases.includes(h));
    if (idx >= 0) fieldIndex[field] = idx;
  }

  const rows = [];
  for (let i = 1; i < dataLines.length; i += 1) {
    const cells = parseCsvLine(dataLines[i]);
    if (cells.every((c) => !c)) continue;

    const row = {};
    for (const [field, idx] of Object.entries(fieldIndex)) {
      row[field] = cells[idx] ?? '';
    }
    row._line = i + 1;
    rows.push(row);
  }

  return { headers: headerCells, rows };
}

function escapeCsvCell(value) {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildImportTemplateXlsx() {
  const wb = XLSX.utils.book_new();

  const guideLines = [
    ['Mẫu import bài viết AutoPost'],
    [''],
    ['Chỉ cần 4 cột ở sheet Import:'],
    ['  noi_dung — nội dung bài đăng (bắt buộc)'],
    ['  prompt_anh — mô tả ảnh tiếng Anh; AI dùng để generate ảnh lên VPS nếu chưa có ảnh'],
    ['  ngay_dang — YYYY-MM-DD (tuỳ chọn, để trống nếu lên lịch sau)'],
    ['  gio_dang — HH:MM (tuỳ chọn)'],
    [''],
    ['Khi import trên app: chọn fanpage đích, upload file, có thể tự chia lịch theo giờ mỗi ngày.'],
    [''],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(guideLines), 'Huong dan');

  const importRows = [
    TEMPLATE_COLUMNS,
    [
      'Nội dung bài viết đầy tiên...',
      'A warm illustration of Vietnamese family reunion, square 1:1, no text',
      '2026-06-20',
      '08:00',
    ],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(importRows), 'Import');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function cellDisplayText(cell) {
  if (cell == null || cell === '') return '';
  if (typeof cell === 'object' && cell !== null) {
    if (cell.w != null) return String(cell.w).trim();
    if (cell.v != null) return String(cell.v).trim();
    return '';
  }
  return String(cell).trim();
}

function readSheetRow(sheet, rowIndex, colCount) {
  const cells = [];
  for (let col = 0; col < colCount; col += 1) {
    const addr = XLSX.utils.encode_cell({ r: rowIndex, c: col });
    cells.push(cellDisplayText(sheet[addr]));
  }
  return cells;
}

export function parseExcelBuffer(buffer, options = {}) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets.Import || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { rows: [] };

  const ref = sheet['!ref'];
  if (!ref) return { rows: [] };
  const range = XLSX.utils.decode_range(ref);
  const data = [];
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    data.push(readSheetRow(sheet, r, range.e.c + 1));
  }
  return parseSheetRows(data, options);
}

function parseSheetRows(data, { headerAliases = HEADER_ALIASES, requiredField = 'noi_dung' } = {}) {
  let headerRowIndex = -1;
  let fieldIndex = {};

  for (let i = 0; i < data.length; i += 1) {
    const headerCells = data[i].map((cell) => normalizeHeader(cell));
    const index = {};
    for (const [field, aliases] of Object.entries(headerAliases)) {
      const idx = headerCells.findIndex((h) => aliases.includes(h));
      if (idx >= 0) index[field] = idx;
    }
    if (index[requiredField] != null) {
      headerRowIndex = i;
      fieldIndex = index;
      break;
    }
  }

  if (headerRowIndex < 0) return { rows: [] };

  const rows = [];
  for (let i = headerRowIndex + 1; i < data.length; i += 1) {
    const cells = data[i].map((cell) => cellDisplayText(cell));
    if (cells.every((c) => !c)) continue;

    const row = { _line: i + 1 };
    for (const [field, idx] of Object.entries(fieldIndex)) {
      row[field] = cells[idx] ?? '';
    }
    rows.push(row);
  }

  return { rows };
}

export function buildImportTemplateCsv() {
  const commentLines = [
    '# Mau import bai viet AutoPost — xoa dong bat dau bang # truoc khi import (hoac de nguyen, he thong tu bo qua)',
    '# noi_dung: bat buoc',
    '# prompt_anh: mo ta anh — AI generate anh len VPS neu chua co anh',
    '# ngay_dang: YYYY-MM-DD, gio_dang: HH:MM — de trong neu len lich sau tren app',
  ];

  const exampleRow = [
    'Noi dung bai viet day du...',
    'A warm illustration of Vietnamese family reunion, square 1:1, no text',
    '2026-06-20',
    '08:00',
  ];

  const lines = [
    ...commentLines,
    TEMPLATE_COLUMNS.join(','),
    exampleRow.map(escapeCsvCell).join(','),
  ];

  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function normalizeTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parts = raw.split(':');
  const h = pad2(parts[0]);
  const m = pad2(parts[1] || '0');
  return `${h}:${m}:00`;
}

function pad2(n) {
  return String(Number(n) || 0).padStart(2, '0');
}

function normalizeDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmy = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${pad2(dmy[2])}-${pad2(dmy[1])}`;
  }
  return null;
}

function buildScheduledAt(date, time) {
  const d = normalizeDate(date);
  if (!d) return null;
  const t = normalizeTime(time) || '08:00:00';
  return `${d} ${t}`;
}

export function normalizeImportRows(rows, defaultPageId) {
  const pageId = Number(defaultPageId);
  if (!pageId) {
    return {
      rows: [],
      errors: [{ line: '?', error: 'Thiếu fanpage đích (page_id)' }],
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

    const scheduledAt = buildScheduledAt(row.ngay_dang, row.gio_dang);
    const promptText = String(row.prompt_anh || row.prompt || '').trim();
    const mediaType = promptText ? 'image' : 'none';

    normalized.push({
      line,
      page_id: pageId,
      topic: '',
      content,
      media_type: mediaType,
      image_url: null,
      image_prompt: promptText || null,
      video_prompt: null,
      video_url: null,
      video_thumb_url: null,
      scheduled_at: scheduledAt,
      status: scheduledAt ? 'scheduled' : 'pending_approval',
    });
  }

  return { rows: normalized, errors };
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

export function buildAutoScheduleSlots(posts, startDate, times) {
  const normalizedTimes = (times || [])
    .map((t) => String(t).trim().slice(0, 5))
    .filter(Boolean);
  if (!normalizedTimes.length) return posts;

  const withoutSchedule = posts.filter((p) => !p.scheduled_at);
  if (!withoutSchedule.length) return posts;

  const slotsPerDay = normalizedTimes.length;
  let slotIndex = 0;

  return posts.map((post) => {
    if (post.scheduled_at) return post;
    const dayOffset = Math.floor(slotIndex / slotsPerDay);
    const time = normalizedTimes[slotIndex % slotsPerDay];
    slotIndex += 1;
    return {
      ...post,
      scheduled_at: `${addDays(startDate, dayOffset)} ${time}:00`,
      status: 'scheduled',
    };
  });
}
