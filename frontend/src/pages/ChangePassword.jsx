import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../services/authContext';
import { useToast } from '../context/ToastContext';

export default function ChangePassword() {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const { refreshUser, user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      await api.post('/auth/change-password', {
        old_password: oldPassword,
        new_password: newPassword,
      });
      await refreshUser();
      showToast('Password changed successfully', 'success');
      setOldPassword('');
      setNewPassword('');
      navigate('/');
    } catch (err) {
      showToast(err.response?.data?.error || 'Unable to change password', 'error');
    }
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>Change Password</h1>
          <p>{user?.must_change_password ? 'You must change your password before continuing.' : 'Update credentials for your account.'}</p>
        </div>
      </div>
      <div className="card form-card">
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Current password
            <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required />
          </label>
          <label>
            New password
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
          </label>
          <button type="submit" className="btn btn-primary">Save password</button>
        </form>
      </div>
    </div>
  );
}
