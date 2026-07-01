import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import Button from '../components/ui/Button';

export default function UserRegister() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const form = new FormData(e.target);
    const password = form.get('password');
    const confirm = form.get('confirm');
    if (password !== confirm) return setError('Mật khẩu xác nhận không khớp');
    setSubmitting(true);
    try {
      const res = await api.post('/user-auth/register', {
        email: form.get('email'),
        password,
        name: form.get('name'),
      });
      localStorage.setItem('user_token', res.data.token);
      localStorage.setItem('user_info', JSON.stringify(res.data.user));
      navigate('/user/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Đăng ký thất bại');
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
          <p>Tạo tài khoản để nhận License Key</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          {error && <div className="form-error">{error}</div>}
          <label>
            Họ tên
            <input name="name" type="text" placeholder="Nguyễn Văn A" />
          </label>
          <label>
            Email
            <input name="email" type="email" required placeholder="email@example.com" />
          </label>
          <label>
            Mật khẩu
            <input name="password" type="password" required minLength={6} placeholder="Tối thiểu 6 ký tự" />
          </label>
          <label>
            Xác nhận mật khẩu
            <input name="confirm" type="password" required placeholder="Nhập lại mật khẩu" />
          </label>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Đang đăng ký...' : 'Đăng ký'}
          </Button>
        </form>
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14 }}>
          Đã có tài khoản? <Link to="/user/login">Đăng nhập</Link>
        </p>
      </div>
    </div>
  );
}
