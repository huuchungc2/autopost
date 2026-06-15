import { query } from '../db.js';

export async function createNotification({ userId = null, type, title, message, relatedType = null, relatedId = null }) {
  await query(
    'INSERT INTO notifications (user_id, type, title, message, is_read, related_type, related_id, created_at) VALUES (?, ?, ?, ?, false, ?, ?, NOW())',
    [userId, type, title, message, relatedType, relatedId]
  );
}
