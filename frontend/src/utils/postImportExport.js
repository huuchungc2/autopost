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

export function parseImportCsv(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const dataLines = lines.filter((l) => !l.startsWith('#'));

  if (!dataLines.length) {
    return { rows: [], errors: ['File trống hoặc không có header'] };
  }

  const headerCells = parseCsvLine(dataLines[0]).map(normalizeHeader);
  const fieldIndex = {};

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = headerCells.findIndex((h) => aliases.includes(h));
    if (idx >= 0) fieldIndex[field] = idx;
  }

  if (fieldIndex.noi_dung == null) {
    return { rows: [], errors: ['Thiếu cột noi_dung (nội dung bài)'] };
  }

  const rows = [];
  const errors = [];

  for (let i = 1; i < dataLines.length; i += 1) {
    const cells = parseCsvLine(dataLines[i]);
    if (cells.every((c) => !c)) continue;

    const row = { _line: i + 1 };
    for (const [field, idx] of Object.entries(fieldIndex)) {
      row[field] = cells[idx] ?? '';
    }

    const content = String(row.noi_dung || '').trim();
    if (!content) {
      errors.push(`Dòng ${row._line}: thiếu nội dung`);
      continue;
    }
    if (!row.fanpage_id && !row.fanpage_ten) {
      errors.push(`Dòng ${row._line}: thiếu fanpage_id hoặc fanpage_ten`);
      continue;
    }

    rows.push(row);
  }

  return { rows, errors };
}

export function downloadBlob(filename, content, mimeType = 'text/csv;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadImportTemplate(apiClient) {
  const response = await apiClient.get('/posts/import/template', { responseType: 'blob' });
  downloadBlob('mau-import-bai-viet.csv', response.data);
}
