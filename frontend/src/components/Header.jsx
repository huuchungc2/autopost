import { useNavigate } from 'react-router-dom';
import { useAuth } from '../services/authContext';
import NotificationDropdown from './NotificationDropdown';

export default function Header() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="app-header">
      <div className="header-left">
        <span className="header-title">AutoPost</span>
      </div>
      <div className="header-right">
        <NotificationDropdown />
        <button type="button" className="header-icon-btn" onClick={() => navigate('/change-password')}>
          {user?.name || 'Profile'}
        </button>
        <button type="button" className="header-icon-btn" onClick={logout}>Logout</button>
      </div>
    </header>
  );
}
