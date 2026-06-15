const variants = {
  draft: 'badge-draft',
  pending_approval: 'badge-pending',
  scheduled: 'badge-scheduled',
  published: 'badge-published',
  failed: 'badge-failed',
  default: 'badge-default',
};

export default function Badge({ children, status }) {
  return <span className={`badge ${variants[status] || variants.default}`}>{children}</span>;
}
