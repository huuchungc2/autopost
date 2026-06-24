# GroupFlow — FB Group Auto Poster

Chrome Extension trong `GroupFlow/fb-group-poster/`.

## Cài extension (dev)

1. Chạy `node build-sw-bundle.js` (nếu sửa module SW) rồi `.\validate.ps1`
2. **Xóa** mọi file tham chiếu GPP (`_ref-*`, `*.zip`, `2.3.2_0/`) — Chrome **từ chối load** nếu có tên `_...`
3. Mở Chrome → `chrome://extensions`
4. Bật **Developer mode**
5. **Load unpacked** → chọn **đúng** folder `GroupFlow/fb-group-poster` (không chọn `ref-group-posting`)
6. **Reload** → version **1.0.10**
7. **Bấm icon** → cửa sổ popup GroupFlow

**Service worker “Không hoạt động”** = SW đang ngủ (MV3 bình thường). Popup vẫn mở được.

**Nút Lỗi đỏ** → thường do `_ref-group-posting/` bị copy nhầm vào folder extension, hoặc lỗi CSP cũ (đã bỏ Google Fonts v1.0.6). Bấm **Xóa tất cả** trên trang Lỗi sau khi Reload.

## Cấu hình

1. **Cài đặt** → URL website (`https://tidien.xyz` production; `http://localhost:3001` khi dev local)
2. Đăng nhập tidien (email/password) hoặc dán **tidien API key** (Settings website → GroupFlow Extension)
3. Chọn **Text provider** + **Image provider** — giống fanpage (tạo tại Providers trên web). **9Router API key** chỉ dự phòng khi chưa chọn provider.
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
| GET | `/api/group-posts/ai-providers` |
| POST | `/api/group-posts/ai/image` |
| POST | `/api/group-posts/ai/text` |

Migration: `024`–`026` (tự chạy khi restart backend)

## Tải bài từ website

1. Website → **Group → Import** → lưu draft
2. Extension → **⬇ Tải từ website** (cần đăng nhập tidien cùng user)
3. Bài vào queue local → generate ảnh → đăng group

## Tính năng

- Phase 1: Đăng bài Excel/nhập tay, generate ảnh, sync metadata
- Phase 2: Comment chéo (GraphQL nền + lịch batch) + login tidien
- Phase 3: Lên lịch, Drive, activity log
- Phase 4: Radar Lead (quét từ khóa trong group)

PRD chi tiết: [`fb-group-poster-PRD.md`](../fb-group-poster-PRD.md)

Tham chiếu Group Posting Pro (dev only, **không** để trong folder extension — Chrome chặn tên `_*`): [`../ref-group-posting/`](../ref-group-posting/)

## Lưu ý

- Chrome phải mở khi chạy lịch / radar
- DOM Facebook thay đổi thường xuyên — cập nhật `selectors.js`
- Ảnh không sync server — chỉ metadata
