# GroupFlow — FB Group Auto Poster

Chrome Extension trong `GroupFlow/fb-group-poster/`.

## Cài extension (dev)

1. Mở Chrome → `chrome://extensions`
2. Bật **Developer mode**
3. **Load unpacked** → chọn folder `GroupFlow/fb-group-poster`
4. Mở Facebook (đăng nhập) + bấm icon GroupFlow → Side Panel

## Cấu hình

1. **Cài đặt** → URL website (`https://tidien.xyz` production; `http://localhost:3001` khi dev local)
2. Đăng nhập tidien (email/password) hoặc dán **tidien API key**
3. **9Router API key** — generate ảnh / comment AI
4. (Tuỳ chọn) Google Drive Service Account JSON + Folder ID

## Backend API (AutoPost)

| Method | Endpoint |
|--------|----------|
| POST | `/api/group-posts/login` |
| GET | `/api/group-posts/drafts/pull` | **Tải draft từ website** |
| POST | `/api/group-posts/sync` |
| GET | `/api/group-posts/pending-comments?page=&limit=` |
| PATCH | `/api/group-posts/:id/commented` |
| PUT | `/api/group-posts/fb-profile` |

Migration: `024`–`026` (tự chạy khi restart backend)

## Tải bài từ website

1. Website → **Group → Import** → lưu draft
2. Extension → **⬇ Tải từ website** (cần đăng nhập tidien cùng user)
3. Bài vào queue local → generate ảnh → đăng group

## Tính năng

- Phase 1: Đăng bài Excel/nhập tay, generate ảnh, sync metadata
- Phase 2: Comment chéo + login tidien
- Phase 3: Lên lịch, Drive, activity log
- Phase 4: Radar Lead (quét từ khóa trong group)

PRD chi tiết: [`fb-group-poster-PRD.md`](../fb-group-poster-PRD.md)

## Lưu ý

- Chrome phải mở khi chạy lịch / radar
- DOM Facebook thay đổi thường xuyên — cập nhật `selectors.js`
- Ảnh không sync server — chỉ metadata
