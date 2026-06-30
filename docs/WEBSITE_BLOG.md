# Website Blog — content SEO cho website (tách khỏi flow fanpage)

## Tóm tắt

Tích hợp 2 prompt do Tony cung cấp (`prompts/website-blog-prompt.js`, `prompts/fanpage-prompt.js`) vào AutoPost. Tạo bài blog SEO cho **website** (không phải Facebook) — lưu nháp trong `posts` (`platform='website'`, `status='draft'`), **không** đụng cronjob đăng Facebook hiện tại. Đồng thời nâng cấp generate fanpage hiện tại với tỷ lệ nội dung 70/20/10 (additive, không đổi JSON contract cũ). Có thêm publish API để đẩy bài blog đã generate lên CMS website thật — xem `docs/WEBSITE_PUBLISH_API.md`.

**Website là 1 entity độc lập với Fanpage Facebook** (bảng `websites` riêng, không phải `fb_pages`) — xác nhận với Tony ngày 2026-06-30 rằng website và fanpage **không phải lúc nào cũng 1-1** (bản đầu tiên gắn nhầm config vào `fb_pages`, đã refactor lại). Mỗi website có Skill brand voice + text/image provider riêng, y hệt cách fanpage hoạt động, quản lý tại mục **Website** trong sidebar.

Các trường business thật (giá, USP, hotline, FAQ khách) **chưa có cột DB** trên `websites` — `getProjectContext()` trả về placeholder `[CẦN BỔ SUNG: ...]` cho các trường này thay vì bịa, kèm danh sách `missingFields`/`missing_project_fields` để hiển thị TODO cho người dùng điền tay khi review bài (xem mục "Việc còn thiếu" bên dưới).

## Luồng

1. **Website → Thêm website**: tạo website (tên, domain tuỳ chọn), gán Skill brand voice + text/image provider, tuỳ chọn nhập Publish URL/API Key nếu đã có CMS nhận bài.
2. **Tạo bài → tab "Website Blog"**: chọn website, nhập chủ đề (+ research brief tuỳ chọn) → **Tạo bài blog**.
3. Backend: `getWebsiteGenerationConfig(websiteId)` (đọc bảng `websites` JOIN `skills`/`ai_providers`) → `getProjectContext(websiteId)` → `buildWebsiteBlogPrompt()` → AI text → parse `---`-delimited output (title/meta/slug/keyword/content/image_prompts/internal_links/todo_missing_info).
4. Ảnh đầu tiên (`image_prompts[0]`) generate đồng bộ ngay trong request: gọi `generateImage()` hiện có (ephemeral, không tự lưu) → convert WebP bằng `sharp` → lưu qua **đúng cơ chế `storeImageBuffer()` hiện tại** (Google Drive folder gốc global hoặc local VPS tuỳ `media_storage` — website không có folder Drive riêng như fanpage), tên file `{slug}-1.webp` thay vì timestamp ngẫu nhiên. Ảnh 2-3 (nếu AI đề xuất) chỉ lưu prompt trong `seo_meta.image_prompts`, generate tay sau — không thêm vào hàng đợi tự động.
5. Lưu `posts` row: `platform='website'`, `website_id` (FK → `websites.id`, **`page_id` để NULL**), `status='draft'` (không bao giờ `'scheduled'` → **không bị cron `publishDuePosts` quét trúng**), `seo_meta` (JSON: title, meta_description, slug, primary_keyword, image_prompts, internal_links_suggested, todo_missing_info).
6. Kết quả hiển thị ngay trên trang Tạo bài, có nút **"Publish lên website"** nếu website đã cấu hình Publish URL (xem `docs/WEBSITE_PUBLISH_API.md`) và link **"Mở bài trong trình sửa"** sang trang quản lý (mục 7).
7. **Bài Website Blog** (sidebar) — `WebsiteBlogPosts.jsx`: danh sách tất cả bài `platform='website'` (lọc theo website), xem ảnh/tiêu đề/trạng thái/link publish. Bấm **Sửa** → `WebsiteBlogPostEditor.jsx`: sửa title/slug/meta_description/primary_keyword/content, generate/regenerate ảnh thủ công, publish lên website, xoá bài. Đây là nơi duy nhất để xem lại bài đã tạo qua import Excel (xem mục dưới).

### Luồng thay thế — Import Excel hàng loạt (nội dung viết sẵn)

Dành cho khi đã có sẵn nội dung (tự viết, hoặc nhờ AI ngoài như ChatGPT viết rồi dán vào Excel) thay vì generate từng bài qua UI:

1. **Tạo bài → tab "Website Blog" → "Import Excel hàng loạt"** → tải file mẫu (6 cột: `tieu_de, slug, meta_description, tu_khoa_chinh, noi_dung, prompt_anh`).
2. Điền nội dung đã có sẵn vào file (AutoPost **không gọi AI viết text lúc import** — giống hệt cơ chế import Excel fanpage hiện có, xem `postImportExportService.js`).
3. Chọn 1 **website** ở dropdown trên form (không phải cột trong Excel) → áp dụng cho cả batch, upload file.
4. Backend (`POST /api/posts/import-website-blog`) parse file → insert thẳng từng dòng vào `posts` (`platform='website'`, `status='draft'`, `seo_meta` từ 4 cột SEO) — không gọi AI.
5. Nếu tick "tự generate ảnh" + dòng có cột `prompt_anh`: đánh dấu `image_job_status='pending'`, cron `processPendingWebsiteImageJobs` (mỗi 5 phút, `websiteImageJobService.js`) xử lý bất đồng bộ — tái dùng `generateBlogImage()` nên ảnh vẫn đặt tên theo slug + convert WebP, đúng cơ chế như flow generate 1 bài qua UI (khác với job ảnh fanpage hiện có, vốn đặt tên `autopost-{timestamp}` không convert WebP).

## DB / config

| Bảng | Cột | Ý nghĩa |
|------|-----|---------|
| `websites` (mới) | `id, name, domain, skill_id, text_provider_id, image_provider_id, publish_url, api_key, is_active` | Entity độc lập, không phụ thuộc `fb_pages`. CRUD qua `routes/websites.js`, UI tại `frontend/src/pages/Websites.jsx`/`WebsiteForm.jsx` |
| `posts` | `platform` ENUM('fanpage','website') DEFAULT 'fanpage' | Phân biệt nguồn; mọi INSERT cũ không khai báo cột này tự nhận 'fanpage' (tương thích ngược) |
| `posts` | `website_id` INT NULL (FK → `websites.id`) | Chỉ set khi `platform='website'`; `page_id` để NULL trong trường hợp này |
| `posts` | `page_id` INT NULL (đổi từ NOT NULL) | Vẫn bắt buộc về mặt logic cho `platform='fanpage'`, nhưng cột DB đã nullable để cho phép bài website không gắn fanpage nào |
| `posts` | `post_type` ENUM('gia_tri','gioi_thieu','ban_hang') NULL | Theo dõi tỷ lệ nội dung 70/20/10 cho fanpage (AI tự chọn dựa 7 bài gần nhất) |
| `posts` | `seo_meta` JSON NULL | Metadata blog: title/meta_description/slug/primary_keyword/image_prompts/internal_links_suggested/todo_missing_info |
| `posts` | `website_post_id, website_post_url, website_published_at` | Kết quả sau khi bấm "Publish lên website" — xem `docs/WEBSITE_PUBLISH_API.md` |

Migration: `030_posts_platform_post_type.sql` (guard `ensurePostsPlatformPostType()`), `031_websites_table.sql` (guard `ensureWebsitesTable()`) trong `migrationRunner.js` (tự chạy lúc start, theo đúng pattern các migration khác).

`GET /api/posts` mặc định lọc `platform='fanpage'` (giữ nguyên hành vi cũ cho danh sách/lịch fanpage) — truyền `?platform=website` hoặc `?platform=all` để xem bài blog. Vì bài website không có `page_id`, filter quyền theo `user_pages` được bỏ qua cho `platform='website'` (chưa có `user_websites` — mọi user đăng nhập đều xem được).

## Phân quyền

CRUD website (tạo/sửa/xoá) yêu cầu role `admin`/`super_admin` (`canManageWebsites`). Generate bài blog + publish + xem bài website thì **mọi user đăng nhập** đều làm được (chưa có bảng `user_websites` để giới hạn theo từng website như `user_pages` làm với fanpage) — cân nhắc thêm nếu cần phân quyền chặt hơn sau này.

## File code

| File | Vai trò |
|------|---------|
| `backend/migrations/031_websites_table.sql` | Bảng `websites`, `posts.website_id`, `posts.page_id` nullable, `posts.website_post_id/url/published_at` |
| `backend/src/routes/websites.js` | CRUD website (`GET/POST/PUT/DELETE /api/websites`) |
| `backend/src/prompts/websiteBlogPrompt.js`, `fanpagePrompt.js` | Port ESM từ `prompts/*.js` (CommonJS gốc do Tony cung cấp) |
| `backend/src/services/projectContentService.js` | `getWebsiteGenerationConfig()`, `getProjectContext()`, `generateWebsiteBlog()`, `parseWebsiteBlogOutput()`, `generateBlogImage()` (WebP + slug filename) — đọc từ `websites`, không còn mượn `fb_pages` |
| `backend/src/services/websitePublishService.js` | `publishPostToWebsite()` — gọi `websites.publish_url` (xem `docs/WEBSITE_PUBLISH_API.md`) |
| `backend/src/services/contentGenerationService.js` | Nâng cấp additive: `buildRatioGuide()`, `post_type` trong JSON output/parse, `generatePostWithMedia()` tự query 7 bài fanpage gần nhất |
| `backend/src/services/mediaStorage.js` | `storeImageBuffer()` thêm option `filename` (override tên file mặc định — tương thích ngược, caller cũ không truyền vẫn y nguyên) |
| `backend/src/services/pageAccessService.js` | `assertPostAccess()` bỏ qua check `user_pages` cho bài `platform='website'` |
| `backend/src/routes/posts.js` | `POST /generate-website-blog`, `POST /:id/publish-website` (mới, dùng `website_id`); `POST /generate` lưu thêm `post_type`; `GET /` LEFT JOIN `fb_pages`+`websites`, lọc `platform` |
| `frontend/src/pages/Websites.jsx`, `WebsiteForm.jsx` | Trang quản lý Website (list + form), route `/websites` |
| `frontend/src/pages/Generate.jsx` | Tab **Website Blog** — chọn Website (không phải Fanpage), form chủ đề + research brief, panel kết quả + nút Publish lên website |
| `backend/src/services/websiteImportExportService.js` | Template Excel + `normalizeWebsiteImportRows()` cho import hàng loạt (6 cột SEO) |
| `backend/src/services/websiteImageJobService.js` | `processPendingWebsiteImageJobs()` — cron generate ảnh bất đồng bộ sau import, tái dùng `generateBlogImage()` |
| `backend/src/services/postImportExportService.js` | `parseExcelBuffer`/`parseCsvText`/`parseSheetRows` parameterize thêm `headerAliases`/`requiredField` tuỳ chỉnh (mặc định giữ nguyên hành vi cho fanpage) — website tái dùng qua `websiteImportExportService.js` |
| `frontend/src/pages/WebsiteImport.jsx`, `components/WebsiteImportForm.jsx` | UI import Excel hàng loạt cho Website Blog, route `/posts/import-website-blog` |
| `frontend/src/pages/WebsiteBlogPosts.jsx`, `WebsiteBlogPostEditor.jsx` | Trang danh sách + sửa bài Website Blog, route `/website-posts` |
| `backend/src/routes/posts.js` | `GET /` thêm filter `website_id`; `PUT /:id` thêm sửa `seo_meta` (merge); route mới `POST /:id/generate-website-image` (bản website-aware của `/:id/generate-image`) |

## Việc còn thiếu (TODO — cần Tony cung cấp/quyết định)

- [ ] **Dữ liệu kinh doanh thật**: AutoPost chưa có nơi lưu giá/USP/hotline/FAQ khách theo từng website — `getProjectContext()` hiện trả placeholder `[CẦN BỔ SUNG: ...]`. Nếu muốn AI tự điền đúng, cần: (a) thêm cột lưu các trường này trên `websites`, (b) UI nhập liệu. Chưa làm vì đây đúng là "data kinh doanh thật" theo yêu cầu — để TODO thay vì tự bịa schema.
- [x] **Trang quản lý bài blog riêng**: `WebsiteBlogPosts.jsx` (danh sách, lọc theo website) + `WebsiteBlogPostEditor.jsx` (sửa SEO meta/content, generate ảnh, publish, xoá) — route `/website-posts`, riêng biệt với `PostEditor.jsx` (vốn không hỗ trợ bài không có `page_id`).
- [x] **Publish bài blog lên CMS website thật**: nút "Publish lên website" gọi `websitePublishService.js`, cấu hình endpoint/API key theo từng **website** tại Website → Sửa. Xem `docs/WEBSITE_PUBLISH_API.md`. Vẫn cần dev 3 website dựng endpoint theo spec trước khi dùng được — chưa test thật với endpoint nào.
- [ ] **`user_websites`**: chưa có bảng phân quyền theo từng website — mọi user đăng nhập đều generate/publish/xem được mọi website đang hoạt động.
- [ ] **"AI tự viết N bài → Excel" trong 1 lần bấm**: hiện chưa có (kiểu trang Hàng loạt `BatchGenerate.jsx` cho fanpage) — Import Excel chỉ nhận nội dung đã viết sẵn, người dùng phải tự nhờ AI ngoài viết rồi dán vào template trước.
- [ ] **`/write-zalo`, retention gate TikTok/Reel, module tính điểm SEO bằng code** — theo đúng ghi chú trong `prompts/HUONG-DAN-SU-DUNG.md` mục 6, chưa làm (cần spec riêng).

## Lưu ý ảnh

- Dùng đúng `storeImageBuffer()` hiện có — không thêm storage backend mới.
- Website không có folder Drive riêng như fanpage (`fb_pages.google_drive_folder_id`) — ảnh blog luôn lưu vào folder gốc global trong Cài đặt khi dùng Google Drive.
- **Google Drive**: URL `drive.google.com/uc?export=view&id=...` đã public (quyền `anyone:reader` set sẵn lúc upload) nhưng **không phải CDN chính thức** — Google không cam kết ổn định lâu dài cho hotlink kiểu này ở traffic lớn.
- **Local VPS**: serve qua `PUBLIC_BASE_URL/images/...`; hiện **không có cron tự xoá ảnh cũ** (biến `IMAGE_CLEANUP_DAYS` trong `.env.example` chưa được implement ở đâu) — ảnh tồn tại tới khi đầy dung lượng, an toàn để link từ website.

## Checklist deploy

- [ ] Migration `030` + `031` tự chạy lúc start backend (`ensurePostsPlatformPostType`, `ensureWebsitesTable`).
- [ ] `npm install` lại backend (`sharp` mới thêm vào `package.json`).
- [ ] Build lại frontend (mục Website mới trong sidebar, tab Website Blog đổi sang chọn Website).
- [ ] Tạo 3 website (zalopilot.vn/hopgiayre.vn/datxeveque.vn) tại **Website → Thêm website**, gán skill + provider.
- [ ] Test tạo 1 bài blog thật → kiểm tra `seo_meta` lưu đúng, ảnh lên đúng Drive/local, bài **không** xuất hiện trong danh sách Posts mặc định (phải lọc `platform=website` mới thấy).
- [ ] Sau khi dev website dựng xong endpoint nhận bài → nhập Publish URL/API Key vào Website → Sửa, test nút "Publish lên website" 1 lần thật.
- [ ] Test import Excel hàng loạt 1 lần thật: tải file mẫu, điền vài dòng, tick "tự generate ảnh" cho ít nhất 1 dòng có `prompt_anh` → kiểm tra ảnh tự lên sau vài phút (cron `processPendingWebsiteImageJobs`), tên file đúng theo slug + `.webp`.
- [ ] Test trang **Bài Website Blog** (`/website-posts`): bài từ generate đơn + bài từ import Excel đều hiện trong danh sách, sửa được nội dung/SEO meta, generate ảnh thủ công, publish, xoá.
