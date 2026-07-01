import {
  LayoutDashboard,
  FileText,
  Sparkles,
  Layers,
  Flag,
  Globe,
  Newspaper,
  Upload,
  Wand2,
  Cpu,
  Users,
  History,
  Settings,
  UsersRound,
  FolderOpen,
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
    id: 'fanpage',
    label: 'Fanpage',
    items: [
      { to: '/posts', label: 'Bài viết', icon: FileText, roles: ['super_admin', 'admin', 'editor'] },
      { to: '/generate', label: 'Tạo bài', icon: Sparkles, end: true, roles: ['super_admin', 'admin', 'editor'] },
      { to: '/batch-generate', label: 'Hàng loạt', icon: Layers, roles: ['super_admin', 'admin', 'editor'] },
      { to: '/pages', label: 'Cấu hình Fanpage', icon: Flag, roles: ['super_admin', 'admin'] },
    ],
  },
  {
    id: 'website',
    label: 'Website Blog',
    items: [
      { to: '/website-posts', label: 'Bài Blog', icon: Newspaper, roles: ['super_admin', 'admin', 'editor'] },
      { to: '/generate?tab=website', label: 'Tạo bài Blog', icon: Sparkles, roles: ['super_admin', 'admin', 'editor'] },
      { to: '/posts/import-website-blog', label: 'Import Excel', icon: Upload, roles: ['super_admin', 'admin', 'editor'] },
      { to: '/websites', label: 'Cấu hình Website', icon: Globe, roles: ['super_admin', 'admin'] },
    ],
  },
  {
    id: 'group',
    label: 'Group (Extension)',
    items: [
      { to: '/groups', label: 'Bài đã đăng', icon: UsersRound, roles: ['super_admin', 'admin', 'editor'] },
      { to: '/groups/import', label: 'Import Excel', icon: Upload, roles: ['super_admin', 'admin', 'editor'] },
      { to: '/groups/drafts', label: 'Drafts', icon: FolderOpen, roles: ['super_admin', 'admin', 'editor'] },
    ],
  },
  {
    id: 'system',
    label: 'Hệ thống',
    items: [
      { to: '/skills', label: 'Skill AI', icon: Wand2, roles: ['super_admin', 'admin'] },
      { to: '/providers', label: 'AI Provider', icon: Cpu, roles: ['super_admin', 'admin'] },
      { to: '/users', label: 'Người dùng', icon: Users, roles: ['super_admin', 'admin'] },
      { to: '/activity', label: 'Nhật ký', icon: History, roles: ['super_admin'] },
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
  if (pathname === '/posts/import-website-blog') return 'Import Excel — Website Blog';
  if (pathname === '/groups/import') return 'Import Group';
  if (pathname === '/groups/drafts') return 'Group Drafts';
  if (pathname.startsWith('/groups')) return 'Group';
  if (/^\/posts\/\d+\/edit$/.test(pathname)) return 'Sửa bài viết';
  if (/^\/website-posts\/\d+\/edit$/.test(pathname)) return 'Sửa bài Website Blog';
  for (const group of navGroups) {
    for (const item of group.items) {
      const to = item.to.split('?')[0];
      const matched = item.end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
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
