import XLSX from 'xlsx';

export const MAX_IMPORT_ROWS = 500;

const TEMPLATE_COLUMNS = [
  'fanpage_id',
  'fanpage_ten',
  'chu_de',
  'noi_dung',
  'loai_media',
  'url_anh',
  'url_video',
  'url_thumb',
  'ngay_dang',
  'gio_dang',
];

const HEADER_ALIASES = {
  fanpage_id: ['fanpage_id', 'page_id', 'id_fanpage'],
  fanpage_ten: ['fanpage_ten', 'page_name', 'ten_fanpage', 'fanpage'],
  chu_de: ['chu_de', 'topic', 'chu_de_bai', 'tieu_de'],
  noi_dung: ['noi_dung', 'content', 'noi_dung_bai', 'caption'],
  loai_media: ['loai_media', 'media_type', 'media'],
  url_anh: ['url_anh', 'image_url', 'anh'],
  url_video: ['url_video', 'video_url', 'video'],
  url_thumb: ['url_thumb', 'video_thumb_url', 'thumb'],
  ngay_dang: ['ngay_dang', 'scheduled_date', 'ngay'],
  gio_dang: ['gio_dang', 'scheduled_time', 'gio'],
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

export function parseCsvText(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const dataLines = lines.filter((l) => !l.startsWith('#'));

  if (!dataLines.length) {
    return { headers: [], rows: [] };
  }

  const headerCells = parseCsvLine(dataLines[0]).map(normalizeHeader);
  const fieldIndex = {};

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
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

export function buildImportTemplateXlsx(pages = []) {
  const wb = XLSX.utils.book_new();

  const guideLines = [
    ['Mẫu import bài viết AutoPost'],
    [''],
    ['Cột bắt buộc: fanpage_id HOẶC fanpage_ten, noi_dung'],
    ['loai_media: image | video | none (để trống = tự đoán từ URL)'],
    ['ngay_dang: YYYY-MM-DD, gio_dang: HH:MM — để trống nếu lên lịch sau'],
    [''],
  ];
  if (pages.length) {
    guideLines.push(['Fanpage của bạn:']);
    pages.forEach((p) => guideLines.push([`${p.id}`, p.name]));
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(guideLines), 'Huong dan');

  const examplePage = pages[0];
  const importRows = [
    TEMPLATE_COLUMNS,
    [
      examplePage?.id ?? '',
      examplePage?.name ?? 'Tên fanpage',
      'Ví dụ chủ đề',
      'Nội dung bài viết đầy đủ...',
      'image',
      'https://example.com/anh.jpg',
      '',
      '',
      '2026-06-20',
      '08:00',
    ],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(importRows), 'Import');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function parseExcelBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets.Import || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { rows: [] };

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  return parseSheetRows(data);
}

function parseSheetRows(data) {
  let headerRowIndex = -1;
  let fieldIndex = {};

  for (let i = 0; i < data.length; i += 1) {
    const headerCells = data[i].map((cell) => normalizeHeader(cell));
    const index = {};
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      const idx = headerCells.findIndex((h) => aliases.includes(h));
      if (idx >= 0) index[field] = idx;
    }
    if (index.noi_dung != null) {
      headerRowIndex = i;
      fieldIndex = index;
      break;
    }
  }

  if (headerRowIndex < 0) return { rows: [] };

  const rows = [];
  for (let i = headerRowIndex + 1; i < data.length; i += 1) {
    const cells = data[i].map((cell) => String(cell ?? '').trim());
    if (cells.every((c) => !c)) continue;

    const row = { _line: i + 1 };
    for (const [field, idx] of Object.entries(fieldIndex)) {
      row[field] = cells[idx] ?? '';
    }
    rows.push(row);
  }

  return { rows };
}

export function buildImportTemplateCsv(pages = []) {
  const commentLines = [
    '# Mau import bai viet AutoPost — xoa dong bat dau bang # truoc khi import (hoac de nguyen, he thong tu bo qua)',
    '# fanpage_id HOAC fanpage_ten: bat buoc mot trong hai',
    '# noi_dung: bat buoc',
    '# loai_media: image | video | none (de trong = tu doan tu url)',
    '# ngay_dang: YYYY-MM-DD, gio_dang: HH:MM — de trong neu len lich sau',
  ];

  if (pages.length) {
    commentLines.push(`# Fanpage cua ban: ${pages.map((p) => `${p.id}=${p.name}`).join('; ')}`);
  }

  const examplePage = pages[0];
  const exampleRow = [
    examplePage?.id ?? '',
    examplePage?.name ?? 'Ten fanpage',
    'Vi du chu de',
    'Noi dung bai viet day du...',
    'image',
    'https://example.com/anh.jpg',
    '',
    '',
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

function normalizeMediaType(value, row) {
  const raw = String(value || '').trim().toLowerCase();
  if (['image', 'anh', 'ảnh'].includes(raw)) return 'image';
  if (['video', 'vid'].includes(raw)) return 'video';
  if (['none', 'khong', ''].includes(raw)) {
    if (row.url_video) return 'video';
    if (row.url_anh) return 'image';
    return 'none';
  }
  if (row.url_video) return 'video';
  if (row.url_anh) return 'image';
  return 'none';
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

function resolvePageId(row, pagesById, pagesByName) {
  const id = Number(row.fanpage_id);
  if (id && pagesById.has(id)) return id;

  const name = String(row.fanpage_ten || '').trim().toLowerCase();
  if (name && pagesByName.has(name)) return pagesByName.get(name);

  return null;
}

export function normalizeImportRows(rows, accessiblePages) {
  const pagesById = new Map(accessiblePages.map((p) => [p.id, p]));
  const pagesByName = new Map(
    accessiblePages.map((p) => [String(p.name).trim().toLowerCase(), p.id])
  );

  const normalized = [];
  const errors = [];

  for (const row of rows) {
    const line = row._line || '?';
    const content = String(row.noi_dung || '').trim();

    if (!content) {
      errors.push({ line, error: 'Thiếu nội dung (noi_dung)' });
      continue;
    }

    const pageId = resolvePageId(row, pagesById, pagesByName);
    if (!pageId) {
      errors.push({ line, error: 'Không tìm thấy fanpage (fanpage_id hoặc fanpage_ten)' });
      continue;
    }

    const mediaType = normalizeMediaType(row.loai_media, row);
    const scheduledAt = buildScheduledAt(row.ngay_dang, row.gio_dang);

    normalized.push({
      line,
      page_id: pageId,
      topic: String(row.chu_de || '').trim(),
      content,
      media_type: mediaType,
      image_url: String(row.url_anh || '').trim() || null,
      video_url: String(row.url_video || '').trim() || null,
      video_thumb_url: String(row.url_thumb || '').trim() || null,
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
