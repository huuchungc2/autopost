# Website Blog — content SEO cho website (tách khỏi flow fanpage)

## Tóm tắt

Tích hợp 2 prompt do Tony cung cấp (`prompts/website-blog-prompt.js`, `prompts/fanpage-prompt.js`) vào AutoPost. Tạo bài blog SEO cho **website** (không phải Facebook) — lưu nháp trong `posts` (`platform='website'`, `status='draft'`), **không** đụng cronjob đăng Facebook hiện tại. Đồng thời nâng cấp generate fanpage hiện tại với tỷ lệ nội dung 70/20/10 (additive, không đổi JSON contract cũ).

AutoPost không có bảng `projects` riêng — mỗi **fanpage** (`fb_pages`) đóng vai trò 1 "dự án" (tên + Skill = brand voice). Các trường business thật (giá, USP, hotline, FAQ khách) **chưa có cột DB** — `getProjectContext()` trả về placeholder `[CẦN BỔ SUNG: ...]` cho các trường này thay vì bịa, kèm danh sách `missingFields`/`missing_project_fields` để hiển thị TODO cho người dùng điền tay khi review bài (xem mục "Việc còn thiếu" bên dưới).

## Luồng

1. **Cài đặt → Fanpage**: chọn fanpage đại diện cho dự án (đã có tên + skill text gán sẵn).
2. **Tạo bài → tab "Website Blog"**: chọn fanpage, nhập chủ đề (+ research brief tuỳ chọn) → **Tạo bài blog**.
3. Backend: `getProjectContext(pageId)` → `buildWebsiteBlogPrompt()` → AI text → parse `---`-delimited output (title/meta/slug/keyword/content/image_prompts/internal_links/todo_missing_info).
4. Ảnh đầu tiên (`image_prompts[0]`) generate đồng bộ ngay trong request: gọi `generateImage()` hiện có (ephemeral, không tự lưu) → convert WebP bằng `sharp` → lưu qua **đúng cơ chế `storeImageBuffer()` hiện tại** (Google Drive hoặc local VPS tuỳ `media_storage`), tên file `{slug}-1.webp` thay vì timestamp ngẫu nhiên. Ảnh 2-3 (nếu AI đề xuất) chỉ lưu prompt trong `seo_meta.image_prompts`, generate tay sau qua UI sửa bài có sẵn — không thêm vào hàng đợi tự động (giữ nguyên `imageGenerateJobService.js`).
5. Lưu `posts` row: `platform='website'`, `status='draft'` (không bao giờ `'scheduled'` → **không bị cron `publishDuePosts` quét trúng**), `seo_meta` (JSON: title, meta_description, slug, primary_keyword, image_prompts, internal_links_suggested, todo_missing_info).
6. Kết quả hiển thị ngay trên trang Tạo bài (chưa có trang danh sách/quản lý riêng — xem "Việc còn thiếu").

## DB / config

| Bảng | Cột mới | Ý nghĩa |
|------|---------|---------|
| `posts` | `platform` ENUM('fanpage','website') DEFAULT 'fanpage' | Phân biệt nguồn; mọi INSERT cũ không khai báo cột này tự nhận 'fanpage' (tương thích ngược) |
| `posts` | `post_type` ENUM('gia_tri','gioi_thieu','ban_hang') NULL | Theo dõi tỷ lệ nội dung 70/20/10 cho fanpage (AI tự chọn dựa 7 bài gần nhất) |
| `posts` | `seo_meta` JSON NULL | Metadata blog: title/meta_description/slug/primary_keyword/image_prompts/internal_links_suggested/todo_missing_info |

Migration: `030_posts_platform_post_type.sql`, guard `ensurePostsPlatformPostType()` trong `migrationRunner.js` (tự chạy lúc start, theo đúng pattern các migration khác).

`GET /api/posts` mặc định lọc `platform='fanpage'` (giữ nguyên hành vi cũ cho danh sách/lịch fanpage) — truyền `?platform=website` hoặc `?platform=all` để xem bài blog.

## File code

| File | Vai trò |
|------|---------|
| `backend/src/prompts/websiteBlogPrompt.js`, `fanpagePrompt.js` | Port ESM từ `prompts/*.js` (CommonJS gốc do Tony cung cấp) |
| `backend/src/services/projectContentService.js` | `getProjectContext()`, `generateWebsiteBlog()`, `parseWebsiteBlogOutput()`, `generateBlogImage()` (WebP + slug filename) |
| `backend/src/services/contentGenerationService.js` | Nâng cấp additive: `buildRatioGuide()`, `post_type` trong JSON output/parse, `generatePostWithMedia()` tự query 7 bài fanpage gần nhất |
| `backend/src/services/mediaStorage.js` | `storeImageBuffer()` thêm option `filename` (override tên file mặc định — tương thích ngược, caller cũ không truyền vẫn y nguyên) |
| `backend/src/routes/posts.js` | `POST /generate-website-blog` (mới); `POST /generate` lưu thêm `post_type`; `GET /` lọc `platform` |
| `frontend/src/pages/Generate.jsx` | Tab **Website Blog** mới — form chủ đề + research brief, panel kết quả (title/meta/slug/content/TODO) |

## Việc còn thiếu (TODO — cần Tony cung cấp/quyết định)

- [ ] **Dữ liệu kinh doanh thật**: AutoPost chưa có nơi lưu giá/USP/hotline/FAQ khách theo từng fanpage — `getProjectContext()` hiện trả placeholder `[CẦN BỔ SUNG: ...]`. Nếu muốn AI tự điền đúng, cần: (a) thêm bảng/cột lưu các trường này, (b) UI nhập liệu. Chưa làm vì đây đúng là "data kinh doanh thật" theo yêu cầu — để TODO thay vì tự bịa schema.
- [ ] **Trang quản lý bài blog riêng**: hiện chỉ xem kết quả ngay sau khi tạo trên trang Tạo bài (không có danh sách/lọc/sửa hàng loạt như Posts.jsx). Có thể thêm `Posts.jsx`-style view lọc `platform=website` sau nếu cần.
- [ ] **Publish bài blog lên CMS website thật**: ngoài scope — AutoPost hiện không tích hợp CMS nào; bài lưu draft để copy/export thủ công.
- [ ] **Cảnh báo khi bấm "Đăng ngay" trên bài platform='website'** trong trình sửa bài chung (`PostEditor.jsx`): route publish hiện không phân biệt platform — nếu user cố tình bấm đăng 1 bài blog, hệ thống vẫn sẽ cố đăng lên Facebook (vì không đổi flow đăng bài theo yêu cầu). Rủi ro thấp (cần thao tác tay), nhưng nên thêm guard nếu phát sinh nhầm lẫn thực tế.
- [ ] **`/write-zalo`, retention gate TikTok/Reel, module tính điểm SEO bằng code** — theo đúng ghi chú trong `prompts/HUONG-DAN-SU-DUNG.md` mục 6, chưa làm (cần spec riêng).

## Lưu ý ảnh

- Dùng đúng `storeImageBuffer()` hiện có — không thêm storage backend mới.
- **Google Drive**: URL `drive.google.com/uc?export=view&id=...` đã public (quyền `anyone:reader` set sẵn lúc upload) nhưng **không phải CDN chính thức** — Google không cam kết ổn định lâu dài cho hotlink kiểu này ở traffic lớn.
- **Local VPS**: serve qua `PUBLIC_BASE_URL/images/...`; hiện **không có cron tự xoá ảnh cũ** (biến `IMAGE_CLEANUP_DAYS` trong `.env.example` chưa được implement ở đâu) — ảnh tồn tại tới khi đầy dung lượng, an toàn để link từ website.

## Checklist deploy

- [ ] Migration `030` tự chạy lúc start backend (`ensurePostsPlatformPostType`).
- [ ] `npm install` lại backend (`sharp` mới thêm vào `package.json`).
- [ ] Build lại frontend (tab Website Blog mới trong `Generate.jsx`).
- [ ] Test tạo 1 bài blog thật → kiểm tra `seo_meta` lưu đúng, ảnh lên đúng Drive/local, bài **không** xuất hiện trong danh sách Posts mặc định (phải lọc `platform=website` mới thấy).
