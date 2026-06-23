window.GF = window.GF || {};

GF.excel = {
  REQUIRED_COLS: ['noi_dung', 'prompt_anh', 'ngay_dang', 'gio_dang'],

  parseCsv(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(/[,;\t]/).map((h) => h.trim().toLowerCase());
    const missing = this.REQUIRED_COLS.filter((c) => !headers.includes(c));
    if (missing.length) throw new Error(`Thiếu cột: ${missing.join(', ')}`);

    return lines.slice(1).map((line, idx) => {
      const cells = line.split(/[,;\t]/);
      const row = {};
      headers.forEach((h, i) => { row[h] = (cells[i] || '').trim(); });
      return {
        id: `excel-${Date.now()}-${idx}`,
        source: 'excel',
        noi_dung: row.noi_dung,
        prompt_anh: row.prompt_anh,
        ngay_dang: row.ngay_dang,
        gio_dang: row.gio_dang,
        imageStatus: 'pending',
        imageBase64: null,
        imageLocal: false,
        imageDriveId: null,
        selected: true,
      };
    });
  },

  parseWorkbook(arrayBuffer) {
    if (typeof XLSX === 'undefined') {
      throw new Error('Thư viện XLSX chưa load — dùng file CSV hoặc thêm lib/xlsx.full.min.js');
    }
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const missing = this.REQUIRED_COLS.filter(
      (c) => !Object.keys(rows[0] || {}).some((k) => k.toLowerCase() === c)
    );
    if (missing.length) throw new Error(`Thiếu cột: ${missing.join(', ')}`);

    return rows.map((raw, idx) => {
      const norm = {};
      Object.entries(raw).forEach(([k, v]) => { norm[k.toLowerCase().trim()] = String(v).trim(); });
      return {
        id: `excel-${Date.now()}-${idx}`,
        source: 'excel',
        noi_dung: norm.noi_dung,
        prompt_anh: norm.prompt_anh,
        ngay_dang: norm.ngay_dang,
        gio_dang: norm.gio_dang,
        imageStatus: 'pending',
        imageBase64: null,
        imageLocal: false,
        imageDriveId: null,
        selected: true,
      };
    });
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
