import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';
import api from './api';

const AuthContext = createContext(null);
const tokenKey = 'autopost_token';
const userKey = 'autopost_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!window.localStorage.getItem(tokenKey));

  const logout = () => {
    window.localStorage.removeItem(tokenKey);
    window.localStorage.removeItem(userKey);
    setUser(null);
  };

  useEffect(() => {
    const token = window.localStorage.getItem(tokenKey);
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((response) => {
        if (response.data) {
          setUser(response.data);
          window.localStorage.setItem(userKey, JSON.stringify(response.data));
        }
      })
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, []);

  const login = (token, userData) => {
    window.localStorage.setItem(tokenKey, token);
    window.localStorage.setItem(userKey, JSON.stringify(userData));
    setUser(userData);
  };

  const refreshUser = async () => {
    const response = await api.get('/auth/me');
    setUser(response.data);
    window.localStorage.setItem(userKey, JSON.stringify(response.data));
    return response.data;
  };

  const value = useMemo(() => ({ user, login, logout, refreshUser, loading }), [user, loading]);

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
