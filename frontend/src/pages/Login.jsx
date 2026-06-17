import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../services/authContext';
import api from '../services/api';

function loginErrorMessage(err) {
  if (err.response?.data?.error) return err.response.data.error;
  if (err.code === 'ERR_NETWORK' || !err.response) {
    return 'Không kết nối được server — kiểm tra backend (pm2 logs autopost-api) và VITE_API_BASE_URL lúc build frontend.';
  }
  if (err.response?.status >= 500) {
    return `Lỗi server (${err.response.status}) — chạy: pm2 logs autopost-api`;
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
      <form className="login-form" onSubmit={handleSubmit}>
        <h1>AutoPost</h1>
        <p>Đăng nhập để tiếp tục.</p>
        {error && <div className="form-error">{error}</div>}
        <label>
          Email hoặc username
          <input name="login" type="text" autoComplete="username" required placeholder="admin hoặc admin@autopost.local" />
        </label>
        <label>
          Mật khẩu
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button type="submit" className="btn-primary" disabled={submitting || loading}>
          {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  );
}
