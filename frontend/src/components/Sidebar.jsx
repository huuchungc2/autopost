import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { getNavGroupsForRole } from '../config/navConfig';

const COLLAPSED_GROUPS_KEY = 'autopost-sidebar-collapsed-groups';

function loadCollapsedGroups() {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_GROUPS_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function navItemIsActive(item, location) {
  const [itemPath, itemSearch] = item.to.split('?');
  if (itemSearch) {
    // Items with query string: must match both pathname and the query param(s)
    if (location.pathname !== itemPath) return false;
    const itemParams = new URLSearchParams(itemSearch);
    const locationParams = new URLSearchParams(location.search);
    for (const [k, v] of itemParams.entries()) {
      if (locationParams.get(k) !== v) return false;
    }
    return true;
  }
  // Items without query string: pathname match (end-exact or prefix)
  if (item.end) return location.pathname === itemPath;
  return location.pathname === itemPath || location.pathname.startsWith(`${itemPath}/`);
}

export default function Sidebar({ role, collapsed, onToggle }) {
  const groups = getNavGroupsForRole(role || 'editor');
  const location = useLocation();
  const [collapsedGroups, setCollapsedGroups] = useState(loadCollapsedGroups);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...collapsedGroups]));
    } catch {
      /* ignore */
    }
  }, [collapsedGroups]);

  const toggleGroup = (groupId) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  return (
    <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <span className="sidebar-brand-icon" aria-hidden>AP</span>
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
          {role === 'admin' ? 'Quản trị viên — fanpage & provider được gán' : 'Biên tập — fanpage được gán'}
        </div>
      )}

      <nav className="sidebar-nav">
        {groups.map((group, groupIndex) => {
          const isGroupCollapsed = !collapsed && collapsedGroups.has(group.id);
          return (
            <div key={group.id} className="sidebar-group">
              {!collapsed && (
                <button
                  type="button"
                  className="sidebar-group-label"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={!isGroupCollapsed}
                >
                  <span>{group.label}</span>
                  <ChevronDown
                    size={12}
                    className={`sidebar-group-chevron${isGroupCollapsed ? ' sidebar-group-chevron--collapsed' : ''}`}
                  />
                </button>
              )}
              {collapsed && groupIndex > 0 && <div className="sidebar-group-divider" />}
              {!isGroupCollapsed && (
                <div className="sidebar-group-items">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = navItemIsActive(item, location);
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={`sidebar-link${isActive ? ' active' : ''}`}
                        title={collapsed ? item.label : undefined}
                      >
                        <span className="sidebar-link-icon" aria-hidden>
                          <Icon size={18} strokeWidth={2} />
                        </span>
                        {!collapsed && <span className="sidebar-link-label">{item.label}</span>}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
