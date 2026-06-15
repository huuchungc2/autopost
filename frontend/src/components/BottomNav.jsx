import { NavLink } from 'react-router-dom';

const allItems = [
  { to: '/', label: 'Home', icon: '🏠', roles: ['super_admin', 'admin', 'editor'] },
  { to: '/posts', label: 'Posts', icon: '📝', roles: ['super_admin', 'admin', 'editor'] },
  { to: '/generate', label: 'Generate', icon: '✨', roles: ['super_admin', 'admin', 'editor'] },
  { to: '/pages', label: 'Pages', icon: '📄', roles: ['super_admin', 'admin'] },
  { to: '/settings', label: 'More', icon: '⚙️', roles: ['super_admin', 'admin', 'editor'] },
];

export default function BottomNav({ role = 'editor' }) {
  const items = allItems.filter((item) => item.roles.includes(role));

  return (
    <nav className="bottom-nav">
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => (isActive ? 'bottom-nav-link active' : 'bottom-nav-link')}>
          <span>{item.icon}</span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
