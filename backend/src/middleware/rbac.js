export function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Forbidden: super admin only' });
  }
  next();
}

export function canManageUsers(req, res, next) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

/** Admin + super_admin — AI provider config (assigned/owned only for admin) */
export function canManageProviders(req, res, next) {
  if (!['super_admin', 'admin'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

/** Admin + super_admin — page config (assigned pages only for admin) */
export function canManagePages(req, res, next) {
  if (!['super_admin', 'admin'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}
