# Thống kê hiệu quả bài đăng (Insights) — KẾ HOẠCH, CHƯA LÀM

> Trạng thái: **chưa triển khai**. Tony chốt để sau ("nào cần hãy làm").
> File này ghi lại kết quả khảo sát codebase + thiết kế đề xuất để lúc bắt tay vào làm
> không phải dò lại từ đầu.

## Mục tiêu
Kéo số liệu hiệu quả (reach/impressions/tương tác) của bài fanpage đã đăng từ Facebook Graph API,
lưu lại và hiện thành trang thống kê: bài nào chạy tốt, page nào hiệu quả, theo khoảng thời gian.

## Hạ tầng ĐÃ CÓ (khảo sát 2026-07-15 — dùng lại, đừng viết mới)

| Thứ cần | Đã có ở đâu |
|---------|-------------|
| ID bài trên Facebook | `posts.fb_post_id` (+ `fb_photo_id`, `fb_video_id`), ghi bởi `persistFacebookPublishIds()` (`postPublishService.js`) |
| Base URL Graph API | `fbService.js` — `process.env.FB_GRAPH_API` (mặc định `https://graph.facebook.com/v19.0`) |
| Lấy token của page | `pageTokenService.js` — `loadPageTokenRow(internalPageId)` rồi `getActivePageToken(pageRow)` (tự chọn manual/composio theo `token_source`) |
| Đăng ký cron | `scheduler.js` — `cron.schedule(..., () => runExclusive(fn, 'tênJob'))`, xem `checkPageTokens` (chạy mỗi giờ) |
| Phân quyền theo page | `pageAccessService.js` — `getAccessiblePageIds(user)` + `pageIdInClause()` |
| Thông báo | `notifyService.createNotification()` |

## Thiết kế đề xuất

### 1. DB — migration `0xx_post_insights.sql`
Chỉ lưu **snapshot mới nhất** (1 dòng / 1 bài) cho v1 — đủ trả lời "bài nào hiệu quả".
Nếu sau này cần biểu đồ theo thời gian thì thêm bảng lịch sử riêng, đừng đổi bảng này.

```sql
CREATE TABLE IF NOT EXISTS post_insights (
  post_id INT NOT NULL PRIMARY KEY,
  fb_post_id VARCHAR(100) NULL,
  impressions INT NOT NULL DEFAULT 0,     -- post_impressions
  reach INT NOT NULL DEFAULT 0,           -- post_impressions_unique
  engaged_users INT NOT NULL DEFAULT 0,   -- post_engaged_users
  clicks INT NOT NULL DEFAULT 0,          -- post_clicks
  reactions INT NOT NULL DEFAULT 0,
  comments INT NOT NULL DEFAULT 0,
  shares INT NOT NULL DEFAULT 0,
  fetched_at DATETIME NULL,
  error_message TEXT NULL,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
Nhớ: viết `ensureXxx()` guard trong `migrationRunner.js` + wire vào mảng `migrations` trong `app.js`
(xem CLAUDE.md — migration không wire là không bao giờ chạy).

### 2. Service `insightsService.js`
1 request Graph cho mỗi bài, gộp hết field:
```
GET /{fb_post_id}
  ?access_token={pageToken}
  &fields=insights.metric(post_impressions,post_impressions_unique,post_clicks,post_engaged_users),
          reactions.summary(true).limit(0),
          comments.summary(true).limit(0),
          shares
```
- `insights.data[].values[0].value` → từng metric theo `name`.
- `reactions.summary.total_count`, `comments.summary.total_count`, `shares.count`.

Hàm:
- `fetchPostInsights(fbPostId, pageToken)` → object metric hoặc throw.
- `refreshInsightsForPost(post)` → resolve token, gọi, upsert `post_insights`; lỗi thì ghi `error_message` (không throw ra ngoài).
- `refreshDueInsights({ limit })` → chọn bài `status='published'` + có `fb_post_id` + `published_at` trong N ngày + (`fetched_at` null hoặc cũ hơn X giờ), chạy tuần tự.

### 3. Cron
Thêm vào `scheduler.js`: mỗi 30–60 phút gọi `refreshDueInsights({ limit: 20-30 })`.
Đừng quét toàn bộ lịch sử mỗi lần — giới hạn theo `published_at` (vd 30 ngày) như pattern
`getPostsSyncLookbackDays()` đang dùng cho GroupFlow.

### 4. Routes `routes/insights.js`
- `GET /api/insights/summary?from=&to=&page_id=` — tổng reach/impressions/tương tác + top bài.
- `GET /api/insights/posts?...` — danh sách bài kèm metric, sort được.
- `POST /api/insights/refresh` — làm mới ngay (admin), cho khỏi chờ cron.
- **Bắt buộc** lọc theo `getAccessiblePageIds(req.user)` + `pageIdInClause()`.

### 5. Frontend
Trang `Insights.jsx` (`/insights`, nav mục **Fanpage**):
- Hàng stat tile: tổng reach / impressions / tương tác / số bài, theo khoảng ngày.
- Bảng bài xếp hạng theo reach hoặc engagement, lọc theo page + khoảng ngày.
- Nút "Làm mới số liệu".
- *Biểu đồ để sau* — nếu làm chart thì PHẢI đọc skill `dataviz` trước khi viết code chart.

## Ràng buộc THẬT phải tính trước (đừng bỏ qua)
1. **Quyền `read_insights`**: page token không có scope này thì Graph trả lỗi. Phải bắt lỗi và hiện
   thông báo rõ ("token thiếu quyền read_insights"), đừng để trang trắng số 0 khó hiểu.
2. **Chỉ áp dụng cho bài của PAGE**, không phải bài cá nhân/group. Bài GroupFlow (`user_posts`)
   **không** dùng được các metric này — insights chỉ cho `posts` fanpage.
3. **Token hết hạn**: bài của page có token chết sẽ fail — tái dùng trạng thái từ `tokenHealthService`
   để bỏ qua sớm thay vì gọi Graph rồi mới lỗi.
4. **Rate limit Facebook**: gọi tuần tự theo lô nhỏ, có `fetched_at` để không gọi lại bài vừa lấy.
5. **Bài cũ**: `post_impressions` có độ trễ và không đổi nhiều sau vài ngày — refresh dày cho bài mới,
   thưa dần cho bài cũ (vd: <48h thì mỗi 3h, sau đó mỗi ngày, quá 30 ngày thì thôi).

## Quyết định còn treo
- Snapshot mới nhất (đề xuất) hay lưu lịch sử theo ngày để vẽ biểu đồ xu hướng?
- Có gộp thống kê bài GroupFlow (comment chéo) vào cùng trang không, hay tách riêng? (Dữ liệu 2 hệ
  hoàn toàn khác nhau — xem `docs/GROUPFLOW.md`.)
