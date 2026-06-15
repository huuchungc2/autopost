import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../services/authContext';
import Header from './Header';
import BottomNav from './BottomNav';

const allNavItems = [
  { to: '/', label: 'Dashboard', roles: ['super_admin', 'admin', 'editor'] },
  { to: '/posts', label: 'Posts', roles: ['super_admin', 'admin', 'editor'] },
  { to: '/generate', label: 'Generate', roles: ['super_admin', 'admin', 'editor'] },
  { to: '/batch-generate', label: 'Batch', roles: ['super_admin', 'admin', 'editor'] },
  { to: '/pages', label: 'Pages', roles: ['super_admin', 'admin'] },
  { to: '/skills', label: 'Skills', roles: ['super_admin'] },
  { to: '/providers', label: 'Providers', roles: ['super_admin', 'admin'] },
  { to: '/users', label: 'Users', roles: ['super_admin'] },
  { to: '/activity', label: 'Activity', roles: ['super_admin'] },
  { to: '/settings', label: 'Settings', roles: ['super_admin', 'admin', 'editor'] },
];

export default function Layout() {
  const { user } = useAuth();
  const role = user?.role || 'editor';
  const navItems = allNavItems.filter((item) => item.roles.includes(role));

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">AutoPost</div>
        {role !== 'super_admin' && (
          <div className="sidebar-role-hint">
            {role === 'admin' ? 'Admin — page & provider được gán' : 'Editor — page được gán'}
          </div>
        )}
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main-shell">
        <Header />
        <main className="content">
          <Outlet />
        </main>
        <BottomNav role={role} />
      </div>
    </div>
  );
}
