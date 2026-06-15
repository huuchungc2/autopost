import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicRoot = path.resolve(__dirname, '../../public');
const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
const maxVideoMb = parseInt(process.env.MAX_VIDEO_UPLOAD_MB || '500', 10);

export function validateVideoFile(file) {
  if (!file) {
    throw new Error('Video file is required');
  }
  if (!allowedTypes.includes(file.mimetype)) {
    throw new Error('Unsupported video format');
  }
  if (file.size > maxVideoMb * 1024 * 1024) {
    throw new Error(`Video file exceeds maximum size of ${maxVideoMb}MB`);
  }
  return true;
}

export function storeVideoFile(file) {
  const createdAt = new Date();
  const year = createdAt.getFullYear();
  const month = String(createdAt.getMonth() + 1).padStart(2, '0');
  const destination = path.join(publicRoot, 'videos', `${year}`, `${month}`);
  fs.mkdirSync(destination, { recursive: true });
  const filePath = path.join(destination, file.filename);
  fs.renameSync(file.path, filePath);
  return { video_url: `/videos/${year}/${month}/${file.filename}` };
}
