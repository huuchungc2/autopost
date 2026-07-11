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

// 2026-07-11 — Tony chỉ ra vấn đề gốc của thiết kế ban đầu: `device_id` chỉ sống trong
// `chrome.storage.local` của extension (xem tidienAuth.js) — cài lại extension, xoá dữ liệu duyệt
// web, hay đổi máy đều sinh `device_id` MỚI, HOÀN TOÀN KHÔNG LIÊN QUAN tới thiết bị cũ (Chrome
// extension không có quyền đọc bất kỳ thông tin phần cứng thật nào để tự nhận ra "vẫn là máy này").
// Trước bản này, thiết bị cũ (đã ngừng hoạt động) chiếm slot VĨNH VIỄN cho tới khi admin chủ động gỡ
// — một người chỉ xài đúng 1 máy vẫn có thể tự nhiên bị khoá sau khi cài lại extension, dù không hề
// dùng 2 máy cùng lúc. Thêm cơ chế tự hết hạn: thiết bị không có hoạt động nào (`last_seen_at`)
// trong `DEVICE_STALE_DAYS` không còn tính vào giới hạn plan nữa — tự nhường chỗ cho thiết bị mới mà
// không cần admin/self-service can thiệp. Đổi lại: 1 key về lý thuyết có thể "luân phiên" nhiều hơn
// N máy nếu mỗi máy chỉ dùng thưa hơn chu kỳ này — chấp nhận được, vì mục tiêu chính là chặn NHIỀU
// máy dùng ĐỒNG THỜI (chia sẻ key), không phải đếm tuyệt đối lịch sử mọi máy từng kích hoạt.
export const DEVICE_STALE_DAYS = 14;

// Kiểm tra + đăng ký thiết bị cho 1 license key. Thiết bị đã có sẵn trong bảng thì chỉ cập nhật
// last_seen_at (không tính vào giới hạn thêm lần nữa). Thiết bị MỚI mà số thiết bị CÒN HOẠT ĐỘNG
// (last_seen_at trong DEVICE_STALE_DAYS gần nhất) đã đủ theo plan thì từ chối. Nếu đã đủ CHỖ hoạt
// động nhưng có sẵn thiết bị đã "hết hạn" (bỏ hoang) thì tự dọn (không đợi admin gỡ tay) rồi mới
// đăng ký thiết bị mới — hiệu ứng: 1 máy cài lại extension lâu ngày tự nhường chỗ, không cần ai can
// thiệp.
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
  const activeCountRows = await query(
    `SELECT COUNT(*) AS c FROM license_key_devices
     WHERE license_key_id = ? AND last_seen_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [licenseKeyId, DEVICE_STALE_DAYS]
  );
  const activeCount = Number(activeCountRows[0]?.c || 0);
  if (activeCount >= limit) {
    return { ok: false, reason: 'device_limit_reached', limit, count: activeCount };
  }

  // Dọn thiết bị đã hết hạn ngay lúc cần chỗ — tránh bảng phình rác vô hạn, và admin UI (danh sách
  // thiết bị) không bị rối bởi máy đã bỏ hoang từ lâu.
  await query(
    `DELETE FROM license_key_devices
     WHERE license_key_id = ? AND last_seen_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [licenseKeyId, DEVICE_STALE_DAYS]
  );

  await query(
    'INSERT INTO license_key_devices (license_key_id, device_id, device_label) VALUES (?, ?, ?)',
    [licenseKeyId, deviceId, deviceLabel || null]
  );
  return { ok: true, registered: true };
}

export async function listDevicesForKey(licenseKeyId) {
  // `stale` — không còn tính vào giới hạn plan (xem registerOrCheckDevice()), hiển thị cho admin
  // biết máy nào đang thật sự "chiếm slot" và máy nào đã bỏ hoang (dù chưa bị dọn tới lần đăng ký
  // thiết bị mới kế tiếp).
  return query(
    `SELECT id, device_id, device_label, first_seen_at, last_seen_at,
            (last_seen_at < DATE_SUB(NOW(), INTERVAL ? DAY)) AS stale
     FROM license_key_devices WHERE license_key_id = ? ORDER BY last_seen_at DESC`,
    [DEVICE_STALE_DAYS, licenseKeyId]
  );
}

export async function countDevicesForKey(licenseKeyId) {
  const rows = await query(
    `SELECT COUNT(*) AS c FROM license_key_devices
     WHERE license_key_id = ? AND last_seen_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [licenseKeyId, DEVICE_STALE_DAYS]
  );
  return Number(rows[0]?.c || 0);
}

export async function removeDevice(licenseKeyId, deviceRowId) {
  await query(
    'DELETE FROM license_key_devices WHERE license_key_id = ? AND id = ?',
    [licenseKeyId, deviceRowId]
  );
}
