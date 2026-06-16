import { useNavigate } from 'react-router-dom';
import { Menu, LogOut, KeyRound, Zap } from 'lucide-react';
import { useAuth } from '../services/authContext';
import { getPageTitle } from '../config/navConfig';
import NotificationDropdown from './NotificationDropdown';

export default function Header({ isMobile, pathname, sidebarCollapsed, onSidebarToggle }) {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const pageTitle = getPageTitle(pathname);

  if (isMobile) {
    const initial = (user?.name || user?.email || 'U').charAt(0).toUpperCase();
    return (
      <header className="app-header app-header--mobile">
        <div className="header-left">
          <span className="header-mobile-logo" aria-hidden>
            <Zap size={18} strokeWidth={2.25} />
          </span>
          <span className="header-title">{pageTitle}</span>
        </div>
        <div className="header-right">
          <NotificationDropdown />
          <button
            type="button"
            className="header-avatar-btn"
            onClick={() => navigate('/change-password')}
            title={user?.name || 'Profile'}
            aria-label="Tài khoản"
          >
            {initial}
          </button>
        </div>
      </header>
    );
  }

  return (
    <header className="app-header">
      <div className="header-left">
        <button
          type="button"
          className="header-menu-btn"
          onClick={onSidebarToggle}
          aria-label={sidebarCollapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
        >
          <Menu size={20} />
        </button>
        <span className="header-title">AutoPost</span>
      </div>
      <div className="header-right">
        <NotificationDropdown />
        <button
          type="button"
          className="header-icon-btn"
          onClick={() => navigate('/change-password')}
          title="Đổi mật khẩu"
        >
          <KeyRound size={18} />
          <span className="header-btn-label">{user?.name || 'Profile'}</span>
        </button>
        <button type="button" className="header-icon-btn" onClick={logout} title="Đăng xuất">
          <LogOut size={18} />
          <span className="header-btn-label">Đăng xuất</span>
        </button>
      </div>
    </header>
  );
}
