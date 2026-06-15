# AutoPost — Code Review

> Review ngày: 2026-06-15  
> Tham chiếu: `autopost-prd-v2.md` v2.1, `PROJECT_PROGRESS.md`

---

## Tổng quan

Dự án đã có **scaffold end-to-end** (backend API + frontend SPA + DB schema). Luồng auth, CRUD cơ bản, generate/publish posts hoạt động ở mức MVP. So với PRD v2.1, tiến độ ước tính **~45–50%** — Phase 1 gần xong, Phase 2–4 còn nhiều gap.

| Hạng mục | Trạng thái | Ghi chú |
|----------|-----------|---------|
| Backend core (auth, routes, DB) | ✅ ~80% | Thiếu worker, cron, activity middleware |
| AI integration | ⚠️ ~10% | Placeholder text/image |
| Facebook publish | ⚠️ ~40% | Feed text only, chưa attach ảnh/video |
| Batch jobs | ⚠️ ~50% | Manual process endpoint, không có worker |
| Frontend pages | ⚠️ ~55% | List + form cơ bản, thiếu UI nâng cao |
| Design system / UX | ❌ ~20% | Chưa có component library PRD |
| Deploy | ❌ 0% | Chưa cấu hình VPS/Nginx |

---

## Backend

### Điểm tốt

- Cấu trúc rõ ràng: `routes/` → `services/` → `middleware/`
- JWT auth + bcrypt, RBAC middleware (`rbac.js`) cho pages/providers/users
- Schema SQL đầy đủ theo PRD (users, providers, skills, fb_pages, content_topics, posts, generate_jobs, notifications, activity_logs)
- Posts API đủ endpoint: generate, generate-video, generate-batch, publish, schedule, approve, CRUD
- Facebook token verify qua Graph API khi tạo/cập nhật page
- Rate limit skeleton với `p-limit` trong `aiService.js`
- Upload route + `videoService` / `storageService` có sẵn

### Vấn đề / thiếu sót

#### Critical

1. **AI placeholder** — `aiService.js` và `imageService.js` không gọi API thật (Claude/GPT/Gemini/Ideogram).
2. **Facebook publish không gửi ảnh** — `postToFacebook()` chỉ POST `/feed` với `message`, bỏ qua `imageUrl` param.
3. **Không có `jobWorker.js` / `scheduler.js`** — PRD yêu cầu cron xử lý batch + auto-publish scheduled posts; hiện chỉ có `POST /jobs/:batch_id/process` gọi thủ công.
4. **Thiếu `node-cron`** trong `backend/package.json`.

#### High

5. **Activity log middleware** — PRD yêu cầu ghi log mọi action; route `/activity` chỉ GET, không có middleware tự ghi.
6. **`must_change_password` flow** — Backend có field nhưng frontend chưa redirect bắt buộc đổi mật khẩu.
7. **Publish video** — Không có endpoint/service upload video lên Facebook Graph API.
8. **Token expiry cron** — Không có job cập nhật `token_status` expiring/expired.
9. **`content_topics` API** có backend nhưng **frontend Pages chưa có UI quản lý topics**.

#### Medium

10. **`generateImage` import lẫn lộn** — `posts.js` import từ `imageService`, `jobs.js` import từ `aiService` (duplicate).
11. **Soft delete users** — Schema có `deleted_at` nhưng users route có thể chưa filter.
12. **Error handling** — Thiếu global error handler, nhiều route không try/catch.
13. **API key storage** — Lưu plain text trong DB (PRD chấp nhận, nhưng nên encrypt at rest).

#### Low

14. Thiếu validation schema (Zod/Joi) ở backend.
15. Thiếu pagination cho list endpoints.

---

## Frontend

### Điểm tốt

- React 18 + Vite + React Router v6
- Auth flow: Login → token persist → ProtectedRoute → Layout
- Các page chính đã wired API: Dashboard, Posts, Generate, BatchGenerate, Pages, Skills, Providers, Users, Activity, Settings, ChangePassword
- Pages.jsx có CRUD form (tạo/sửa/xóa page)
- Header có badge đếm notification unread
- BatchGenerate có create batch + process + status table

### Vấn đề / thiếu sót

#### Critical (so với PRD)

1. **Thiếu dependencies PRD**: React Query, React Hook Form, Zod, Lucide React — chưa cài.
2. **TailwindCSS** có trong devDeps nhưng UI dùng custom CSS (`tokens.css`, `components.css`), chưa theo design system PRD (sidebar dark indigo, component library).
3. **Generate page** — Chỉ tab text+ảnh, **không có tab video** + upload.
4. **Posts list** — Không có filter (status/media_type/date), không có mini preview ảnh/video, không edit inline.
5. **FacebookPreview.jsx** — Chưa tồn tại.

#### High

6. **NotificationDropdown** — Header chỉ link sang Settings, không có dropdown PRD.
7. **BottomNav / responsive mobile** — Chưa có.
8. **Dashboard** — Chỉ đếm số lượng, thiếu Calendar, stats theo status, upcoming posts.
9. **BatchGenerate** — Không auto-poll (`useJobPolling` hook chưa có), user phải bấm refresh/process thủ công.
10. **Settings** — Hiện chỉ hiển thị notifications, không phải trang cấu hình hệ thống PRD.

#### Medium

11. Form validation thủ công, không dùng RHF + Zod.
12. Không có Toast, Skeleton, Modal, Error boundary.
13. Không có loading/error state nhất quán giữa các page.
14. `useAuth.js` hook tồn tại nhưng auth logic chủ yếu ở `authContext.js`.

---

## Bảo mật

| Mục | Trạng thái |
|-----|-----------|
| JWT secret từ env | ✅ (cần verify `.env.example`) |
| Password bcrypt | ✅ |
| RBAC trên routes | ⚠️ Một số route chưa gắn middleware |
| CORS | ✅ Mở (dev OK, production cần restrict) |
| Page token trong response GET /pages | ✅ Không trả token ở list |
| Rate limit AI | ⚠️ Chỉ p-limit local, chưa global |

---

## Khớp PRD — Checklist nhanh

### Phase 1 Backend core
- [x] Setup + DB schema
- [x] Auth API
- [x] RBAC middleware (partial)
- [x] Users API
- [ ] Activity Log middleware (auto-write)

### Phase 2 Backend features
- [x] Providers + Skills + Pages API
- [x] Token verify/update
- [ ] aiService + imageService thật
- [x] videoService + upload (partial)
- [x] Posts API
- [ ] jobWorker + scheduler + notifyService cron

### Phase 3 Frontend core
- [x] CSS tokens (basic)
- [ ] Component library (Button, Modal, Toast…)
- [x] Layout sidebar + header
- [ ] BottomNav responsive
- [x] Auth + ChangePassword

### Phase 4 Frontend features
- [ ] Dashboard + Calendar
- [ ] Posts filter + preview
- [ ] Generate tab video
- [ ] Batch auto-polling
- [ ] Pages topics + token UI
- [ ] NotificationDropdown
- [ ] Settings thật

### Phase 5 Polish + Deploy
- [ ] Skeleton, Toast, Error boundaries
- [ ] Mobile test
- [ ] VPS deploy

---

## Ưu tiên sửa (recommended order)

1. Gắn AI provider thật (text + image) — unlock giá trị core
2. Fix Facebook publish (attach photo + video)
3. Tạo `jobWorker.js` + `scheduler.js` (cron batch + scheduled publish)
4. Hoàn thiện Posts UI (filter, preview, edit)
5. Generate tab video + VideoUpload component
6. Component library + Tailwind design system
7. Notification dropdown + auto-poll batch
8. Deploy VPS

---

## Kết luận

Codebase **sạch, có cấu trúc tốt**, phù hợp để tiếp tục build theo PRD. Rủi ro lớn nhất là **integration layer** (AI + Facebook + cron) vẫn ở mức placeholder/manual. Nên ưu tiên backend integration trước khi polish UI.
