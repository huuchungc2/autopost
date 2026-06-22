import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../services/authContext';
import api from '../services/api';
import Button from '../components/ui/Button';

function loginErrorMessage(err) {
  if (err.response?.data?.error) return err.response.data.error;
  if (err.code === 'ERR_NETWORK' || !err.response) {
    return 'Không kết nối được server — backend chưa chạy, Nginx sai port, hoặc frontend build thiếu VITE_API_BASE_URL (xem DEPLOY.md §12).';
  }
  if (err.response?.status >= 500) {
    return `Lỗi server (${err.response.status}) — pm2 logs autopost-backend (hoặc autopost-api)`;
  }
  return 'Đăng nhập thất bại';
}

export default function Login() {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading || submitting) return;
    if (user) {
      navigate(user.must_change_password ? '/change-password' : from, { replace: true });
    }
  }, [user, loading, submitting, navigate, from]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    const form = new FormData(event.target);
    try {
      const response = await api.post('/auth/login', {
        login: form.get('login'),
        password: form.get('password'),
      });
      login(response.data.token, response.data.user);
      navigate(response.data.user.must_change_password ? '/change-password' : from, { replace: true });
    } catch (err) {
      setError(loginErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo" aria-hidden>AP</div>
          <h1>AutoPost</h1>
          <p>Đăng nhập để quản lý bài viết và lịch đăng</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && <div className="form-error">{error}</div>}
          <label>
            Email hoặc username
            <input name="login" type="text" autoComplete="username" required placeholder="admin hoặc admin@autopost.local" />
          </label>
          <label>
            Mật khẩu
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <Button type="submit" disabled={submitting || loading} className="w-full">
            {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </Button>
        </form>
      </div>
    </div>
  );
}
