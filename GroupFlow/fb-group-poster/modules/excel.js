window.GF = window.GF || {};

GF.excel = {
  REQUIRED_COLS: ['noi_dung', 'prompt_anh', 'ngay_dang', 'gio_dang'],

  HEADER_ALIASES: {
    noi_dung: ['noi_dung', 'content', 'noi_dung_bai', 'caption'],
    prompt_anh: ['prompt_anh', 'prompt', 'image_prompt'],
    ngay_dang: ['ngay_dang', 'scheduled_date', 'ngay', 'noi_dang'],
    gio_dang: ['gio_dang', 'scheduled_time', 'gio'],
    auto_generate_image: ['auto_generate_image', 'auto_generate', 'tu_xuat_anh'],
    anh_ngay_dang: ['anh_ngay_dang', 'image_date'],
    anh_gio_dang: ['anh_gio_dang', 'image_time'],
  },

  normalizeHeader(cell) {
    return String(cell || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_');
  },

  /** Đọc ô Excel — ưu tiên `w` (text hiển thị, giữ emoji Wingdings/PUA). */
  cellDisplayText(cell) {
    if (cell == null || cell === '') return '';
    if (typeof cell === 'object' && cell !== null) {
      if (cell.w != null) return String(cell.w).trim();
      if (cell.v != null) return String(cell.v).trim();
      return '';
    }
    return String(cell).trim();
  },

  normalizeField(text) {
    return GF.importTextNormalize?.normalize(text) ?? String(text ?? '').trim();
  },

  readSheetRow(sheet, rowIndex, colCount) {
    const cells = [];
    for (let col = 0; col < colCount; col += 1) {
      const addr = XLSX.utils.encode_cell({ r: rowIndex, c: col });
      cells.push(this.cellDisplayText(sheet[addr]));
    }
    return cells;
  },

  findHeaderRow(data) {
    for (let i = 0; i < data.length; i += 1) {
      const headerCells = data[i].map((cell) => this.normalizeHeader(cell));
      const index = {};
      for (const [field, aliases] of Object.entries(this.HEADER_ALIASES)) {
        const idx = headerCells.findIndex((h) => aliases.includes(h));
        if (idx >= 0) index[field] = idx;
      }
      if (index.noi_dung != null) {
        return { headerRowIndex: i, fieldIndex: index };
      }
    }
    return null;
  },

  rowToPost(raw, idx) {
    const norm = {};
    Object.entries(raw).forEach(([k, v]) => {
      norm[k.toLowerCase().trim()] = this.normalizeField(v);
    });
    return {
      id: `excel-${Date.now()}-${idx}`,
      source: 'excel',
      noi_dung: norm.noi_dung || '',
      prompt_anh: norm.prompt_anh || '',
      ngay_dang: norm.ngay_dang || '',
      gio_dang: norm.gio_dang || '',
      groupIds: [],
      imageStatus: 'pending',
      imageBase64: null,
      imageLocal: false,
      imageDriveId: null,
      autoGenerateImage: norm.auto_generate_image !== '0' && norm.auto_generate_image !== 'false',
      anh_ngay_dang: norm.anh_ngay_dang || '',
      anh_gio_dang: norm.anh_gio_dang || '',
      selected: false,
    };
  },

  parseSheetRows(data) {
    const header = this.findHeaderRow(data);
    if (!header) {
      throw new Error('Không tìm thấy cột noi_dung — dùng sheet Import trong file mẫu');
    }
    const { headerRowIndex, fieldIndex } = header;
    const missing = this.REQUIRED_COLS.filter((c) => fieldIndex[c] == null);
    if (missing.length) throw new Error(`Thiếu cột: ${missing.join(', ')}`);

    const rows = [];
    for (let i = headerRowIndex + 1; i < data.length; i += 1) {
      const cells = data[i].map((cell) => this.cellDisplayText(cell));
      if (cells.every((c) => !c)) continue;

      const raw = {};
      for (const [field, idx] of Object.entries(fieldIndex)) {
        raw[field] = cells[idx] ?? '';
      }
      const content = this.normalizeField(raw.noi_dung).trim();
      if (!content) continue;

      raw.noi_dung = content;
      if (raw.prompt_anh) raw.prompt_anh = this.normalizeField(raw.prompt_anh);
      rows.push(this.rowToPost(raw, rows.length));
    }
    if (!rows.length) throw new Error('Không có dòng hợp lệ trong file');
    return rows;
  },

  parseCsv(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) throw new Error('File CSV trống');
    const headers = lines[0].split(/[,;\t]/).map((h) => this.normalizeHeader(h));
    const fieldIndex = {};
    for (const [field, aliases] of Object.entries(this.HEADER_ALIASES)) {
      const idx = headers.findIndex((h) => aliases.includes(h));
      if (idx >= 0) fieldIndex[field] = idx;
    }
    if (fieldIndex.noi_dung == null) {
      throw new Error('Không tìm thấy cột noi_dung');
    }
    const missing = this.REQUIRED_COLS.filter((c) => fieldIndex[c] == null);
    if (missing.length) throw new Error(`Thiếu cột: ${missing.join(', ')}`);

    const rows = [];
    lines.slice(1).forEach((line, idx) => {
      const cells = line.split(/[,;\t]/);
      const raw = {};
      for (const [field, i] of Object.entries(fieldIndex)) {
        raw[field] = this.normalizeField((cells[i] || '').trim());
      }
      const content = (raw.noi_dung || '').trim();
      if (!content) return;
      raw.noi_dung = content;
      rows.push(this.rowToPost(raw, idx));
    });
    if (!rows.length) throw new Error('Không có dòng hợp lệ trong file');
    return rows;
  },

  parseWorkbook(arrayBuffer) {
    if (typeof XLSX === 'undefined') {
      throw new Error('Thư viện XLSX chưa load — dùng file CSV hoặc thêm lib/xlsx.full.min.js');
    }
    const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
    const sheet = wb.Sheets.Import || wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error('File Excel trống');

    const ref = sheet['!ref'];
    if (!ref) throw new Error('File Excel trống');
    const range = XLSX.utils.decode_range(ref);
    const data = [];
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      data.push(this.readSheetRow(sheet, r, range.e.c + 1));
    }
    return this.parseSheetRows(data);
  },

  async parseFile(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.csv')) {
      const text = await file.text();
      return this.parseCsv(text);
    }
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      const buf = await file.arrayBuffer();
      return this.parseWorkbook(buf);
    }
    throw new Error('Chỉ hỗ trợ .csv, .xlsx, .xls');
  },
};
