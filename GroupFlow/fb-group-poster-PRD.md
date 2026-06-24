# PRD: GroupFlow — FB Group Auto Poster (Chrome Extension)

## Tổng Quan

Chrome Extension tự động đăng bài lên nhiều Facebook Group, tích hợp generate ảnh AI, lên lịch đăng, comment chéo giữa các user trong hệ thống, **quét group tìm lead (Radar Lead)**, đồng bộ metadata với tidien.xyz.

**Vị trí trong repo:** `AutoPost/GroupFlow/fb-group-poster/`
**Fanpage:** Đã xử lý ở tidien.xyz — extension chỉ xử lý **FB Group**.

> **Doc vận hành / kiến trúc hiện tại:** [`docs/GROUPFLOW.md`](../docs/GROUPFLOW.md) — PRD dưới đây giữ spec sản phẩm; một số mục kỹ thuật đã đổi (GraphQL nền SW thay DOM đăng/comment).

---

## Kiến Trúc Tổng Thể (cập nhật 2025-06)

```
Chrome Extension (Side Panel)
├── Import Excel / Nhập tay
├── Generate ảnh → 9Router API (tidien.xyz/v1/...)
├── Load Groups → GraphQL nền SW (fbGroupsBg + fbSessionBg), không mở tab FB
├── Đăng bài → Fast: fbPostBg (GraphQL SW) | Classic: DOM (video / fallback)
├── Comment chéo → tidien pending-comments → fbCommentBg (GraphQL SW) | fallback DOM
├── Lưu ảnh → Local queue + (tuỳ chọn) Google Drive
├── Sync metadata → tidien.xyz API (KHÔNG sync ảnh)
└── Radar Lead → DOM quét từ khóa (local, chrome.alarms)
```

---

## Các Quyết Định Kiến Trúc Đã Chốt

| Vấn đề | Quyết định |
|---|---|
| Repo | Nằm trong AutoPost: `GroupFlow/fb-group-poster/` |
| tidien API Key | Key riêng cho extension (không dùng chung AutoPost) |
| Thứ tự build | Extension + backend song song |
| Load groups | GraphQL nền SW (`fbGroupsBg`), session `fbSessionBg`; fallback HTML joins |
| Đăng bài (mặc định) | **Nhanh:** `fbPostBg` GraphQL SW, không tab FB. **Cổ điển:** DOM (video / fallback) |
| Bắt post_id | GraphQL response + regex; Classic: network/DOM |
| Comment chéo | `GET /pending-comments` → `fbCommentBg` GraphQL SW; batch delay + lịch `gf_cmt_*` |
| Selector ngôn ngữ | Cả tiếng Việt + tiếng Anh ngay v1 |
| Upload ảnh | Tải blob từ Drive → inject vào `input[type=file]` |
| Queue chạy | M bài × N group (chạy hết ma trận) |
| Spintax/Variations | Chỉ ở nhập tay, Excel không hỗ trợ |
| Lên lịch | Excel giữ lịch riêng từng dòng; footer chỉ đặt lịch bài nhập tay |
| Sync ảnh | ❌ Không sync — chỉ sync metadata (noi_dung, prompt_anh, post_id...) |
| Comment chéo | **Bắt buộc** — tidien API; chạy/lên lịch batch; AI generate trong extension |
| Map user | Đăng nhập tidien trong extension để map FB ↔ tidien account |
| Lưu API key | `chrome.storage.local` trên máy client |
| Miss lịch | Retry tự động khi mở Chrome lại |
| Phase 1 MVP | Đăng bài + Generate ảnh + Sync metadata tidien |
| Phase 2 | **Comment chéo** + Login tidien + API list/commented |
| Phase 3 | Lên lịch + Google Drive + Retry + Activity log |
| Phase 4 | Radar Lead — **giữ**; quét group theo từ khóa, báo lead (local) |
| Radar Lead | Giữ trong scope; 100% local (`chrome.storage.local`); không sync tidien |
| Radar quét | DOM/session FB trên group đã chọn; `chrome.alarms` theo chu kỳ |

---

## Phạm Vi Tính Năng

### Module 1: Tạo Bài Đăng

#### 1.1 Import Excel
- Import file `.xlsx` / `.xls` từ máy local
- 4 cột bắt buộc:

| Cột | Kiểu | Mô tả |
|---|---|---|
| `noi_dung` | Text | Nội dung bài đăng |
| `prompt_anh` | Text | Prompt tiếng Anh để generate ảnh AI |
| `ngay_dang` | YYYY-MM-DD | Ngày đăng (lịch riêng từng dòng) |
| `gio_dang` | HH:MM | Giờ đăng (lịch riêng từng dòng) |

- Preview danh sách bài sau khi import
- Xoá từng bài khỏi danh sách
- Validate: cảnh báo nếu thiếu cột, sai format
- Mỗi dòng Excel = 1 bài, chạy M bài × N group (ma trận đầy đủ)

#### 1.2 Nhập Bài Tay
- Rich text editor: B / I / danh sách / emoji
- **Spintax**: `{Xin chào|Chào bạn|Hi}` — mỗi group nhận biến thể khác nhau
- **Variations A/B/C/D**: 4 phiên bản, xoay vòng theo group (A→B→C→D→A...)
- Đặt lịch ngày/giờ từ footer (không phụ thuộc Excel)
- Nút "+ Thêm vào danh sách" để gộp vào queue

#### 1.3 Generate Ảnh AI
- Provider: **9Router** — `https://tidien.xyz/v1/images/generations`
- Model: `cx/gpt-5.5-image` (OpenAI-compatible, trả về base64)
- Generate thủ công từng bài hoặc hàng loạt
- Lưu ảnh:
  - **Local**: download vào Downloads (chrome.downloads API)
  - **Google Drive**: upload qua Service Account JSON
- Preview thumbnail trước khi đăng
- Đính kèm ảnh có sẵn từ máy (không bắt buộc generate)

#### 1.4 Google Drive Integration
- Auth: **Service Account JSON** (không dùng OAuth)
- Cấu hình: dán JSON + nhập Google Drive Folder ID
- Upload ảnh base64 lên Drive folder chỉ định
- Khi đăng bài: tải blob từ Drive → inject vào `input[type=file]` FB
- Nút "Kiểm tra kết nối Drive"

---

### Module 2: Load Groups

> **Tham chiếu UX:** extension Posting Group Pro — extract group từ FB, không nhập link/id thủ công.

- User **phải đang login FB** trên Chrome
- Extension **extract** danh sách group từ FB session (`groups/feed`, sidebar, scroll / API nội bộ FB)
- Không dùng Graph API `/me/groups` (FB đã khoá)
- **Bộ sưu tập đã extract:** ví dụ `Extracted Groups` — hiển thị số group (vd. `25 liên kết`), tick chọn cả bộ
- **Tìm kiếm:** ô `Tìm kiếm trên tất cả các nhóm của bạn...` — filter trong list đã extract, thêm group lẻ vào lựa chọn
- Cache bộ sưu tập + lựa chọn vào `chrome.storage.local`
- Nút **Tải lại / Extract lại** → quét FB lấy list mới
- Checkbox chọn groups muốn đăng (từ bộ sưu tập hoặc tìm kiếm)
- **Mặc định tối đa 10 groups/lần** (chỉnh được trong Settings)

---

### Module 3: Lên Lịch & Đăng Bài

#### 3.1 Queue Chạy
- **M bài × N group**: chạy hết ma trận
```
Bài 1 → Group A → B → C → D → E (delay giữa mỗi group)
[delay dài hơn giữa các bài]
Bài 2 → Group A → B → C → D → E
Bài 3 → Group A → B → C → D → E
```

#### 3.2 Chế Độ Đăng
- **Đăng Ngay**: chạy ngay
- **Lên Lịch**:
  - Excel: mỗi dòng có `ngay_dang` + `gio_dang` riêng → alarm độc lập
  - Nhập tay: đặt lịch từ footer
  - Miss lịch (Chrome đóng) → retry tự động khi mở lại

#### 3.3 DOM Automation — Flow Mỗi Group
1. Navigate tới `facebook.com/groups/{group_id}`
2. Scrape sidebar tìm ô "Bạn viết gì đi..." → click mở modal
3. Inject text vào `[role="textbox"][contenteditable="true"]`
4. Nếu có ảnh: tải blob từ Drive → inject vào `input[type=file]`
5. Click `[aria-label="Đăng"]`
6. Bắt post_id: intercept network request → fallback parse DOM
7. Sync metadata lên tidien
8. Delay → group tiếp theo

#### 3.4 Selector FB (2 ngôn ngữ)

```javascript
// selectors.js — tách riêng, dễ update khi FB thay đổi DOM
export const SELECTORS = {
  vi: {
    postTrigger: '[aria-placeholder="Bạn viết gì đi..."]',
    textbox:     '[role="textbox"][contenteditable="true"]',
    photoBtn:    '[aria-label="Ảnh/video"]',
    fileInput:   'input[type="file"][accept*="image/*"]',
    postBtn:     '[aria-label="Đăng"]',
    closeBtn:    '[aria-label="Đóng hộp thoại của công cụ tạo"]',
  },
  en: {
    postTrigger: '[aria-placeholder="Write something..."]',
    textbox:     '[role="textbox"][contenteditable="true"]',
    photoBtn:    '[aria-label="Photo/video"]',
    fileInput:   'input[type="file"][accept*="image/*"]',
    postBtn:     '[aria-label="Post"]',
    closeBtn:    '[aria-label="Close"]',
  }
}
```

#### 3.5 Cài Đặt Anti-Ban

| Mức | Delay giữa group | Delay giữa bài |
|---|---|---|
| 🚀 Nhanh | 1–2 phút | 3 phút |
| ⚖️ Cân Bằng | 3–5 phút | 7 phút |
| 🛡️ An Toàn | 7–10 phút | 15 phút |

- Toggle: Nghỉ an toàn nếu lỗi
- Toggle: Tránh đăng ban đêm 22:00–07:00
- Delay ngẫu nhiên trong khoảng (không fixed)

---

### Module 4: Sync Tidien

Sau khi đăng thành công — **chỉ sync metadata, không sync ảnh**.

**Endpoint:** `POST https://tidien.xyz/api/group-posts/sync`

```json
{
  "group_id": "123456789",
  "post_id": "987654321",
  "noi_dung": "Nội dung bài viết",
  "prompt_anh": "Vietnamese transport poster...",
  "ngay_dang": "2026-06-24",
  "gio_dang": "08:00",
  "posted_at": "2026-06-24T08:02:00",
  "posted_by": "fb_user_id"
}
```

> Ảnh mỗi máy tự generate + lưu local/Drive riêng. VPS không giữ ảnh, chỉ lưu metadata để user khác comment chéo.

---

### Module 5: Comment Chéo *(core — bắt buộc)*

> User A đăng bài → sync tidien → User B (và C, D…) mở tab Comment, tải bài về, AI sinh comment, đăng lên group giúp đẩy tương tác. Không có comment chéo = thiếu nửa giá trị sản phẩm.

#### 5.1 Cơ Chế
- Extension tải **toàn bộ bài của mọi user** trong hệ thống từ tidien
- User chủ động: bấm comment từng bài **hoặc** lên lịch comment
- Không có rule phân phối — ai muốn comment bài nào thì comment
- Thống kê số lần đã comment từng bài

#### 5.2 Login Tidien Trong Extension
- User đăng nhập tidien.xyz ngay trong extension (email + password hoặc token)
- Map FB user_id ↔ tidien account
- Dùng tidien API Key riêng (không chung AutoPost)

#### 5.3 Lấy Danh Sách Bài
**Endpoint:** `GET https://tidien.xyz/api/group-posts/pending-comments`

```json
[
  {
    "id": "record_id",
    "group_id": "123456",
    "post_id": "789012",
    "noi_dung": "Nội dung bài gốc",
    "prompt_anh": "...",
    "posted_by": "user_A_fb_id",
    "posted_at": "2026-06-24T08:00:00",
    "my_comment_count": 2
  }
]
```

#### 5.4 Generate + Thực Thi Comment
- AI generate comment từ `noi_dung` bài gốc (9Router text model)
- Prompt: *"Viết 1 comment ngắn tự nhiên để đẩy bài Facebook sau, không quảng cáo lộ liễu: {noi_dung}"*
- User có thể sửa comment trước khi gửi
- Bấm tay hoặc lên lịch giờ cụ thể
- Navigate tới `facebook.com/groups/{group_id}/posts/{post_id}` → inject comment → submit
- Điều kiện: user phải là thành viên group
- Sau khi comment → `PATCH /api/group-posts/{id}/commented` + cập nhật `my_comment_count`

---

### Module 6: Radar Lead (Khách Hàng)

> **Tham chiếu UX:** tab Radar Lead — Posting Group Pro. Chiến lược **pull**: nghe bài mới trong group, bắt lead theo từ khóa. Không auto comment/inbox — user tự xử lý.

#### 6.1 Cấu Hình
- **Bật/tắt:** toggle 「CLICK TO ACTIVATE」 — chỉ quét khi đang bật
- **Từ khóa kích hoạt:** textarea, mỗi dòng hoặc phẩy ngăn cách
  - Hỗ trợ loại trừ: tiền tố `-` (vd. `-miễn phí` bỏ bài có "miễn phí")
  - Gợi ý: `cần tìm`, `gợi ý`, `cần help`, `ai biết`, `recommend`
- **Nhóm mục tiêu:** chọn từ **Extracted Groups** (cùng Module 2) — search `Tìm hoặc chọn group...`
- **Chu kỳ quét:** dropdown — mặc định **Mỗi 15 phút (Cân bằng)**; tuỳ chọn 5 / 15 / 30 / 60 phút
- **Cảnh báo trong trang:** toggle — popup overlay khi đang lướt FB
- **Cảnh báo push máy tính:** toggle — `chrome.notifications` (user bật notification Chrome/OS)
- **Quét thủ công ngay:** chạy 1 lần không đợi chu kỳ
- **Lưu cài đặt:** `chrome.storage.local`

#### 6.2 Cơ Chế Quét
- `background.js` + `chrome.alarms` theo chu kỳ đã chọn
- Chrome phải mở + user login FB (giống lên lịch đăng bài)
- Với mỗi group mục tiêu: navigate / đọc feed group qua `content.js` (DOM hoặc API nội bộ FB)
- Chỉ xét **bài mới** kể từ lần quét trước (lưu `last_scanned_at` per group)
- Khớp từ khóa (case-insensitive, hỗ trợ loại trừ `-`) → lưu lead local

#### 6.3 Dữ Liệu Lead (local)

Mỗi lead lưu trong `chrome.storage.local`:

| Field | Mô tả |
|---|---|
| `id` | UUID local |
| `group_id` | Group phát hiện |
| `group_name` | Tên group |
| `post_id` | ID bài (nếu bắt được) |
| `post_url` | Link bài FB |
| `author_name` | Tên người đăng |
| `snippet` | Đoạn text khớp (truncate ~200 ký tự) |
| `matched_keywords` | Từ khóa trùng |
| `found_at` | ISO timestamp |
| `status` | `new` / `seen` / `dismissed` |

> Không sync lead lên tidien — dữ liệu nhạy cảm, giữ trên máy user.

#### 6.4 Danh Sách & Xuất
- Bảng lead: tên người đăng, group, snippet, giờ, từ khóa khớp
- **Tìm kiếm:** filter theo tên hoặc nội dung
- **Filter:** `Tất cả khách hàng` / `Mới` / `Đã xem`; filter theo từ khóa
- **Xuất:** CSV hoặc JSON ra file local
- **Xóa tất cả** / xoá từng dòng
- Click dòng → mở bài FB tab mới

---

### Module 7: Hoạt Động (Activity Log)

- Sub-tab **Sắp Tới**: bài đã lên lịch (đăng + comment)
- Sub-tab **Lịch Sử**: bài đã đăng, đã comment
- Mỗi item: tên group + thời gian + trạng thái ✅/❌ + link bài
- Filter: theo ngày, group, trạng thái
- Thống kê: số lần comment từng bài
- Nút xoá lịch sử

---

### Module 8: Cài Đặt

| Cài Đặt | Mô Tả | Lưu ở |
|---|---|---|
| **URL website** | Mặc định `https://tidien.xyz` (domain chính); user sửa được | `chrome.storage.local` (`tidienBaseUrl`) |
| tidien Email + Password | Đăng nhập map FB ↔ tidien | `chrome.storage.local` |
| tidien API Key | Auth gọi API tidien | `chrome.storage.local` |
| 9Router API Key | Generate ảnh | `chrome.storage.local` |
| Google Drive JSON | Service Account | `chrome.storage.local` |
| Google Drive Folder ID | Folder lưu ảnh | `chrome.storage.local` |
| Max groups/lần | Mặc định 10 | `chrome.storage.local` |
| Cấp độ bảo mật | Nhanh/Cân Bằng/An Toàn | `chrome.storage.local` |
| Tránh đăng ban đêm | 22:00–07:00 | `chrome.storage.local` |
| Ngôn ngữ FB | Tiếng Việt / English | `chrome.storage.local` |

---

## UI/UX — Thiết Kế Chi Tiết

### Tổng Quan Giao Diện

**Kiểu:** Chrome Side Panel
**Width:** 400px cố định
**Height:** 100% chiều cao trình duyệt
**Scroll:** Mỗi tab scroll độc lập, header + tab bar cố định
**Font:** System font (Segoe UI / -apple-system)
**Màu chủ đạo:** `#1877F2` (xanh FB), nền `#F0F2F5`

---

### Layout Tổng Thể

```
┌─────────────────────────────┐
│  HEADER (cố định, 56px)     │
│  Logo | Tên user FB | ●     │  ← ● = trạng thái kết nối FB
├─────────────────────────────┤
│  TAB BAR (cố định, 48px)    │
│ [Tạo Bài][Comment][Radar][Log][⚙] │
├─────────────────────────────┤
│                             │
│  NỘI DUNG TAB (scroll)      │
│                             │
├─────────────────────────────┤
│  FOOTER ACTION (cố định)    │
│  [Lên Lịch]  [Đăng Ngay →] │
└─────────────────────────────┘
```

---

### HEADER (Cố Định)

```
┌─────────────────────────────────────┐
│ 🤖  GroupFlow          Tony Ngô ● ▼ │
└─────────────────────────────────────┘
```

- Logo + tên app "GroupFlow"
- Avatar + tên user FB (lấy từ session)
- ● xanh = đã kết nối FB / ● đỏ = chưa login
- Click tên → dropdown: "Làm mới session" / "Đăng xuất tidien"

---

### TAB BAR

- `📝 Tạo Bài` — active mặc định
- `💬 Comment` — badge số bài chờ (vd: `💬 3`)
- `📡 Radar` — badge số lead mới (vd: `📡 5`); chấm xanh khi radar đang bật
- `📋 Hoạt Động`
- `⚙️ Cài Đặt`

Tab active: border-bottom `#1877F2`, text bold

---

### TAB 1: TẠO BÀI

#### Section 1 — Nguồn Bài Đăng

```
┌─────────────────────────────────────┐
│ NGUỒN BÀI ĐĂNG                      │
│ ┌──────────────┐  ┌──────────────┐  │
│ │ 📂 Import    │  │ ✏️ Nhập Tay  │  │
│ │   Excel      │  │              │  │
│ └──────────────┘  └──────────────┘  │
└─────────────────────────────────────┘
```

**Import Excel:**
```
┌─────────────────────────────────────┐
│  ┌─────────────────────────────┐    │
│  │   Kéo thả file .xlsx vào   │    │
│  │   hoặc  [Chọn File]        │    │
│  └─────────────────────────────┘    │
│  Cột: noi_dung|prompt_anh|          │
│       ngay_dang|gio_dang            │
└─────────────────────────────────────┘
```

Sau khi import → bảng preview:
```
┌──┬────────────────┬──────────┬───────┬───────┐
│☐ │ Nội dung       │ Ảnh      │ Ngày  │ Giờ   │
├──┼────────────────┼──────────┼───────┼───────┤
│☑ │ Xe về Cần Thơ │ ⏳ Chờ   │ 24/6  │ 08:00 │
│☑ │ Đặt xe nhanh  │ ✅ Sẵn   │ 25/6  │ 09:00 │
│☑ │ Ưu đãi hôm nay│ ❌ Lỗi   │ 26/6  │ 10:00 │
└──┴────────────────┴──────────┴───────┴───────┘
[⚡ Generate Tất Cả Ảnh]
```

- ⏳ chưa generate / ✅ có ảnh / ❌ lỗi
- Click dòng → expand xem nội dung đầy đủ + preview ảnh
- Nút 🗑️ xoá từng dòng

**Nhập Tay:**
```
┌─────────────────────────────────────┐
│ B  I  ≡  😊  {spin}  [A][B][C][D]  │
├─────────────────────────────────────┤
│                                     │
│  Viết nội dung bài tại đây...       │
│                                     │
└─────────────────────────────────────┘
│ Ngày: [24/06/2026]  Giờ: [08:00]   │
│ [+ Thêm vào danh sách]              │
```

- `{spin}` → chèn `{option1|option2|option3}` tại cursor
- Tab A/B/C/D → chuyển variation
- Lịch đặt ở footer, độc lập với Excel

---

#### Section 2 — Generate Ảnh AI

```
┌─────────────────────────────────────┐
│ GENERATE ẢNH AI                     │
│ Provider: 9Router (cx/gpt-5.5-image)│
│ [⚡ Generate Tất Cả]                │
├─────────────────────────────────────┤
│ Bài 1: "Xe về Cần Thơ..."           │
│ Prompt: "Vietnamese transport..."   │
│ [▶ Generate] [📎 Đính kèm ảnh]     │
│ ┌──────────┐  ✅ Đã generate        │
│ │ preview  │  📁 Local ✓            │
│ └──────────┘  ☁️ Drive ✓            │
└─────────────────────────────────────┘
```

- Spinner + "Đang tạo ảnh..." khi đang generate
- Thumbnail 80×80px sau khi xong
- Badge: `📁 Local ✓` và `☁️ Drive ✓`

---

#### Section 3 — Chọn Groups

Modal / panel **「Chọn Nhóm」** (tham chiếu Posting Group Pro):

```
┌─────────────────────────────────────┐
│ CHỌN NHÓM                    [✕]    │
├─────────────────────────────────────┤
│ 1. Bộ sưu tập nhóm                  │
│ ☑ Extracted Groups      25 liên kết │
├─────────────────────────────────────┤
│ 2. (Tuỳ chọn) Thêm nhóm cụ thể      │
│ 🔍 [Tìm trên tất cả nhóm của bạn…] │
├─────────────────────────────────────┤
│ Đã chọn: 3/10                       │
│ ☑ Cộng Đồng Claude AI VN            │
│ ☑ Hội Đặt Xe Về Quê                 │
│ ☑ Group Marketing VN                │
├─────────────────────────────────────┤
│ [Hủy]              [Xác nhận lựa chọn]│
└─────────────────────────────────────┘
```

- **Extracted Groups:** list quét từ FB lần gần nhất + badge số group
- Tick bộ sưu tập → chọn hết (giới hạn max groups/lần vẫn áp dụng)
- Ô tìm kiếm → thêm/bỏ group lẻ từ toàn bộ list đã extract
- `[↻ Extract lại]` trên tab Tạo Bài nếu cần refresh từ FB
- Counter `(X/10)` đỏ khi đạt max
- Empty state: "Chưa extract group. Mở Facebook và bấm Extract lại."

---

#### Section 4 — Tuỳ Chọn Nâng Cao (Accordion, mặc định đóng)

```
┌─────────────────────────────────────┐
│ ⚙️ Tuỳ Chọn Nâng Cao          [▼]  │
├─────────────────────────────────────┤
│ Cấp độ bảo mật:                     │
│ [🚀 Nhanh][⚖️ Cân Bằng][🛡️ An Toàn]│
│                                     │
│ [●] Tránh đăng ban đêm 22:00-07:00 │
│ [○] Nghỉ an toàn nếu lỗi           │
└─────────────────────────────────────┘
```

---

#### FOOTER — Cố Định

```
┌─────────────────────────────────────┐
│ 👁 Preview  [Lên Lịch] [Đăng Ngay→]│
└─────────────────────────────────────┘
```

**States nút Đăng Ngay:**

| State | Hiển thị |
|---|---|
| Chưa đủ điều kiện | Xám, disabled, tooltip "Chọn ít nhất 1 bài và 1 group" |
| Sẵn sàng | Xanh `#1877F2` |
| Đang chạy | Spinner + "Đang đăng... (2/5)" + nút `[⏸ Dừng]` |
| Hoàn thành | Xanh lá + "✅ Xong! 5/5 group" |
| Có lỗi | Cam + "⚠️ 3/5 thành công" |

**Live Progress khi đang chạy:**
```
┌─────────────────────────────────────┐
│ ████████████░░░░░░  3/5 groups      │
│ ✅ Claude AI VN — 08:02             │
│ ✅ Hội Đặt Xe — 08:05              │
│ ✅ Marketing VN — 08:08            │
│ ⏳ Hội Mua Bán... (đang đăng)      │
│ ○ Cần Thơ (chờ)                    │
└─────────────────────────────────────┘
```

---

### TAB 2: COMMENT CHÉO

```
┌─────────────────────────────────────┐
│ COMMENT CHÉO          [↻ Làm mới]  │
│ 3 bài đang chờ                      │
├─────────────────────────────────────┤
│ ┌───────────────────────────────┐   │
│ │ ☑ "Xe về Cần Thơ giá rẻ..."  │   │
│ │   👤 Tony Ngô • Hội Đặt Xe   │   │
│ │   🕐 08:02 hôm nay  💬 ×2    │   │
│ │   AI: "Bên mình có nha chị..." │  │
│ │   [✏️ Sửa] [🕐 Lên Lịch] [▶] │   │
│ └───────────────────────────────┘   │
│ ┌───────────────────────────────┐   │
│ │ ☑ "Đặt xe nhanh chỉ 5 phút" │   │
│ │   👤 User B • Marketing VN    │   │
│ │   🕐 09:15 hôm nay  💬 ×0    │   │
│ │   AI: "Shop uy tín lắm..."    │   │
│ │   [✏️ Sửa] [🕐 Lên Lịch] [▶] │   │
│ └───────────────────────────────┘   │
├─────────────────────────────────────┤
│ [Chọn Tất Cả]   [⚡ Chạy Tất Cả]  │
└─────────────────────────────────────┘
```

- `💬 ×2` = số lần mình đã comment bài đó
- `[✏️ Sửa]` → inline edit comment AI
- `[🕐 Lên Lịch]` → chọn giờ comment
- `[▶]` → comment ngay
- Card ✅ xanh nhạt sau khi comment xong

**Empty state:**
```
💬 Không có bài nào cần comment
Bài đăng từ hệ thống sẽ xuất hiện ở đây
```

---

### TAB 3: RADAR LEAD (KHÁCH HÀNG)

```
┌─────────────────────────────────────┐
│ RADAR LEAD          [● ĐANG BẬT]    │
│              [CLICK TO ACTIVATE]    │
├─────────────────────────────────────┤
│ Từ khóa kích hoạt                   │
│ ┌─────────────────────────────┐     │
│ │ cần tìm, gợi ý, -miễn phí  │     │
│ └─────────────────────────────┘     │
│ Dùng - để loại trừ (vd: -miễn phí) │
├─────────────────────────────────────┤
│ Nhóm mục tiêu                       │
│ 🔍 [Tìm hoặc chọn group...    ]    │
│ ☑ Hội Đặt Xe  ☑ Marketing VN       │
├─────────────────────────────────────┤
│ Chu kỳ quét: [Mỗi 15 phút ▼]       │
│ [●] Cảnh báo trong trang            │
│ [●] Cảnh báo push máy tính          │
├─────────────────────────────────────┤
│ [Quét Thủ Công Ngay] [Lưu Cài Đặt] │
├─────────────────────────────────────┤
│ 🔍 [Tìm tên hoặc nội dung...]       │
│ [Tất cả ▼] [Từ khóa ▼] [Xuất][Xóa] │
├─────────────────────────────────────┤
│ 🆕 10:32 — Hội Đặt Xe               │
│    "Em cần tìm xe về Cần Thơ..."    │
│    Khớp: cần tìm  [🔗][✓ Đã xem]   │
│ 🆕 09:15 — Marketing VN             │
│    "Ai gợi ý shop uy tín..."        │
│    Khớp: gợi ý    [🔗][✓ Đã xem]   │
└─────────────────────────────────────┘
```

- Toggle activate — chấm xám = tắt, xanh = đang quét theo chu kỳ
- Lead mới: badge tab `📡 N` + notification (nếu bật)
- `[🔗]` mở bài FB; `[✓ Đã xem]` đánh dấu seen
- **Empty state:** "Chưa có lead. Bật radar và chọn group mục tiêu."

---

### TAB 4: HOẠT ĐỘNG

Sub-tab: `[Sắp Tới]` | `[Lịch Sử]`

**Sắp Tới:**
```
┌─────────────────────────────────────┐
│ Filter: [Tất cả ▼]  [Hôm nay ▼]    │
├─────────────────────────────────────┤
│ 📅 25/06 09:00 — ĐĂNG BÀI          │
│    "Đặt xe nhanh chỉ 5 phút..."    │
│    → 5 groups  🖼️ Có ảnh           │
│    [✏️ Sửa] [🗑️ Xoá]              │
├─────────────────────────────────────┤
│ 📅 25/06 10:00 — COMMENT CHÉO      │
│    "Xe về Cần Thơ..." (của Tony)    │
│    → Hội Đặt Xe                     │
│    [🗑️ Xoá]                        │
└─────────────────────────────────────┘
```

**Lịch Sử:**
```
┌─────────────────────────────────────┐
│ LỊCH SỬ                    [Xoá]   │
│ Filter: [Tất cả ▼]  [Hôm nay ▼]    │
├─────────────────────────────────────┤
│ ✅ 24/06 08:02 — Claude AI VN       │
│    "Xe về Cần Thơ..."  [🔗 Xem]    │
├─────────────────────────────────────┤
│ ❌ 24/06 08:08 — Marketing VN       │
│    "Xe về Cần Thơ..."               │
│    Lỗi: Group từ chối bài viết      │
└─────────────────────────────────────┘
```

---

### TAB 5: CÀI ĐẶT

```
┌─────────────────────────────────────┐
│ 👤 TÀI KHOẢN TIDIEN                 │
│ Email:    [tony@gmail.com      ]    │
│ Password: [••••••••••••] [Đăng nhập]│
│ ● Đã kết nối: Tony Ngô             │
├─────────────────────────────────────┤
│ 🔑 API KEYS                         │
│ tidien API Key                      │
│ [••••••••••••••••] [👁] [✓ Test]   │
│                                     │
│ 9Router API Key                     │
│ [••••••••••••••••] [👁] [✓ Test]   │
├─────────────────────────────────────┤
│ ☁️ GOOGLE DRIVE                     │
│ Service Account JSON                │
│ ┌─────────────────────────────┐     │
│ │ Dán JSON service account... │     │
│ └─────────────────────────────┘     │
│ Folder ID: [1Bxyz_abc123      ]     │
│ [Kiểm Tra Kết Nối Drive]           │
│ ● Đã kết nối — /AutoPost           │
├─────────────────────────────────────┤
│ ⚙️ TUỲ CHỌN                        │
│ Max groups/lần: [10]               │
│ Bảo mật: (○)Nhanh (●)Cân Bằng (○)An Toàn │
│ [●] Tránh đăng ban đêm 22:00-07:00 │
│ [●] Retry tự động khi mở lại       │
│ Ngôn ngữ FB: (●)Tiếng Việt (○)EN  │
├─────────────────────────────────────┤
│              [💾 Lưu Cài Đặt]       │
└─────────────────────────────────────┘
```

---

### Design Tokens

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--color-primary` | `#1877F2` | Nút chính, tab active |
| `--color-success` | `#42B883` | Thành công |
| `--color-error` | `#FA3E3E` | Lỗi |
| `--color-warning` | `#F5A623` | Đang xử lý |
| `--color-bg` | `#F0F2F5` | Nền chính |
| `--color-card` | `#FFFFFF` | Card, section |
| `--color-border` | `#E4E6EB` | Viền |
| `--color-text` | `#1C1E21` | Text chính |
| `--color-text-sub` | `#65676B` | Text phụ |
| `--radius` | `8px` | Card |
| `--radius-btn` | `6px` | Nút |

### Component States

**Nút:**
```
Default:  bg #1877F2, white, hover #166FE5
Disabled: bg #E4E6EB, text #BCC0C4
Loading:  spinner trắng + text
Success:  bg #42B883
Error:    bg #FA3E3E
```

**Card:**
```
Default:   border #E4E6EB, bg white
Selected:  border #1877F2, bg #F0F7FF
Completed: border #42B883, bg #F0FFF4
Error:     border #FA3E3E, bg #FFF0F0
```

---

## Cấu Trúc File Extension

```
AutoPost/GroupFlow/fb-group-poster/
├── manifest.json
├── background.js          # Service worker: scheduler + alarm + retry miss lịch
├── sidepanel.html
├── sidepanel.js
├── content.js             # Inject vào facebook.com
├── selectors.js           # FB selectors tiếng Việt + tiếng Anh
├── modules/
│   ├── excel.js           # Parse Excel (SheetJS)
│   ├── imageGen.js        # 9Router generate ảnh
│   ├── googleDrive.js     # Upload Drive (Service Account)
│   ├── fbGroups.js        # Scrape groups từ sidebar FB
│   ├── poster.js          # DOM automation đăng bài
│   ├── commenter.js       # Comment chéo
│   ├── leadRadar.js       # Quét group theo từ khóa, lưu lead local
│   ├── tidienSync.js      # Sync metadata lên tidien
│   ├── tidienAuth.js      # Login tidien trong extension
│   └── scheduler.js       # chrome.alarms + retry
├── lib/
│   └── xlsx.min.js
└── assets/
    └── icon.png
```

---

## manifest.json

```json
{
  "manifest_version": 3,
  "name": "GroupFlow — FB Group Auto Poster",
  "version": "1.0.0",
  "permissions": [
    "storage", "alarms", "downloads",
    "sidePanel", "tabs", "activeTab",
    "scripting", "notifications", "webRequest"
  ],
  "host_permissions": [
    "https://www.facebook.com/*",
    "https://tidien.xyz/*",
    "https://www.googleapis.com/*"
  ],
  "background": { "service_worker": "background.js" },
  "side_panel": { "default_path": "sidepanel.html" },
  "content_scripts": [{
    "matches": ["https://www.facebook.com/*"],
    "js": ["content.js"],
    "run_at": "document_idle"
  }],
  "action": { "default_title": "GroupFlow" }
}
```

---

## Tidien Backend — API Cần Build

| Method | Endpoint | Mô Tả |
|---|---|---|
| POST | `/api/group-posts/sync` | Lưu metadata sau khi đăng |
| GET | `/api/group-posts/pending-comments` | Lấy tất cả bài mọi user |
| PATCH | `/api/group-posts/{id}/commented` | Cập nhật số lần comment |

**Auth:** Bearer token (tidien API Key riêng cho extension)

---

## Phases Triển Khai

### Phase 1 — MVP
- Đăng bài (Excel + nhập tay)
- Generate ảnh 9Router
- Lưu ảnh local
- Sync metadata lên tidien

### Phase 2 — Comment chéo *(core)*
- Login tidien trong extension (map FB ↔ tidien)
- Tab Comment: tải bài mọi user, AI generate comment
- Đăng comment (bấm tay + lên lịch)
- Backend: `GET pending-comments` + `PATCH commented`
- Thống kê `my_comment_count`

### Phase 3
- Lên lịch đăng + retry miss lịch
- Google Drive upload
- Activity log đầy đủ

### Phase 4 — Radar Lead
- Tab Radar Lead: từ khóa + loại trừ, chọn group mục tiêu
- Quét định kỳ (`chrome.alarms`) + quét thủ công
- Cảnh báo trong trang + push desktop
- Danh sách lead local, filter, xuất CSV/JSON

---

## Giới Hạn & Lưu Ý

- Chrome phải mở khi tới giờ đăng — miss lịch retry tự động khi mở lại
- User phải đang login FB trên Chrome
- User phải là thành viên group mới comment được
- Không hỗ trợ Fanpage
- `selectors.js` tách riêng — update khi FB đổi DOM
- Giới hạn 10 groups/lần tránh FB flag spam
- API keys lưu `chrome.storage.local` — không gửi lên server
- Radar Lead: Chrome phải mở để quét theo chu kỳ; lead chỉ lưu local
- Radar không auto comment/DM — user tự phản hồi lead
