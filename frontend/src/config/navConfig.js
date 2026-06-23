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
  UsersRound,
} from 'lucide-react';

export const navGroups = [
  {
    id: 'overview',
    label: 'Tổng quan',
    items: [
      { to: '/', label: 'Bảng tin', icon: LayoutDashboard, end: true, roles: ['super_admin', 'admin', 'editor'] },
    ],
  },
  {
    id: 'content',
    label: 'Nội dung',
    items: [
      { to: '/posts', label: 'Bài viết', icon: FileText, roles: ['super_admin', 'admin', 'editor'] },
      { to: '/groups', label: 'Group', icon: UsersRound, roles: ['super_admin', 'admin', 'editor'] },
      { to: '/generate', label: 'Tạo bài', icon: Sparkles, roles: ['super_admin', 'admin', 'editor'] },
      { to: '/batch-generate', label: 'Hàng loạt', icon: Layers, roles: ['super_admin', 'admin', 'editor'] },
    ],
  },
  {
    id: 'config',
    label: 'Cấu hình',
    items: [
      { to: '/pages', label: 'Fanpage', icon: Flag, roles: ['super_admin', 'admin'] },
      { to: '/skills', label: 'Skill AI', icon: Wand2, roles: ['super_admin', 'admin'] },
      { to: '/providers', label: 'AI Provider', icon: Cpu, roles: ['super_admin', 'admin'] },
    ],
  },
  {
    id: 'admin',
    label: 'Quản trị',
    items: [
      { to: '/users', label: 'Người dùng', icon: Users, roles: ['super_admin', 'admin'] },
      { to: '/activity', label: 'Nhật ký', icon: History, roles: ['super_admin'] },
    ],
  },
  {
    id: 'system',
    label: 'Hệ thống',
    items: [
      { to: '/settings', label: 'Cài đặt', icon: Settings, roles: ['super_admin', 'admin', 'editor'] },
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
  if (pathname === '/posts/new') return 'Viết bài tay';
  if (pathname === '/posts/import') return 'Import Excel';
  if (pathname === '/groups/import') return 'Import Group';
  if (pathname === '/groups/drafts') return 'Group Drafts';
  if (pathname.startsWith('/groups')) return 'Group';
  if (/^\/posts\/\d+\/edit$/.test(pathname)) return 'Sửa bài viết';
  for (const group of navGroups) {
    for (const item of group.items) {
      const matched = item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
      if (matched) return item.label;
    }
  }
  if (pathname.startsWith('/change-password')) return 'Đổi mật khẩu';
  return 'AutoPost';
}

export const mobileBottomRoutes = ['/', '/posts', '/groups', '/generate'];

export function isSecondaryRoute(pathname) {
  return !mobileBottomRoutes.some((route) =>
    route === '/' ? pathname === '/' : pathname === route || pathname.startsWith(`${route}/`)
  );
}
