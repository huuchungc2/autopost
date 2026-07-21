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
    // Cột ngành nghề (tùy chọn) — tên ngành cách nhau dấu phẩy. Thiếu cột → bài coi như chưa gán ngành.
    // Tên ngành được khớp sang id ở sidepanel (state.categories) sau khi parse.
    nganh_nghe: ['nganh_nghe', 'nganh', 'category', 'nganhnghe'],
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

  normalizeDateFormat(dateStr) {
    const trimmed = String(dateStr || '').trim();
    // Chuẩn hóa DD-MM-YYYY → YYYY-MM-DD (nội bộ)
    const ddmmyyyy = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (ddmmyyyy) {
      return `${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2, '0')}-${ddmmyyyy[1].padStart(2, '0')}`;
    }
    // Đã là YYYY-MM-DD, giữ nguyên
    const yyyymmdd = trimmed.match(/^\d{4}-\d{2}-\d{2}$/);
    if (yyyymmdd) return trimmed;
    return trimmed; // Format khác, trả về nguyên văn (có thể invalid)
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
      ngay_dang: this.normalizeDateFormat(norm.ngay_dang) || '',
      gio_dang: norm.gio_dang || '',
      groupIds: [],
      imageStatus: 'pending',
      imageBase64: null,
      imageLocal: false,
      imageDriveId: null,
      autoGenerateImage: norm.auto_generate_image !== '0' && norm.auto_generate_image !== 'false',
      anh_ngay_dang: norm.anh_ngay_dang || '',
      anh_gio_dang: norm.anh_gio_dang || '',
      categories: [],
      // Tên ngành thô từ cột "Ngành nghề" (nếu có) — sidepanel khớp sang id ngành. Thiếu → [].
      _categoryNames: String(norm.nganh_nghe || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean),
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

  /** File mẫu để user điền — đúng tên cột `parseWorkbook()` cần, sheet tên "Import". */
  buildTemplateWorkbook() {
    if (typeof XLSX === 'undefined') {
      throw new Error('Thư viện XLSX chưa load — reload extension rồi thử lại');
    }
    const headers = Object.keys(this.HEADER_ALIASES);
    const example1 = [
      'Bài viết 1 nội dung — Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
      'A beautiful sunset over the mountains, golden hour light, cinematic photography',
      '20-07-2026',
      '08:30',
      '1',
      '',
      '',
      'Bất động sản, Du lịch',
    ];
    const example2 = [
      'Bài viết 2 — Nội dung khác — Có thể để trống prompt_anh nếu không dùng ảnh AI',
      '',
      '21-07-2026',
      '14:00',
      '',
      '',
      '',
      '',
    ];
    const aoa = [headers, example1, example2];
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    sheet['!cols'] = headers.map((h) => ({ wch: Math.max(18, h.length + 4) }));

    // Sheet hướng dẫn
    const guideAoa = [
      ['HƯỚNG DẪN IMPORT BÀI VIẾT'],
      [],
      ['CỘT CẦN CÓ (bắt buộc):'],
      ['noi_dung', 'Nội dung bài viết (text, spintax {chữ 1|chữ 2})'],
      ['prompt_anh', 'Prompt tạo ảnh AI (để trống = chỉ text, không tạo ảnh)'],
      ['ngay_dang', 'Ngày đăng (DD-MM-YYYY, vd: 20-07-2026)'],
      ['gio_dang', 'Giờ đăng (HH:MM, vd: 08:30)'],
      [],
      ['CỘT TÙYCHỌN:'],
      ['auto_generate_image', 'Tự tạo ảnh từ prompt? (1/0, mặc định: 1)'],
      ['anh_ngay_dang', 'Ngày tạo ảnh riêng (nếu khác ngày đăng)'],
      ['anh_gio_dang', 'Giờ tạo ảnh riêng (nếu khác giờ đăng)'],
      ['nganh_nghe', 'Ngành nghề (tên, cách nhau dấu phẩy) — để trống = chưa gán. Tên phải khớp danh mục trong extension'],
      [],
      ['CÁCH DÙNG:'],
      ['1. Điền nội dung bài viết vào cột noi_dung'],
      ['2. Nếu dùng ảnh AI, điền prompt vào prompt_anh'],
      ['3. Khi import, mỗi bài sẽ có nút 📋 Copy prompt để copy prompt ảnh dán vào chỗ khác'],
      ['4. Chọn nhóm đăng, chọn ngày/giờ, rồi bấm Đăng hoặc Lên lịch'],
      [],
      ['LƯU Ý:'],
      ['- Format ngày/giờ sai → có thể báo lỗi hoặc đặt mặc định'],
      ['- Prompt ảnh để trống = chỉ đăng text, không tạo ảnh'],
      ['- Xóa các dòng ví dụ trước khi điền dữ liệu thật'],
    ];
    const guideSheet = XLSX.utils.aoa_to_sheet(guideAoa);
    guideSheet['!cols'] = [{ wch: 25 }, { wch: 60 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Import');
    XLSX.utils.book_append_sheet(wb, guideSheet, 'Hướng dẫn');
    return wb;
  },

  templateArrayBuffer() {
    return XLSX.write(this.buildTemplateWorkbook(), { type: 'array', bookType: 'xlsx' });
  },
};
