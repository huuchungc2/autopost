import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../services/authContext';
import api from '../services/api';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  useEffect(() => {
    if (user) {
      navigate(user.must_change_password ? '/change-password' : from, { replace: true });
    }
  }, [user, navigate, from]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    try {
      const response = await api.post('/auth/login', {
        email: form.get('email'),
        password: form.get('password'),
      });
      login(response.data.token, response.data.user);
      navigate(response.data.user.must_change_password ? '/change-password' : from, { replace: true });
    } catch (err) {
      event.target.querySelector('.form-error')?.remove();
      const el = document.createElement('div');
      el.className = 'form-error';
      el.textContent = err.response?.data?.error || 'Login failed';
      event.target.appendChild(el);
    }
  };

  return (
    <div className="login-page">
      <form className="login-form" onSubmit={handleSubmit}>
        <h1>AutoPost</h1>
        <p>Đăng nhập để tiếp tục.</p>
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <label>
          Mật khẩu
          <input name="password" type="password" required />
        </label>
        <button type="submit" className="btn-primary">Đăng nhập</button>
      </form>
    </div>
  );
}
