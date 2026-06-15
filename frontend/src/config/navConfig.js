import {
  LayoutDashboard,
  FileText,
  Sparkles,
  Layers,
  Flag,
  Wand2,
  Cpu,
  Users,
  History,
  Settings,
} from 'lucide-react';

export const navGroups = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, roles: ['super_admin', 'admin', 'editor'] },
    ],
  },
  {
    id: 'content',
    label: 'Content',
    items: [
      { to: '/posts', label: 'Posts', icon: FileText, roles: ['super_admin', 'admin', 'editor'] },
      { to: '/generate', label: 'Generate', icon: Sparkles, roles: ['super_admin', 'admin', 'editor'] },
      { to: '/batch-generate', label: 'Batch', icon: Layers, roles: ['super_admin', 'admin', 'editor'] },
    ],
  },
  {
    id: 'config',
    label: 'Configuration',
    items: [
      { to: '/pages', label: 'Pages', icon: Flag, roles: ['super_admin', 'admin'] },
      { to: '/skills', label: 'Skills', icon: Wand2, roles: ['super_admin'] },
      { to: '/providers', label: 'Providers', icon: Cpu, roles: ['super_admin', 'admin'] },
    ],
  },
  {
    id: 'admin',
    label: 'Administration',
    items: [
      { to: '/users', label: 'Users', icon: Users, roles: ['super_admin'] },
      { to: '/activity', label: 'Activity', icon: History, roles: ['super_admin'] },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { to: '/settings', label: 'Settings', icon: Settings, roles: ['super_admin', 'admin', 'editor'] },
    ],
  },
];

export function getNavGroupsForRole(role) {
  return navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.roles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);
}

export function getPageTitle(pathname) {
  for (const group of navGroups) {
    for (const item of group.items) {
      const matched = item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
      if (matched) return item.label;
    }
  }
  if (pathname.startsWith('/change-password')) return 'Change password';
  return 'AutoPost';
}

export const mobileBottomRoutes = ['/', '/posts', '/generate'];

export function isSecondaryRoute(pathname) {
  return !mobileBottomRoutes.some((route) =>
    route === '/' ? pathname === '/' : pathname === route || pathname.startsWith(`${route}/`)
  );
}
