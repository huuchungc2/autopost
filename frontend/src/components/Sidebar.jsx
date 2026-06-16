import { NavLink } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import { getNavGroupsForRole } from '../config/navConfig';

export default function Sidebar({ role, collapsed, onToggle }) {
  const groups = getNavGroupsForRole(role || 'editor');

  return (
    <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <span className="sidebar-brand-icon" aria-hidden>
            <Zap size={20} strokeWidth={2.25} />
          </span>
          {!collapsed && <span className="sidebar-logo">AutoPost</span>}
        </div>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={onToggle}
          aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
          title={collapsed ? 'Mở menu' : 'Thu gọn menu'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {role !== 'super_admin' && !collapsed && (
        <div className="sidebar-role-hint">
          {role === 'admin' ? 'Admin — fanpage & provider được gán' : 'Editor — fanpage được gán'}
        </div>
      )}

      <nav className="sidebar-nav">
        {groups.map((group, groupIndex) => (
          <div key={group.id} className="sidebar-group">
            {!collapsed && <div className="sidebar-group-label">{group.label}</div>}
            {collapsed && groupIndex > 0 && <div className="sidebar-group-divider" />}
            <div className="sidebar-group-items">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `sidebar-link${isActive ? ' active' : ''}`
                    }
                    title={collapsed ? item.label : undefined}
                  >
                    <span className="sidebar-link-icon" aria-hidden>
                      <Icon size={18} strokeWidth={2} />
                    </span>
                    {!collapsed && <span className="sidebar-link-label">{item.label}</span>}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
