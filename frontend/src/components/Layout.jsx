import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../services/authContext';
import useIsMobile from '../hooks/useIsMobile';
import Header from './Header';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import MobileDrawer from './MobileDrawer';

const STORAGE_KEY = 'autopost-sidebar-collapsed';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const role = user?.role || 'editor';
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobile) setMobileMenuOpen(false);
  }, [isMobile]);

  useEffect(() => {
    document.body.classList.toggle('mobile-menu-open', isMobile && mobileMenuOpen);
    return () => document.body.classList.remove('mobile-menu-open');
  }, [isMobile, mobileMenuOpen]);

  return (
    <div className={`app-layout${collapsed && !isMobile ? ' app-layout--sidebar-collapsed' : ''}${isMobile ? ' app-layout--mobile' : ''}`}>
      {!isMobile && (
        <Sidebar
          role={role}
          collapsed={collapsed}
          onToggle={() => setCollapsed((value) => !value)}
        />
      )}
      <div className="main-shell">
        <Header
          isMobile={isMobile}
          pathname={location.pathname}
          sidebarCollapsed={collapsed}
          onSidebarToggle={() => setCollapsed((value) => !value)}
          onMobileMenuOpen={() => setMobileMenuOpen(true)}
        />
        <main className="content">
          <Outlet />
        </main>
        {isMobile && (
          <>
            <BottomNav
              role={role}
              pathname={location.pathname}
              menuOpen={mobileMenuOpen}
              onMenuOpen={() => setMobileMenuOpen(true)}
            />
            <MobileDrawer
              open={mobileMenuOpen}
              role={role}
              user={user}
              onClose={() => setMobileMenuOpen(false)}
              onLogout={logout}
              onChangePassword={() => {
                setMobileMenuOpen(false);
                navigate('/change-password');
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
