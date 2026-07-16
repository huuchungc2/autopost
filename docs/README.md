# Tài liệu AutoPost

> Đọc file này trước khi đào codebase. Agent: cập nhật index khi thêm doc mới.

## Chủ đề

| Doc | Khi nào đọc |
|-----|-------------|
| [SECURITY.md](./SECURITY.md) | Mô hình xác thực (3 loại token), rate limit, guard bắt buộc khi thêm route/upload/log — đọc trước khi đụng middleware auth |
| [TOKENS_AND_COMPOSIO.md](./TOKENS_AND_COMPOSIO.md) | Token FB manual + Composio, dual token, kiểm tra hiệu lực, đăng bài |
| [GOOGLE_DRIVE.md](./GOOGLE_DRIVE.md) | Drive OAuth2, folder gốc, folder riêng từng fanpage |
| [WEBSITE_BLOG.md](./WEBSITE_BLOG.md) | Tạo bài blog SEO website, tỷ lệ nội dung fanpage 70/20/10, getProjectContext |
| [WEBSITE_PUBLISH_API.md](./WEBSITE_PUBLISH_API.md) | Spec API đẩy bài blog lên CMS website thật (đưa cho dev website) |
| [GROUPFLOW.md](./GROUPFLOW.md) | Chrome extension FB Group, API sync, đăng/comment nền, cài extension |
| [../GroupFlow/fb-group-poster/README.md](../GroupFlow/fb-group-poster/README.md) | Cài load unpacked, SW, side panel, troubleshooting |
| [../DEPLOY.md](../DEPLOY.md) | Deploy VPS, PM2, Nginx, migration, smoke test, lỗi production |
| [../TODO.md](../TODO.md) | Đã làm / còn lại |
| [../CHANGELOG.md](../CHANGELOG.md) | Thay đổi theo phiên bản |
| [../PROJECT_PROGRESS.md](../PROJECT_PROGRESS.md) | Tổng quan milestone |
| [../frontend/DESIGN_SYSTEM.md](../frontend/DESIGN_SYSTEM.md) | UI, tokens CSS, components |

## Nguyên tắc ghi chép

Mọi feature/fix có hành vi mới → cập nhật **CHANGELOG + TODO + doc chủ đề** (cùng lúc với code).  
Rule Cursor: `.cursor/rules/document-on-change.mdc`.

## Thêm doc mới

1. Tạo `docs/<TÊN>.md` — tóm tắt, luồng, DB/config, file code, checklist.
2. Link vào bảng trên.
3. Bullet trong `CHANGELOG.md` `[Unreleased]`.
