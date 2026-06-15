export function typeLabel(type) {
  if (type === 'text') return 'Văn bản';
  if (type === 'image') return 'Ảnh';
  if (type === 'video') return 'Video (chưa hỗ trợ AI)';
  return type;
}
