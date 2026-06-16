import { NavLink } from 'react-router-dom';
import { X, Zap, KeyRound, LogOut } from 'lucide-react';
import { getNavGroupsForRole } from '../config/navConfig';

export default function MobileDrawer({ open, role, user, onClose, onLogout, onChangePassword }) {
  const groups = getNavGroupsForRole(role || 'editor');

  if (!open) return null;

  return (
    <div className="mobile-drawer-root" role="dialog" aria-modal="true" aria-label="Menu">
      <button type="button" className="mobile-drawer-backdrop" onClick={onClose} aria-label="Đóng menu" />
      <aside className="mobile-drawer">
        <div className="mobile-drawer-header">
          <div className="mobile-drawer-brand">
            <span className="mobile-drawer-brand-icon" aria-hidden>
              <Zap size={20} strokeWidth={2.25} />
            </span>
            <div>
              <div className="mobile-drawer-title">AutoPost</div>
              <div className="mobile-drawer-subtitle">{user?.name || 'Người dùng'}</div>
            </div>
          </div>
          <button type="button" className="mobile-drawer-close" onClick={onClose} aria-label="Đóng">
            <X size={20} />
          </button>
        </div>

        {role !== 'super_admin' && (
          <div className="mobile-drawer-hint">
            {role === 'admin' ? 'Quản trị viên — fanpage & provider được gán' : 'Biên tập — fanpage được gán'}
          </div>
        )}

        <nav className="mobile-drawer-nav">
          {groups.map((group) => (
            <div key={group.id} className="mobile-drawer-group">
              <div className="mobile-drawer-group-label">{group.label}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `mobile-drawer-link${isActive ? ' active' : ''}`
                    }
                    onClick={onClose}
                  >
                    <Icon size={20} strokeWidth={2} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="mobile-drawer-footer">
          <button type="button" className="mobile-drawer-action" onClick={onChangePassword}>
            <KeyRound size={18} />
            <span>Đổi mật khẩu</span>
          </button>
          <button type="button" className="mobile-drawer-action mobile-drawer-action--danger" onClick={onLogout}>
            <LogOut size={18} />
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>
    </div>
  );
}
