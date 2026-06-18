import { postStatusLabel } from '../../config/vi';

const variants = {
  draft: 'badge-draft',
  pending_approval: 'badge-pending',
  scheduled: 'badge-scheduled',
  publishing: 'badge-pending',
  published: 'badge-published',
  failed: 'badge-failed',
  default: 'badge-default',
};

export default function Badge({ children, status }) {
  const label = status ? postStatusLabel(status) : children;
  return <span className={`badge ${variants[status] || variants.default}`}>{label}</span>;
}
