# AutoPost Design System

> **Zinc Studio** — admin UI sạch, chuyên nghiệp. Dark sidebar + light content, accent blue, typography Inter.
>
> Nguồn sự thật: `src/styles/tokens.css` · `tailwind.config.js` · `src/components/ui/`

---

## 1. Nguyên tắc

- **Rõ ràng trước flashy** — không gradient gimmick, không animation thừa
- **Một accent** — blue `#2563EB` cho action chính
- **Sidebar tối, content sáng** — contrast ổn định khi dùng lâu
- **8px grid** — spacing nhất quán qua CSS variables
- **Accessibility** — `:focus-visible`, `prefers-reduced-motion`

---

## 2. Màu sắc

| Token | Hex | Dùng cho |
|-------|-----|----------|
| `--color-primary` | `#2563EB` | Button primary, link, active accent |
| `--color-primary-hover` | `#1D4ED8` | Hover primary |
| `--color-primary-subtle` | `#EFF6FF` | Background selected, icon badge |
| `--sidebar-bg` | `#09090B` | Sidebar, theme-color |
| `--bg-base` | `#FAFAFA` | Nền content area |
| `--bg-surface` | `#FFFFFF` | Card, modal, input |
| `--bg-muted` | `#F4F4F5` | Hover row, secondary bg |
| `--bg-border` | `#E4E4E7` | Border mặc định |
| `--text-primary` | `#09090B` | Heading, body chính |
| `--text-secondary` | `#71717A` | Label, mô tả |
| `--text-tertiary` | `#A1A1AA` | Placeholder, table header |

Semantic: `--color-success` `#16A34A` · `--color-warning` `#D97706` · `--color-error` `#DC2626` · `--color-info` `#0284C7`

Post status: xem `--status-*` trong `tokens.css`.

---

## 3. Typography

**Font:** Inter (body + heading) · JetBrains Mono (code, token)

| Token | Size | Dùng cho |
|-------|------|----------|
| `--text-xs` | 12px | Table header, caption |
| `--text-sm` | 13px | Label, nav item, mô tả |
| `--text-base` | 14px | Body mặc định |
| `--text-md` | 16px | Section title, header page |
| `--text-lg` | 18px | — |
| `--text-xl` | 20px | — |
| `--text-2xl` | 24px | Page title |
| `--text-3xl` | 30px | Stat number (hiếm) |

Heading: `font-weight: 600`, `letter-spacing: -0.02em`.

---

## 4. Spacing & Layout

| Token | Value |
|-------|-------|
| `--space-1` … `--space-12` | 4px → 48px (bội 4/8) |
| `--sidebar-width` | 240px |
| `--sidebar-width-collapsed` | 64px |
| `--header-height` | 56px |
| `--content-max` | 1280px |
| `--content-padding` | 24px |
| `--card-padding` | 20px |
| `--card-radius` | 12px |
| `--btn-radius` | 8px |

---

## 5. Elevation

| Token | Dùng cho |
|-------|----------|
| `--shadow-xs` | Card mặc định |
| `--shadow-sm` | Dropdown, bottom nav |
| `--shadow-md` | Modal, login card |
| `--shadow-lg` | Overlay nổi bật |

---

## 6. Component library

### CSS classes (`components.css`)

Dùng cho layout shell và page-level patterns:

| Class | Mô tả |
|-------|-------|
| `.app-layout` | Shell sidebar + main |
| `.sidebar`, `.sidebar-link` | Navigation |
| `.app-header` | Top bar |
| `.page-shell` | Content wrapper |
| `.page-header` | Tiêu đề trang + actions |
| `.card` | Container trắng có border |
| `.stat-card` | Metric card (icon + label + value) |
| `.btn`, `.btn-primary`, `.btn-secondary` | Buttons legacy |
| `.table` | Data table |
| `.badge-*` | Post status badges |
| `.modal-*` | Modal overlay |

### React components (`src/components/ui/`)

| Component | Props chính | Ghi chú |
|-----------|-------------|---------|
| `Button` | `variant`, `size` | Tailwind + tokens, ưu tiên dùng mới |
| `Input` | — | Class `ui-input` |
| `Label` | — | Class `ui-label` |
| `Badge` | `status` | Map post status → class |
| `Card` | `children` | Wrapper `.card` |
| `StatCard` | `icon`, `iconTone`, `label`, `value` | Dashboard metrics |
| `PageHeader` | `title`, `description`, `actions` | Page title block |
| `Modal` | `open`, `title`, `footer` | Dialog |
| `Skeleton` | `lines` | Loading placeholder |

**Quy tắc:** Mọi page dùng `PageHeader` + `Button` từ `ui/*`. Class `.btn` trong `components.css` giữ làm fallback cho markup cũ nếu còn sót.

### Button variants

```
default (primary) · secondary · outline · ghost · destructive · link
size: default · sm · lg · icon
```

### StatCard icon tones

`blue` · `green` · `amber` · `slate`

---

## 7. Tailwind integration

`tailwind.config.js` map tokens → theme:

```js
colors.primary.DEFAULT → var(--color-primary)
fontFamily.sans → var(--font-body)
```

Utility layer trong `tailwind.css`:

- `.ui-input` — input chuẩn
- `.ui-label` — label chuẩn

---

## 8. Patterns

### Page layout

```jsx
<div className="page-shell">
  <PageHeader title="..." description="..." actions={<Button>...</Button>} />
  <div className="card">...</div>
</div>
```

### Form field

```jsx
<label className="flex flex-col gap-2">
  <Label>Email</Label>
  <Input type="email" />
</label>
```

### Login

Centered `.login-card` — không split hero, không animation.

---

## 9. Responsive

Breakpoint chính: **900px** (mobile layout trong `components.css`).

Mobile: sidebar ẩn → `BottomNav` + `MobileDrawer`.

---

## 10. File map

```
frontend/
├── DESIGN_SYSTEM.md          ← tài liệu này
├── tailwind.config.js        ← Tailwind theme
├── src/styles/
│   ├── tokens.css            ← CSS variables (source of truth)
│   ├── tailwind.css          ← @tailwind + base layer
│   └── components.css        ← Layout + legacy components
└── src/components/ui/          ← React primitives
```

---

## 11. Changelog

| Date | Change |
|------|--------|
| 2026-06-22 | Zinc Studio — thay Transmission Desk / Indigo PRD cũ |
| 2026-06-22 | Migrate toàn bộ pages + shared components sang `PageHeader` / `Button` |
