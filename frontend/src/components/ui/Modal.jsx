import { createPortal } from 'react-dom';
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

  // Portal ra document.body — modal hay được mở từ nút nằm trong .card/.table-wrapper
  // (có transform lúc :hover), nếu render lồng tại chỗ thì transform của ancestor biến
  // "position: fixed" của overlay thành fixed-theo-ancestor thay vì theo viewport thật,
  // khiến popup lệch/co lại trong đúng khung ô đó thay vì nằm giữa màn hình.
  return createPortal(
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
    </div>,
    document.body
  );
}
