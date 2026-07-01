import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { query } from '../db.js';

const jwtSecret = process.env.JWT_SECRET || 'replace_with_strong_secret';
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';

// role='group_user' (self-serve) không được đăng nhập qua đây — họ dùng /api/user-auth/login riêng.
const LOGIN_QUERIES = [
  {
    sql: `SELECT id, name, username, email, password, role, is_active, must_change_password
          FROM users
          WHERE deleted_at IS NULL AND role <> 'group_user'
            AND (LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?))`,
    params: (login) => [login, login],
  },
  {
    sql: `SELECT id, name, email, password, role, is_active, must_change_password
          FROM users
          WHERE deleted_at IS NULL AND role <> 'group_user' AND LOWER(email) = LOWER(?)`,
    params: (login) => [login],
  },
  {
    sql: `SELECT id, name, username, email, password, role, is_active, must_change_password
          FROM users
          WHERE role <> 'group_user' AND (LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?))`,
    params: (login) => [login, login],
  },
  {
    sql: `SELECT id, name, email, password, role, is_active, must_change_password
          FROM users
          WHERE role <> 'group_user' AND LOWER(email) = LOWER(?)`,
    params: (login) => [login],
  },
];

async function findUserByLogin(login) {
  let lastError = null;

  for (const attempt of LOGIN_QUERIES) {
    try {
      const users = await query(attempt.sql, attempt.params(login));
      if (users.length) return users;
    } catch (error) {
      if (error?.code === 'ER_BAD_FIELD_ERROR') {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  if (lastError) throw lastError;
  return [];
}

export async function authenticateUser(identifier, password) {
  const login = String(identifier || '').trim();
  if (!login) return null;

  const users = await findUserByLogin(login);
  const user = users[0];
  if (!user || !user.is_active) {
    return null;
  }
  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    return null;
  }
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    must_change_password: user.must_change_password,
  };
}

export async function verifyPassword(userId, password) {
  const users = await query('SELECT password FROM users WHERE id = ?', [userId]);
  const user = users[0];
  if (!user) {
    return false;
  }
  return bcrypt.compare(password, user.password);
}

export function signToken(user) {
  return jwt.sign({ userId: user.id, role: user.role }, jwtSecret, { expiresIn: jwtExpiresIn });
}

export async function setPassword(userId, password, mustChangePassword = false) {
  const hashed = await bcrypt.hash(password, 10);
  await query('UPDATE users SET password = ?, must_change_password = ? WHERE id = ?', [hashed, mustChangePassword, userId]);
}
