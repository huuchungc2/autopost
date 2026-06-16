import * as XLSX from 'xlsx';

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

  if (headerRowIndex < 0) {
    return { rows: [], errors: ['Không tìm thấy cột noi_dung — dùng sheet Import trong file mẫu'] };
  }

  const rows = [];
  const errors = [];

  for (let i = headerRowIndex + 1; i < data.length; i += 1) {
    const cells = data[i].map((cell) => String(cell ?? '').trim());
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

export function parseImportExcel(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheet = workbook.Sheets.Import || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    return { rows: [], errors: ['File Excel trống'] };
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  return parseSheetRows(data);
}

export function downloadBlob(filename, content, mimeType = 'application/octet-stream') {
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
  downloadBlob(
    'mau-import-bai-viet.xlsx',
    response.data,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}
