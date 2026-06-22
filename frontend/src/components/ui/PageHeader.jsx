import { ArrowLeft } from 'lucide-react';
import Button from './Button';

export default function PageHeader({
  title,
  description,
  actions,
  back,
  className = '',
}) {
  const headerClass = [
    'page-header',
    back ? 'page-header--with-back' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={headerClass}>
      {back && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="page-header-back"
          onClick={back.onClick}
          aria-label={back.ariaLabel || back.label || 'Quay lại'}
        >
          <ArrowLeft size={18} />
          {back.label || 'Quay lại'}
        </Button>
      )}
      <div className="page-header-main">
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </div>
  );
}
