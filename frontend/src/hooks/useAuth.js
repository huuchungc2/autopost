import { useState, useEffect } from 'react';

const tokenKey = 'autopost_token';
const userKey = 'autopost_user';

export function useAuth() {
  const [user, setUser] = useState(() => {
    const stored = window.localStorage.getItem(userKey);
    return stored ? JSON.parse(stored) : null;
  });

  useEffect(() => {
    if (!user) {
      const token = window.localStorage.getItem(tokenKey);
      if (!token) {
        return;
      }
    }
  }, [user]);

  function login(token, userData) {
    window.localStorage.setItem(tokenKey, token);
    window.localStorage.setItem(userKey, JSON.stringify(userData));
    setUser(userData);
  }

  function logout() {
    window.localStorage.removeItem(tokenKey);
    window.localStorage.removeItem(userKey);
    setUser(null);
  }

  return { user, login, logout };
}
