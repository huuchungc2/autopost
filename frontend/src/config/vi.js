export const POST_STATUS_LABELS = {
  draft: 'Nháp',
  pending_approval: 'Chờ duyệt',
  scheduled: 'Đã lên lịch',
  publishing: 'Đang đăng',
  published: 'Đã đăng',
  failed: 'Lỗi',
};

export function postStatusLabel(status) {
  return POST_STATUS_LABELS[status] || status;
}

export const MEDIA_TYPE_LABELS = {
  image: 'Ảnh',
  video: 'Video',
  none: 'Không media',
};

export function mediaTypeLabel(type) {
  return MEDIA_TYPE_LABELS[type] || type;
}

export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Quản trị viên',
  editor: 'Biên tập',
};

export function roleLabel(role) {
  return ROLE_LABELS[role] || role;
}

export const WEEK_DAYS = [
  { value: 0, label: 'Chủ nhật' },
  { value: 1, label: 'Thứ 2' },
  { value: 2, label: 'Thứ 3' },
  { value: 3, label: 'Thứ 4' },
  { value: 4, label: 'Thứ 5' },
  { value: 5, label: 'Thứ 6' },
  { value: 6, label: 'Thứ 7' },
];

export const TOKEN_STATUS_LABELS = {
  valid: 'Hợp lệ',
  expired: 'Hết hạn',
  missing: 'Chưa có',
  invalid: 'Không hợp lệ',
  unknown: 'Chưa kiểm tra',
};

export function tokenStatusLabel(status) {
  return TOKEN_STATUS_LABELS[status] || status;
}

export const JOB_STATUS_LABELS = {
  pending: 'Chờ xử lý',
  running: 'Đang chạy',
  processing: 'Đang xử lý',
  done: 'Hoàn thành',
  failed: 'Lỗi',
};

export function jobStatusLabel(status) {
  return JOB_STATUS_LABELS[status] || status;
}

export const SKILL_TYPE_LABELS = {
  text: 'Viết bài',
  image: 'Ảnh',
  video: 'Video',
};

export function skillTypeLabel(type) {
  return SKILL_TYPE_LABELS[type] || type;
}

export const SKILL_TYPE_HINTS = {
  text: 'Quy tắc giọng văn, cấu trúc bài Facebook',
  image: 'Quy tắc sinh image_prompt (AI vẽ ảnh theo prompt này)',
  video: 'Quy tắc sinh video_prompt (mô tả video — chưa AI render file)',
};
