import { query } from '../db.js';

// 2026-07-10 — giới hạn số thiết bị/máy dùng chung 1 license key, theo plan. Trước bản này
// license_keys hoàn toàn không phân biệt thiết bị (xem license_key_devices migration 044). Số này
// chỉ chặn lúc kích hoạt key trên 1 thiết bị MỚI (POST /user-auth/validate-key) — thiết bị đã đăng
// ký trước đó vẫn tiếp tục đồng bộ bình thường tới khi extension tự re-validate lại (không có kiểm
// tra theo từng request nền, giữ đơn giản — xem docs/GROUPFLOW.md mục License).
export const PLAN_DEVICE_LIMITS = {
  free: 1,
  pro: 3,
  enterprise: 10,
};

export function getDeviceLimit(plan) {
  return PLAN_DEVICE_LIMITS[plan] ?? PLAN_DEVICE_LIMITS.free;
}

// Kiểm tra + đăng ký thiết bị cho 1 license key. Thiết bị đã có sẵn trong bảng thì chỉ cập nhật
// last_seen_at (không tính vào giới hạn thêm lần nữa). Thiết bị MỚI mà đã đủ số lượng theo plan thì
// từ chối — không tự động "đá" thiết bị cũ ra (đúng ý "giới hạn", không phải "thiết bị mới nhất
// thắng"), admin phải chủ động gỡ bớt qua UI mới nhường chỗ cho thiết bị mới.
export async function registerOrCheckDevice({ licenseKeyId, plan, deviceId, deviceLabel }) {
  if (!deviceId) {
    // Bản extension cũ chưa gửi deviceId — không chặn (fail-open), tránh khoá luôn người dùng cũ
    // trước khi họ kịp cập nhật extension.
    return { ok: true, skipped: 'no_device_id' };
  }
  const existing = await query(
    'SELECT id FROM license_key_devices WHERE license_key_id = ? AND device_id = ? LIMIT 1',
    [licenseKeyId, deviceId]
  );
  if (existing.length) {
    await query(
      'UPDATE license_key_devices SET last_seen_at = NOW(), device_label = COALESCE(?, device_label) WHERE id = ?',
      [deviceLabel || null, existing[0].id]
    );
    return { ok: true };
  }

  const limit = getDeviceLimit(plan);
  const countRows = await query(
    'SELECT COUNT(*) AS c FROM license_key_devices WHERE license_key_id = ?',
    [licenseKeyId]
  );
  const count = Number(countRows[0]?.c || 0);
  if (count >= limit) {
    return { ok: false, reason: 'device_limit_reached', limit, count };
  }

  await query(
    'INSERT INTO license_key_devices (license_key_id, device_id, device_label) VALUES (?, ?, ?)',
    [licenseKeyId, deviceId, deviceLabel || null]
  );
  return { ok: true, registered: true };
}

export async function listDevicesForKey(licenseKeyId) {
  return query(
    `SELECT id, device_id, device_label, first_seen_at, last_seen_at
     FROM license_key_devices WHERE license_key_id = ? ORDER BY last_seen_at DESC`,
    [licenseKeyId]
  );
}

export async function countDevicesForKey(licenseKeyId) {
  const rows = await query(
    'SELECT COUNT(*) AS c FROM license_key_devices WHERE license_key_id = ?',
    [licenseKeyId]
  );
  return Number(rows[0]?.c || 0);
}

export async function removeDevice(licenseKeyId, deviceRowId) {
  await query(
    'DELETE FROM license_key_devices WHERE license_key_id = ? AND id = ?',
    [licenseKeyId, deviceRowId]
  );
}
