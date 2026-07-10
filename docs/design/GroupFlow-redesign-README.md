# Handoff: GroupFlow — Compose ("Tạo bài") Screen Redesign

## Overview
This is a redesign of the "Tạo bài" (Compose Post) screen for GroupFlow, a Chrome extension that schedules Facebook Group posts. The goal was to clean up a cramped, ad-cluttered UI into a calmer, consistent SaaS-style layout while keeping the same features and Vietnamese copy.

## About the Design Files
The file in this bundle (`GroupFlow Redesign.dc.html`) is a **design reference built in HTML** — a high-fidelity mockup of the intended look, not production code to copy directly. The task is to **recreate this HTML design inside the extension's existing codebase** (whatever framework it's built with — plain JS, React, Vue, etc.), using that codebase's existing component patterns, state management, and build setup. If there is no established pattern yet, choose whatever is simplest given the existing extension code.

## Fidelity
**High-fidelity.** Colors, spacing, type sizes, and layout are final. Interactive behavior (dropdowns, tab switching, editor state, scheduling logic) is only sketched — the original app's existing behavior for those should be preserved; only the visual treatment changes.

## Screens / Views

### Compose ("Tạo bài") panel
**Purpose:** Compose one post (or post variants A–D), pick target groups, and schedule/publish to Facebook groups.

**Layout:** Single card, 380px wide (extension popup width), white background, 20px corner radius, soft drop shadow. Vertical stack, top to bottom:
1. Header bar (dark navy)
2. Tab row (7 tabs)
3. Content area (padding 18px), containing: Step 1 group picker, Step 2 composer, schedule info strip, primary action button, promo links row

**Components:**

- **Header bar** — background `oklch(24% 0.03 258)` (dark navy-blue), 16px/18px padding, flex row space-between.
  - Logo: 34×34px, 10px radius, background `oklch(56% 0.19 258)` (primary blue accent), white bold "G", 16px.
  - Title "GroupFlow": white, 14px, weight 700. Subtitle "FB GROUP POSTER": `oklch(78% 0.02 258)`, 10.5px, letter-spacing 0.03em.
  - User pill (right): background `oklch(32% 0.03 258)`, pill radius, avatar 22px circle `oklch(60% 0.15 40)` with "T", label "Tony" white 11.5px.

- **Tab row** — 7 tabs, flex row, horizontally scrollable, 6px/8px padding, bottom border `1px solid oklch(92% 0.01 250)`.
  - Icons stacked above 10px labels. Active tab ("Tạo bài"): background `oklch(94% 0.03 258)`, label color `oklch(56% 0.19 258)` bold. Inactive tabs: icon+label `oklch(55% 0.02 250)`.
  - Tabs in order: Tạo bài (active), Comment (badge "37" — red pill `oklch(58% 0.22 25)`, top-right of icon), Cài đặt, Nhóm, Radar, Log, Hướng dẫn.

- **Step 1 — "Bạn muốn đăng ở đâu?"**
  - Numbered circle badge "1": 20px, dark `oklch(22% 0.02 250)` bg, white bold number.
  - Group picker field: bordered box (`1px solid oklch(90% 0.01 250)`, 12px radius, bg `oklch(98% 0.004 250)`), placeholder text "Nhấp để chọn các nhóm mục tiêu cần đăng" (13px, `oklch(55% 0.02 250)`), right-aligned pill badge "0 nhóm ▾" (blue bg `oklch(94% 0.03 258)`, blue text `oklch(56% 0.19 258)`).

- **Step 2 — "Bạn muốn nói gì?"**
  - Segmented control (3 options): "Nhập tay" (active, filled blue `oklch(56% 0.19 258)`, white text), "AI viết", "Excel" (inactive, transparent, `oklch(50% 0.02 250)` text). Track background `oklch(96% 0.006 250)`, 11px radius.
  - Editor card (bordered, 14px radius, clipped):
    - Variant row: chips "A" (active — bordered blue `oklch(56% 0.19 258)`), "B"/"C"/"D" (bordered neutral `oklch(90% 0.01 250)`), right-aligned counter chip "40/100" (red bg `oklch(95% 0.03 25)`, red text `oklch(58% 0.22 25)`).
    - Tools row: chips "{spin}", "Bọc" (light gray bg `oklch(96% 0.006 250)`), emoji button 😊, right-aligned "AI…" dropdown select.
    - Text area: empty content region, min-height 64px, 12px padding (this is the actual rich-text editing surface in the real app).
    - Formatting toolbar (bottom, bordered top): Bold, Italic, ordered list, bullet list icons, "Tx" (clear formatting) right-aligned. Color `oklch(55% 0.02 250)`.

- **Schedule info strip** — light gray background `oklch(96% 0.006 250)`, 12px radius, 10px/14px padding, 11.5px text: "**30 bài** — tick để hẹn lịch · đăng ngay: nút đăng trên từng card" (bold count, rest muted `oklch(50% 0.02 250)`).

- **Primary button** — full width, "Lên lịch đã chọn", white bg, `1.5px solid oklch(90% 0.01 250)` border, 12px radius, 13.5px weight 600 text `oklch(30% 0.02 250)`.

- **Promo links row** — two equal-width pill chips replacing the original full-width ad banners:
  - "🤖 Zalopilot" — bg `oklch(95% 0.03 258)`, text `oklch(40% 0.1 258)`.
  - "🚌 Đặt xe về quê" — bg `oklch(96% 0.03 55)`, text `oklch(45% 0.1 55)`.
  - Both 11px, weight 600, 10px radius, 8px/10px padding.

## Interactions & Behavior
Not respecified here — reuse the original extension's existing logic for: tab switching, group multi-select dropdown, Nhập tay/AI viết/Excel mode switch, variant A/B/C/D tab switching + char counter, rich-text formatting toolbar, and the scheduling/publish flow. Only the visual chrome changed; no new interaction patterns were introduced.

Recommended (not yet designed) hover/active states: darken button backgrounds ~8% on hover, add a subtle focus ring (`2px solid oklch(56% 0.19 258 / 0.35)`) on the group-picker field and text editor when focused.

## Design Tokens

**Colors**
- Background (page): `oklch(96.5% 0.006 250)`
- Card/surface: `oklch(100% 0 0)` (white)
- Header navy: `oklch(24% 0.03 258)`
- Header navy (pill): `oklch(32% 0.03 258)`
- Primary accent (blue): `oklch(56% 0.19 258)`
- Primary accent soft bg: `oklch(94% 0.03 258)`
- Text primary: `oklch(22% 0.02 250)`
- Text secondary: `oklch(50–58% 0.02 250)` (varies slightly by context)
- Border/hairline: `oklch(90–93% 0.01 250)`
- Neutral fill (chips, tool rows): `oklch(96–98% 0.006 250)`
- Danger/counter red: `oklch(58% 0.22 25)`, soft bg `oklch(95% 0.03 25)`
- Avatar orange: `oklch(60% 0.15 40)`

**Typography**
- Font family: "Be Vietnam Pro" (Google Fonts, weights 400/500/600/700/800), fallback system-ui/sans-serif. Chosen for full Vietnamese diacritic support.
- Sizes used: 10px (tab labels), 11–11.5px (chips/meta), 12.5–13.5px (body/buttons), 14–15px (titles).

**Radius**
- Card: 20px · Editor card: 14px · Fields/buttons: 10–12px · Chips/pills: 7px–999px (full pill)

**Shadow**
- Card: `0 20px 50px -20px oklch(30% 0.02 250 / 0.35), 0 1px 0 oklch(90% 0.01 250)`

## Assets
No image assets used — logo is a colored square with a letterform "G", avatar is a colored circle with initial "T". Icons are plain text/unicode glyphs (✎ ◉ ⚙ ◎ ◎ ▤ ?) as placeholders — swap in the extension's real icon set during implementation.

## Files
- `GroupFlow Redesign.dc.html` — the full mockup described above. Open in a browser to view/inspect.

## Implementation status
Applied to the shared shell only (header, tab bar, and global `:root` tokens in `sidepanel.css`/`sidepanel.html`) as of GroupFlow v1.0.233 — see `CHANGELOG.md`. The per-tab detailed layout (Compose step cards, editor toolbar, etc.) described above as "Compose panel" has **not** been rebuilt to match this mockup pixel-for-pixel; that remains a separate follow-up if wanted.
