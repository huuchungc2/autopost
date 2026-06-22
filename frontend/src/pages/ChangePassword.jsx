import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../services/authContext';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';

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
      showToast('Đã đổi mật khẩu', 'success');
      setOldPassword('');
      setNewPassword('');
      navigate('/');
    } catch (err) {
      showToast(err.response?.data?.error || 'Không đổi được mật khẩu', 'error');
    }
  };

  return (
    <div className="page-shell">
      <PageHeader
        title="Đổi mật khẩu"
        description={user?.must_change_password ? 'Bạn cần đổi mật khẩu trước khi tiếp tục.' : 'Cập nhật mật khẩu tài khoản của bạn.'}
      />
      <div className="card form-card">
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Mật khẩu hiện tại
            <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required />
          </label>
          <label>
            Mật khẩu mới
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
          </label>
          <Button type="submit">Lưu mật khẩu</Button>
        </form>
      </div>
    </div>
  );
}
