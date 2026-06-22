import { cn } from '../../lib/utils';

export default function Card({ children, className, ...props }) {
  return (
    <div className={cn('card', className)} {...props}>
      {children}
    </div>
  );
}

export function StatCard({ icon, iconTone = 'blue', label, value }) {
  return (
    <div className="stat-card">
      <div className={`stat-card-icon stat-card-icon--${iconTone}`} aria-hidden>
        {icon}
      </div>
      <div className="stat-card-body">
        <span className="stat-card-label">{label}</span>
        <span className="stat-card-value">{value}</span>
      </div>
    </div>
  );
}
