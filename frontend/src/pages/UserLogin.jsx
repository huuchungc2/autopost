import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import Button from '../components/ui/Button';

export default function UserLogin() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const form = new FormData(e.target);
    try {
      const res = await api.post('/user-auth/login', {
        email: form.get('email'),
        password: form.get('password'),
      });
      localStorage.setItem('user_token', res.data.token);
      localStorage.setItem('user_info', JSON.stringify(res.data.user));
      navigate('/user/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Đăng nhập thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo" aria-hidden>GF</div>
          <h1>GroupFlow</h1>
          <p>Đăng nhập để xem License Key của bạn</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          {error && <div className="form-error">{error}</div>}
          <label>
            Email
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label>
            Mật khẩu
            <input name="password" type="password" required autoComplete="current-password" />
          </label>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </Button>
        </form>
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14 }}>
          Chưa có tài khoản? <Link to="/user/register">Đăng ký miễn phí</Link>
        </p>
      </div>
    </div>
  );
}
