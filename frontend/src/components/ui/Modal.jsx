import { X } from 'lucide-react';

export default function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide,
  size,
}) {
  if (!open) return null;

  const sizeClass = wide ? 'modal-wide' : size ? `modal-${size}` : '';

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className={`modal ${sizeClass}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-text">
            <h3>{title}</h3>
            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Đóng">
            <X size={20} strokeWidth={2} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
