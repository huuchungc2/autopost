# Cách dùng 2 file prompt này trong AutoPost

## 1. Copy file vào code AutoPost
Đặt 2 file `website-blog-prompt.js` và `fanpage-prompt.js` vào:
```
autopost/prompts/website-blog-prompt.js
autopost/prompts/fanpage-prompt.js
```

## 2. Cách gọi trong backend (ví dụ)

```javascript
const { buildWebsiteBlogPrompt } = require('./prompts/website-blog-prompt');
const { buildFanpagePrompt } = require('./prompts/fanpage-prompt');

// Lấy context dự án từ DB (bảng project/site đã có sẵn)
async function getProjectContext(projectId) {
  const project = await db.query('SELECT * FROM projects WHERE id = ?', [projectId]);
  // Ghép thành 1 đoạn text - bao gồm: brand voice, giá/data thật, USP, 
  // hotline, câu hỏi khách thật, visual identity...
  return `
Tên dự án: ${project.name}
Giọng văn: ${project.brand_voice}
Thông tin giá/dịch vụ: ${project.business_data}
Điểm khác biệt: ${project.usp}
Hotline: ${project.hotline}
Câu hỏi khách hay hỏi: ${project.faq_real}
`.trim();
}

// Generate bài blog website
async function generateWebsiteBlog(projectId, topic) {
  const projectContext = await getProjectContext(projectId);
  const prompt = buildWebsiteBlogPrompt({ projectContext, topic });
  
  const result = await callClaudeAPI(prompt); // hàm gọi Claude đã có sẵn trong AutoPost
  
  return parseWebsiteBlogOutput(result); // tự viết hàm parse theo OUTPUT FORMAT
}

// Generate bài fanpage (nâng cấp bài hiện tại)
async function generateFanpagePost(projectId, topic) {
  const projectContext = await getProjectContext(projectId);
  
  // Lấy 5-7 bài gần nhất để biết tỷ lệ hiện tại
  const recentPosts = await db.query(
    'SELECT post_type FROM posts WHERE project_id = ? ORDER BY created_at DESC LIMIT 7', 
    [projectId]
  );
  const recentPostsTypes = recentPosts.map(p => p.post_type);
  
  const prompt = buildFanpagePrompt({ projectContext, topic, recentPostsTypes });
  const result = await callClaudeAPI(prompt);
  
  return parseFanpageOutput(result);
}
```

## 3. Lưu ý khi parse output
Cả 2 prompt đều trả về theo format có `---` phân cách, dễ tách bằng regex 
hoặc split string. Ví dụ tách website blog:

```javascript
function parseWebsiteBlogOutput(text) {
  const meta = text.match(/TITLE: (.+)\nMETA_DESCRIPTION: (.+)\nSLUG: (.+)/);
  const content = text.split('---')[2]; // phần giữa 2 dấu ---
  return {
    title: meta[1],
    metaDescription: meta[2],
    slug: meta[3],
    content: content.trim(),
  };
}
```

## 4. Cần bổ sung vào DB (nếu chưa có)
Bảng `posts` cần thêm field `post_type` (GIA_TRI / GIOI_THIEU / BAN_HANG) 
để track tỷ lệ 70/20/10 cho fanpage - nếu bảng hiện tại chưa có field này.

Bảng `posts` cần hỗ trợ `platform = 'website'` nếu trước đây chỉ có 
'fanpage'/'group'.

## 5. Phần ảnh (cần code riêng, không có trong 2 file trên)
Sau khi nhận `IMAGE_PROMPT` từ output, generate ảnh xong cần:
```javascript
const sharp = require('sharp'); // npm install sharp

await sharp(generatedImageBuffer)
  .webp({ quality: 85 })
  .toFile(`${slug}-1.webp`); // đặt tên theo slug, không dùng tên random
```

## 6. Những gì KHÔNG có trong 2 file prompt này, cần tự bổ sung sau
- `/write-zalo` - Zalo OA/group, chưa viết (cần spec riêng từ Tony)
- Retention gate cho TikTok/Reel - cần file prompt riêng, khác cấu trúc 
  (không phải bài viết text, mà kịch bản theo giây)
- Module tính điểm SEO bằng code (keyword density, readability) - hiện tại 
  để Claude tự đánh giá trong cùng 1 lần gọi, chưa tách riêng thành hàm JS
