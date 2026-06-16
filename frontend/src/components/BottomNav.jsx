import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileText, Sparkles, Menu } from 'lucide-react';
import { isSecondaryRoute } from '../config/navConfig';

const tabItems = [
  { to: '/', label: 'Trang chủ', icon: LayoutDashboard, end: true },
  { to: '/posts', label: 'Bài viết', icon: FileText },
  { to: '/generate', label: 'Tạo bài', icon: Sparkles, primary: true },
];

export default function BottomNav({ role, pathname, menuOpen, onMenuOpen }) {
  const menuActive = menuOpen || isSecondaryRoute(pathname);

  return (
    <nav className="bottom-nav" aria-label="Điều hướng chính">
      {tabItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `bottom-nav-link${item.primary ? ' bottom-nav-link--primary' : ''}${isActive ? ' active' : ''}`
            }
          >
            <span className="bottom-nav-icon">
              <Icon size={item.primary ? 22 : 20} strokeWidth={2} />
            </span>
            <span>{item.label}</span>
          </NavLink>
        );
      })}
      <button
        type="button"
        className={`bottom-nav-link bottom-nav-link--menu${menuActive ? ' active' : ''}`}
        onClick={onMenuOpen}
        aria-label="Mở menu"
        aria-expanded={menuOpen}
      >
        <span className="bottom-nav-icon">
          <Menu size={20} strokeWidth={2} />
        </span>
        <span>Menu</span>
      </button>
    </nav>
  );
}
