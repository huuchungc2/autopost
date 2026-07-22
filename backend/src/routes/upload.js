import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authenticate } from '../middleware/auth.js';
import { storeUploadedImage, validateImageUpload } from '../services/imageService.js';
import { isUsingGoogleDrive } from '../services/mediaStorage.js';
import { storeVideoFile, validateVideoFile } from '../services/videoService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const basePublicDir = path.resolve(__dirname, '../../../public');

const router = express.Router();
router.use(authenticate);

// Ánh xạ mimetype → đuôi file AN TOÀN. Trước đây filename lấy thẳng path.extname(originalname) do client
// khai — kẻ tấn công đăng `evil.html` khai mimetype 'image/png' sẽ được ghi ra /public/images/evil.html
// rồi serve tại /images/evil.html → stored XSS ngay trên domain (token nằm ở localStorage). Giờ đuôi file
// luôn suy ra từ mimetype đã whitelist, không tin originalname.
const IMAGE_EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
};
const VIDEO_EXT_BY_MIME = {
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/x-msvideo': '.avi',
  'video/x-matroska': '.mkv',
};

const maxImageUploadMb = parseInt(process.env.MAX_IMAGE_UPLOAD_MB || '15', 10);
const maxVideoUploadMb = parseInt(process.env.MAX_VIDEO_UPLOAD_MB || '500', 10);

// Tên file duy nhất: Date.now() có thể trùng khi 2 người upload cùng mili-giây → thêm chuỗi random.
function uniqueBase(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(basePublicDir, 'videos', 'tmp');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${uniqueBase('video')}${VIDEO_EXT_BY_MIME[file.mimetype] || '.mp4'}`);
  },
});

function imageFileFilter(req, file, cb) {
  if (!IMAGE_EXT_BY_MIME[file.mimetype]) {
    return cb(new Error('Định dạng ảnh không hỗ trợ (chỉ PNG/JPG/WEBP)'));
  }
  cb(null, true);
}

function videoFileFilter(req, file, cb) {
  if (!VIDEO_EXT_BY_MIME[file.mimetype]) {
    return cb(new Error('Định dạng video không hỗ trợ'));
  }
  cb(null, true);
}

// Luôn dùng memoryStorage — KHÔNG chọn disk/memory theo isUsingGoogleDrive() ở đây, vì dòng này chạy
// đúng 1 lần lúc import module (trước cả dotenv.config() và loadAppSettings() trong app.js), nên luôn
// đọc cache rỗng → luôn ra 'local' bất kể admin đã cấu hình gì trong Cài đặt. Hậu quả: khi Cài đặt chọn
// Google Drive, multer vẫn ghi ra đĩa (không có req.file.buffer) trong khi route handler bên dưới lại
// tưởng đang ở chế độ Drive và cố đọc buffer → upload ảnh thất bại. Chọn nơi lưu (đĩa hay Drive) NGAY
// TRONG route handler, nơi isUsingGoogleDrive() được gọi lại mỗi request nên luôn phản ánh đúng Cài đặt.
const imageUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFileFilter,
  limits: { fileSize: maxImageUploadMb * 1024 * 1024 },
});
const videoUpload = multer({
  storage: videoStorage,
  fileFilter: videoFileFilter,
  limits: { fileSize: maxVideoUploadMb * 1024 * 1024 },
});

// Bọc middleware multer để lỗi (file quá lớn / sai định dạng) trả 400 rõ ràng thay vì 500.
function handleUpload(mw) {
  return (req, res, next) => mw(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'File vượt quá dung lượng cho phép'
        : (err.message || 'Upload thất bại');
      return res.status(400).json({ error: msg });
    }
    next();
  });
}

router.post('/image', handleUpload(imageUpload.single('image')), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Image is required' });
  try {
    await validateImageUpload(req.file);
    if (isUsingGoogleDrive()) {
      const pageId = req.query.page_id || req.body?.page_id || null;
      const url = await storeUploadedImage(req.file, { pageId: pageId ? Number(pageId) : null });
      return res.json({ url, storage: 'google_drive' });
    }
    const dir = path.join(basePublicDir, 'images');
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${uniqueBase('image')}${IMAGE_EXT_BY_MIME[req.file.mimetype] || '.png'}`;
    await fs.promises.writeFile(path.join(dir, filename), req.file.buffer);
    res.json({ url: `/images/${filename}`, storage: 'local' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/video', handleUpload(videoUpload.single('video')), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Video is required' });
  try {
    validateVideoFile(req.file);
    const stored = storeVideoFile(req.file);
    res.json({ url: stored.video_url });
  } catch (error) {
    if (req.file?.path) {
      fs.promises.unlink(req.file.path).catch(() => {});
    }
    res.status(400).json({ error: error.message });
  }
});

export default router;
