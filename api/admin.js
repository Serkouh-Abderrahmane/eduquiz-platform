const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');

// GET /users
router.get('/users', authenticate, requireRole('admin'), (req, res) => {
  const db = req.app.get('db');
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  let where = [];
  let params = [];
  if (req.query.search) {
    where.push('(u.username LIKE ? OR u.email LIKE ? OR u.display_name LIKE ?)');
    params.push(`%${req.query.search}%`, `%${req.query.search}%`, `%${req.query.search}%`);
  }
  if (req.query.role) { where.push('u.role = ?'); params.push(req.query.role); }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM users u ${whereClause}`).get(...params);

  const users = db.prepare(`
    SELECT u.id, u.username, u.email, u.role, u.display_name, u.avatar, u.created_at, u.last_login,
      us.xp, us.coins, us.level, us.total_activities_completed, us.total_perfect_scores
    FROM users u
    LEFT JOIN user_stats us ON u.id = us.user_id
    ${whereClause}
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({ users, total: countRow.total, page, limit, totalPages: Math.ceil(countRow.total / limit) });
});

// PUT /users/:id/role
router.put('/users/:id/role', authenticate, requireRole('admin'), (req, res) => {
  const db = req.app.get('db');
  const { role } = req.body;
  const validRoles = ['student', 'teacher', 'admin'];

  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  const updated = db.prepare('SELECT id, username, email, role, display_name, avatar, created_at, last_login FROM users WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// GET /stats
router.get('/stats', authenticate, requireRole('admin'), (req, res) => {
  const db = req.app.get('db');

  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
  const usersByRole = db.prepare('SELECT role, COUNT(*) as count FROM users GROUP BY role').all();
  const totalActivities = db.prepare('SELECT COUNT(*) as count FROM activities').get();
  const activitiesByStatus = db.prepare('SELECT status, COUNT(*) as count FROM activities GROUP BY status').all();
  const totalAttempts = db.prepare('SELECT COUNT(*) as count FROM attempts').get();
  const totalQuestions = db.prepare('SELECT COUNT(*) as count FROM questions').get();
  const totalBadges = db.prepare('SELECT COUNT(*) as count FROM badges').get();
  const avgScore = db.prepare('SELECT AVG(score) as avg FROM attempts WHERE status = \'completed\'').get();

  const recentUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE created_at >= datetime(\'now\', \'-7 days\')').get();
  const recentAttempts = db.prepare('SELECT COUNT(*) as count FROM attempts WHERE started_at >= datetime(\'now\', \'-7 days\')').get();

  res.json({
    total_users: totalUsers.count,
    users_by_role: usersByRole,
    total_activities: totalActivities.count,
    activities_by_status: activitiesByStatus,
    total_attempts: totalAttempts.count,
    total_questions: totalQuestions.count,
    total_badges: totalBadges.count,
    avg_score: Math.round((avgScore.avg || 0) * 100) / 100,
    recent_users_7d: recentUsers.count,
    recent_attempts_7d: recentAttempts.count
  });
});

// GET /categories
router.get('/categories', authenticate, requireRole('admin'), (req, res) => {
  const db = req.app.get('db');
  const categories = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM activities WHERE category_id = c.id) as activity_count
    FROM categories c
    ORDER BY c.name
  `).all();
  res.json(categories);
});

// POST /categories
router.post('/categories', authenticate, requireRole('admin'), (req, res) => {
  const db = req.app.get('db');
  const { name, description, icon, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required' });

  try {
    const result = db.prepare(
      'INSERT INTO categories (name, description, icon, color, created_at, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))'
    ).run(name, description || null, icon || null, color || null);

    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create category', details: err.message });
  }
});

// PUT /categories/:id
router.put('/categories/:id', authenticate, requireRole('admin'), (req, res) => {
  const db = req.app.get('db');
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!category) return res.status(404).json({ error: 'Category not found' });

  const { name, description, icon, color } = req.body;
  const updates = [];
  const params = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  if (icon !== undefined) { updates.push('icon = ?'); params.push(icon); }
  if (color !== undefined) { updates.push('color = ?'); params.push(color); }

  if (updates.length > 0) {
    updates.push('updated_at = datetime(\'now\')');
    params.push(req.params.id);
    db.prepare(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  const updated = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE /categories/:id
router.delete('/categories/:id', authenticate, requireRole('admin'), (req, res) => {
  const db = req.app.get('db');
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!category) return res.status(404).json({ error: 'Category not found' });

  db.prepare('UPDATE activities SET category_id = NULL WHERE category_id = ?').run(req.params.id);
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ message: 'Category deleted' });
});

// GET /tags
router.get('/tags', authenticate, requireRole('admin'), (req, res) => {
  const db = req.app.get('db');
  const tags = db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM activity_tags WHERE tag_id = t.id) as activity_count
    FROM tags t
    ORDER BY t.name
  `).all();
  res.json(tags);
});

// POST /tags
router.post('/tags', authenticate, requireRole('admin'), (req, res) => {
  const db = req.app.get('db');
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Tag name is required' });

  const existing = db.prepare('SELECT id FROM tags WHERE name = ?').get(name);
  if (existing) return res.status(409).json({ error: 'Tag already exists' });

  try {
    const result = db.prepare('INSERT INTO tags (name, created_at) VALUES (?, datetime(\'now\'))').run(name);
    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(tag);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create tag', details: err.message });
  }
});

// DELETE /tags/:id
router.delete('/tags/:id', authenticate, requireRole('admin'), (req, res) => {
  const db = req.app.get('db');
  const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id);
  if (!tag) return res.status(404).json({ error: 'Tag not found' });

  db.prepare('DELETE FROM activity_tags WHERE tag_id = ?').run(req.params.id);
  db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
  res.json({ message: 'Tag deleted' });
});

// GET /badges
router.get('/badges', authenticate, requireRole('admin'), (req, res) => {
  const db = req.app.get('db');
  const badges = db.prepare('SELECT * FROM badges ORDER BY name').all();
  res.json(badges);
});

// POST /badges
router.post('/badges', authenticate, requireRole('admin'), (req, res) => {
  const db = req.app.get('db');
  const { name, description, icon, category, criteria, xp_reward } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  try {
    const result = db.prepare(
      'INSERT INTO badges (name, description, icon, category, criteria, xp_reward, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))'
    ).run(name, description || null, icon || null, category || null, typeof criteria === 'string' ? criteria : JSON.stringify(criteria || {}), xp_reward || 0);

    const badge = db.prepare('SELECT * FROM badges WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(badge);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create badge', details: err.message });
  }
});

// GET /assignments
router.get('/assignments', authenticate, requireRole('admin', 'teacher'), (req, res) => {
  const db = req.app.get('db');

  let query, params;
  if (req.user.role === 'admin') {
    query = `
      SELECT a.*, u.username as creator_name,
        (SELECT COUNT(*) FROM attempts WHERE activity_id = a.id AND status = 'completed') as completion_count,
        (SELECT COUNT(DISTINCT user_id) FROM attempts WHERE activity_id = a.id AND status = 'completed') as unique_students
      FROM activities a
      LEFT JOIN users u ON a.created_by = u.id
      ORDER BY a.created_at DESC
    `;
    params = [];
  } else {
    query = `
      SELECT a.*, u.username as creator_name,
        (SELECT COUNT(*) FROM attempts WHERE activity_id = a.id AND status = 'completed') as completion_count,
        (SELECT COUNT(DISTINCT user_id) FROM attempts WHERE activity_id = a.id AND status = 'completed') as unique_students
      FROM activities a
      LEFT JOIN users u ON a.created_by = u.id
      WHERE a.created_by = ?
      ORDER BY a.created_at DESC
    `;
    params = [req.user.id];
  }

  const assignments = db.prepare(query).all(...params);
  res.json(assignments);
});

module.exports = router;
