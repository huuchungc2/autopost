import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { driveFileIdFromUrl, downloadDriveFileStream } from '../services/googleDriveService.js';
import { parseImageRef, resolveLocalImagePath } from '../services/mediaStorage.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import fs from 'fs';

const router = express.Router();

/** Xem ảnh (Drive hoặc local) — dùng khi preview trong app */
router.get('/image', authenticate, asyncHandler(async (req, res) => {
  const ref = req.query.ref;
  if (!ref) return res.status(400).json({ error: 'ref is required' });

  const parsed = parseImageRef(ref);
  if (parsed.type === 'gdrive') {
    const stream = await downloadDriveFileStream(parsed.id);
    res.setHeader('Content-Type', 'image/jpeg');
    stream.pipe(res);
    return;
  }

  if (parsed.type === 'local') {
    const localPath = resolveLocalImagePath(ref);
    if (!localPath) return res.status(404).json({ error: 'File not found' });
    return res.sendFile(localPath);
  }

  if (parsed.type === 'remote') {
    return res.redirect(parsed.url);
  }

  res.status(400).json({ error: 'Unsupported image ref' });
}));

export default router;
