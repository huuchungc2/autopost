import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

// Không có tầng rate-limit nào trước bản này (audit 2026-07-06, xem CHANGELOG) — 1 license key bug
// vòng lặp (retry loop) hoặc bị lộ/dùng chung đều có thể gọi API không giới hạn tốc độ, dồn hết vào
// cùng 1 MySQL pool (connectionLimit: 10, dùng chung với cả website admin) rồi làm treo toàn bộ app.
// keyGenerator đọc thẳng header Authorization (raw, KHÔNG validate DB) — mỗi license/API key riêng
// có hạn mức riêng, không phạt oan các key khác chỉ vì chung 1 IP (NAT văn phòng, VPN...); request
// thiếu header thì rơi về IP — dùng `ipKeyGenerator()` (không phải `req.ip` trần) vì 1 host IPv6 có
// thể đổi địa chỉ trong cùng subnet gần như vô hạn, "req.ip thô" dễ bị bypass rate-limit.
function keyFromAuthHeader(req) {
  return req.headers.authorization || ipKeyGenerator(req.ip);
}

// Extension gọi /api/user-sync/* mỗi ~10 phút/thiết bị (tự động) + khi user thao tác tay (mở tab
// Comment, bấm nút Refresh/Chạy...) — 60 req/phút/key đủ rộng cho mọi thao tác tay dồn dập lẫn 1
// lượt "force full sync" (tối đa ~80 request rải trong nhiều giây, xem CHANGELOG), vẫn chặn được
// vòng lặp lỗi gọi liên tục vô hạn.
export const syncApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyFromAuthHeader,
  message: { error: 'Đồng bộ quá nhanh — thử lại sau ít phút' },
});

// Endpoint public, KHÔNG qua license-key auth (dùng để kiểm tra key có hợp lệ hay không — chính vì
// vậy không thể đòi hỏi key hợp lệ trước khi rate-limit) — chặn chặt hơn hẳn vì đây là bề mặt dò/brute-
// force license key duy nhất không cần đăng nhập gì trước.
// 2026-07-11 — nâng 10 → 30/15 phút: từ v1.0.247/248, 1 lượt "Đặt lại thiết bị" tự gọi 2 request
// liên tiếp (reset-devices rồi validate-key) qua CÙNG limiter này — cộng thêm vài lần bấm "Xác thực
// key" thử lại khi đang gỡ lỗi thiết bị, 10/15' hết sức dễ dính oan trong lúc dùng bình thường (Tony
// tự dính khi test). 30 vẫn đủ chặt để chặn spam/DoS (không phải phòng brute-force key thật — key là
// UUID 32 ký tự hex, ~10^38 khả năng, không ai dò được bằng rate limit nào cả), chỉ nới cho đúng nhu
// cầu dùng thật.
export const licenseValidateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  message: { error: 'Thử lại quá nhiều lần — chờ vài phút rồi thử lại' },
});
