const MANUAL_PUBLISH_STATUSES = new Set(['draft', 'pending_approval', 'scheduled', 'failed']);

export function canManualPublish(post) {
  return Boolean(post?.id && MANUAL_PUBLISH_STATUSES.has(post.status));
}

export function manualPublishLabel(post) {
  if (post?.status === 'failed') return 'Đăng lại';
  if (post?.status === 'scheduled') return 'Đăng ngay';
  return 'Đăng';
}
