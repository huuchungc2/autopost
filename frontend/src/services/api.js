import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = window.localStorage.getItem('autopost_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (config.data instanceof FormData && config.headers) {
    delete config.headers['Content-Type'];
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = String(error.config?.url || '');
    const isAuthRoute = url.includes('/auth/login') || url.includes('/auth/me');
    if (status === 401 && !isAuthRoute) {
      const msg = String(error.response?.data?.error || '');
      const isGenerateImage = url.includes('/generate-image');
      if (isGenerateImage && msg !== 'Unauthorized') {
        return Promise.reject(error);
      }
      window.localStorage.removeItem('autopost_token');
      window.localStorage.removeItem('autopost_user');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
