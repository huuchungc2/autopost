# Website Publish API — spec cho dev website

AutoPost gọi API này để đẩy bài blog đã generate (tab **Tạo bài → Website Blog**) lên website thật. Áp dụng cho `zalopilot.vn`, `hopgiayre.vn`, `datxeveque.vn` — mỗi website là 1 entity riêng trong AutoPost (mục **Website** ở sidebar, độc lập với Fanpage Facebook), cấu hình endpoint + API key riêng tại **Website → Sửa**.

## 1. Endpoint website cần dựng

```
POST {website_publish_url}     (URL do bạn cấu hình, vd: https://zalopilot.vn/api/autopost/posts)
Content-Type: application/json
Authorization: Bearer {website_api_key}     (chỉ gửi nếu đã cấu hình key — nên luôn cấu hình)
```

## 2. Request body AutoPost gửi

```json
{
  "external_id": "autopost-123",
  "title": "Tiêu đề bài (H1)",
  "slug": "xe-khach-sai-gon-tanh-linh",
  "meta_description": "Mô tả 150-160 ký tự, có CTA",
  "primary_keyword": "xe khách sài gòn tánh linh",
  "content_markdown": "Nội dung đầy đủ — Markdown (## H2, **bold**, danh sách -...)",
  "image_url": "https://drive.google.com/uc?export=view&id=xxx",
  "status": "draft"
}
```

| Field | Kiểu | Ghi chú |
|---|---|---|
| `external_id` | string | `autopost-{posts.id}` — dùng để chống đăng trùng nếu AutoPost gọi lại API này nhiều lần cho cùng 1 bài (upsert theo field này nếu được) |
| `title` | string | có thể rỗng nếu AI parse lỗi — nên validate trước khi lưu |
| `slug` | string | chữ thường, không dấu, gạch ngang |
| `meta_description` | string | có thể rỗng |
| `primary_keyword` | string | có thể rỗng |
| `content_markdown` | string | **Markdown**, không phải HTML — website tự convert (vd `marked`, `remark`) |
| `image_url` | string \| null | URL public đã fetch được ngay (Google Drive share-link hoặc link VPS) — `null` nếu bài chưa có ảnh. Website tự tải ảnh về, AutoPost không upload binary. |
| `status` | string | luôn `"draft"` ở bản hiện tại — AutoPost chưa có nút "publish live", chỉ tạo nháp bên website để review tay trước |

## 3. Response mong đợi

**Thành công** (HTTP 200/201):
```json
{
  "id": "456",
  "url": "https://zalopilot.vn/blog/xe-khach-sai-gon-tanh-linh"
}
```
- `id`: ID bài viết trên hệ thống website (string hoặc number đều được, AutoPost convert sang string khi lưu)
- `url`: URL xem bài (draft preview URL hoặc URL live, tuỳ flow bên website) — AutoPost lưu lại để hiển thị link "Xem bài" trong UI

**Lỗi** (bất kỳ status code không phải 2xx):
```json
{ "error": "Lý do lỗi, hiển thị thẳng cho người dùng AutoPost" }
```

## 4. Hành vi AutoPost

- Gọi 1 lần khi người dùng bấm nút **"Publish lên website"** trên trang Tạo bài (không tự động, không có cron) — xem `websitePublishService.js`.
- Timeout 20s. Nếu lỗi (timeout, 4xx, 5xx, network), AutoPost hiển thị `error.message` từ response (nếu có) hoặc lỗi network, **không retry tự động**.
- Khi thành công, AutoPost lưu `posts.website_post_id`, `posts.website_post_url`, `posts.website_published_at` — bấm publish lại lần 2 cho cùng bài sẽ gọi lại y hệt request (không có nút "update", chỉ có "publish lại" — tự xử lý trùng bằng `external_id` nếu cần).

## 5. Việc còn thiếu / có thể mở rộng sau

- Không có cơ chế "đăng live" — muốn AI tự ý publish live thì cần thêm field `status: "published"` (website tự quyết logic enable nếu cần, AutoPost hiện luôn gửi `"draft"`).
- Không upload ảnh binary qua `multipart/form-data` — nếu cần, báo lại để đổi cơ chế gửi ảnh.
- Không có webhook nào báo ngược trạng thái (vd: website duyệt bài → báo AutoPost) — một chiều AutoPost → website.
