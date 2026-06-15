# AutoPost — Kế hoạch triển khai

> Cập nhật: 2026-06-15  
> Tham chiếu: PRD v2.1 mục 12 + `CODE_REVIEW.md`

---

## Trạng thái hiện tại

```
Phase 1 ████████░░  ~80%
Phase 2 ████░░░░░░  ~40%
Phase 3 ███░░░░░░░  ~30%
Phase 4 ███░░░░░░░  ~35%
Phase 5 ░░░░░░░░░░   0%
```

---

## Phase 1 — Backend core (tuần 1)

**Mục tiêu:** Auth, users, DB, activity logging ổn định.

| # | Task | Effort | Status |
|---|------|--------|--------|
| 1.1 | DB schema + seed admin | S | ✅ Done |
| 1.2 | Auth API + JWT | S | ✅ Done |
| 1.3 | RBAC middleware gắn đủ routes | S | ⚠️ Partial |
| 1.4 | Users API + soft delete | S | ✅ Done |
| 1.5 | Activity log middleware (auto-write) | M | ❌ Todo |

**Deliverable:** API auth/users hoạt động, mọi action được ghi log.

---

## Phase 2 — Backend features (tuần 2)

**Mục tiêu:** AI, Facebook, batch queue, scheduler.

| # | Task | Effort | Status |
|---|------|--------|--------|
| 2.1 | Providers + Skills + Pages API | M | ✅ Done |
| 2.2 | Token verify/update + topics API | M | ✅ Done |
| 2.3 | `aiService` — Claude/GPT/Gemini thật | L | ❌ Todo |
| 2.4 | `imageService` — Ideogram/DALL-E thật | L | ❌ Todo |
| 2.5 | `fbService` — publish photo + video | L | ❌ Todo |
| 2.6 | `videoService` + upload endpoint hoàn chỉnh | M | ⚠️ Partial |
| 2.7 | Posts API (generate, batch, publish) | M | ✅ Done |
| 2.8 | `jobWorker.js` — process queue | M | ❌ Todo |
| 2.9 | `scheduler.js` — cron publish + token check | M | ❌ Todo |
| 2.10 | `notifyService` — trigger từ worker/cron | S | ⚠️ Partial |

**Deliverable:** Generate → approve → auto-publish flow end-to-end trên backend.

---

## Phase 3 — Frontend core (tuần 3)

**Mục tiêu:** Design system, layout responsive, auth UX.

| # | Task | Effort | Status |
|---|------|--------|--------|
| 3.1 | Cài React Query, RHF, Zod, Lucide | S | ❌ Todo |
| 3.2 | Tailwind + design tokens PRD | M | ⚠️ Partial |
| 3.3 | Component library (Button, Modal, Toast…) | L | ❌ Todo |
| 3.4 | Layout: sidebar dark indigo + Header | M | ⚠️ Basic done |
| 3.5 | BottomNav responsive | S | ❌ Todo |
| 3.6 | Auth + must_change_password redirect | S | ⚠️ Partial |

**Deliverable:** UI foundation nhất quán, mobile-friendly shell.

---

## Phase 4 — Frontend features (tuần 4–5)

**Mục tiêu:** Tất cả màn hình PRD wired đầy đủ.

| # | Task | Effort | Status |
|---|------|--------|--------|
| 4.1 | Dashboard + Calendar + stats | M | ❌ Todo |
| 4.2 | Posts list: filter + preview + edit | L | ⚠️ List only |
| 4.3 | Generate: tab text+ảnh + tab video | M | ⚠️ Text only |
| 4.4 | BatchGenerate + useJobPolling | M | ⚠️ Manual poll |
| 4.5 | Pages: topics + token management UI | M | ⚠️ CRUD only |
| 4.6 | Skills + Providers CRUD forms | M | ⚠️ Partial |
| 4.7 | NotificationDropdown in Header | S | ❌ Todo |
| 4.8 | UserManagement + ActivityLog polish | S | ⚠️ Basic |
| 4.9 | Settings (system config) | M | ❌ Todo |
| 4.10 | FacebookPreview component | M | ❌ Todo |

**Deliverable:** Admin có thể vận hành full flow từ UI.

---

## Phase 5 — Polish + Deploy (tuần 6)

**Mục tiêu:** Production-ready trên VPS.

| # | Task | Effort | Status |
|---|------|--------|--------|
| 5.1 | Skeleton loading all pages | M | ❌ Todo |
| 5.2 | Toast + Error boundaries | S | ❌ Todo |
| 5.3 | Mobile QA (Bottom sheet, nav) | M | ❌ Todo |
| 5.4 | Nginx + SSL + PM2 deploy | M | ❌ Todo |
| 5.5 | Smoke test toàn bộ flow | M | ❌ Todo |

**Deliverable:** `autopost.hopgiayre.vn` live, checklist pass.

---

## Sprint đề xuất (2 tuần tới)

### Sprint A — Integration (ưu tiên cao nhất)

```
Ngày 1-2:  aiService + imageService thật
Ngày 3:    fbService photo publish
Ngày 4:    fbService video publish
Ngày 5:    jobWorker + scheduler + node-cron
```

### Sprint B — Frontend gaps

```
Ngày 1:    Posts filter + preview + edit modal
Ngày 2:    Generate video tab + VideoUpload
Ngày 3:    BatchGenerate auto-polling
Ngày 4:    Pages topics + token UI
Ngày 5:    NotificationDropdown + Dashboard stats
```

---

## Rủi ro & phụ thuộc

| Rủi ro | Mitigation |
|--------|------------|
| Facebook API rate limit / token hết hạn | Token cron + notification cảnh báo |
| AI API cost cao | p-limit + cache prompt, chọn model rẻ cho draft |
| Video upload lớn | Multer limit + chunked upload nếu cần |
| PRD scope lớn | Ưu tiên P0 trước, polish sau |

---

## Definition of Done (v1.0)

- [ ] User login → generate bài (AI thật) → preview → schedule → auto publish FB
- [ ] Batch generate 10+ bài, worker xử lý không cần bấm tay
- [ ] Token FB expiring → notification + UI cập nhật token
- [ ] Mobile usable (bottom nav, responsive tables)
- [ ] Deploy VPS + HTTPS + smoke test pass
