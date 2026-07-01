export function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Forbidden: super admin only' });
  }
  next();
}

export function canManageUsers(req, res, next) {
  if (!['super_admin', 'admin'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

export function isSuperAdminUser(user) {
  return user?.role === 'super_admin';
}

/** Admin + super_admin — AI provider config (assigned/owned only for admin); group_user manages only their own */
export function canManageProviders(req, res, next) {
  if (!['super_admin', 'admin', 'group_user'].includes(req.user?.role)) {
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

/** Admin + super_admin — skill (system prompt) management; group_user manages only their own */
export function canManageSkills(req, res, next) {
  if (!['super_admin', 'admin', 'group_user'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

/** Admin + super_admin — website (blog publish target) management */
export function canManageWebsites(req, res, next) {
  if (!['super_admin', 'admin'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}
