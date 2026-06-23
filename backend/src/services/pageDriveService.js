import { query } from '../db.js';
import { getEffectiveDriveFolderId } from './appSettingsService.js';

export function normalizeDriveFolderId(value) {
  const folderId = String(value ?? '').trim();
  if (!folderId) return null;
  if (folderId.includes('@')) {
    const error = new Error('Folder ID không phải email — copy ID từ URL folder Drive');
    error.status = 400;
    throw error;
  }
  return folderId;
}

/** Folder riêng fanpage → fallback folder global trong Cài đặt. */
export async function getDriveFolderIdForPage(pageId) {
  if (pageId) {
    const rows = await query(
      'SELECT google_drive_folder_id FROM fb_pages WHERE id = ? LIMIT 1',
      [pageId]
    );
    const pageFolder = rows[0]?.google_drive_folder_id?.trim();
    if (pageFolder) return pageFolder;
  }
  return getEffectiveDriveFolderId();
}
