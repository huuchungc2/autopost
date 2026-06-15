import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { query } from '../db.js';

const jwtSecret = process.env.JWT_SECRET || 'replace_with_strong_secret';
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';

export async function authenticateUser(email, password) {
  const users = await query('SELECT id, name, email, password, role, is_active, must_change_password FROM users WHERE email = ?', [email]);
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
