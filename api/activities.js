const router = require('express').Router();
const { authenticate, optionalAuth, requireRole } = require('../middleware/auth');
const { validateActivity } = require('../middleware/validation');

// GET /
router.get('/', optionalAuth, (req, res) => {
  const db = req.app.get('db');
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  let where = [];
  let params = [];

  if (req.query.category_id) { where.push('a.category_id = ?'); params.push(req.query.category_id); }
  if (req.query.difficulty) { where.push('a.difficulty = ?'); params.push(req.query.difficulty); }
  if (req.query.game_id) { where.push('a.game_id = ?'); params.push(req.query.game_id); }
  if (req.query.search) { where.push('a.title LIKE ?'); params.push(`%${req.query.search}%`); }
  if (req.query.created_by) { where.push('a.created_by = ?'); params.push(req.query.created_by); }
  if (req.query.tag_id) {
    where.push('a.id IN (SELECT activity_id FROM activity_tags WHERE tag_id = ?)');
    params.push(req.query.tag_id);
  }

  const isAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'teacher');
  const status = req.query.status || (isAdmin ? undefined : 'published');
  if (status) { where.push('a.status = ?'); params.push(status); }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM activities a ${whereClause}`).get(...params);

  const activities = db.prepare(`
    SELECT a.*, c.name as category_name, c.icon as category_icon,
    (SELECT COUNT(*) FROM questions WHERE activity_id = a.id) as question_count,
    (SELECT COUNT(*) FROM attempts WHERE activity_id = a.id AND status = 'completed') as attempts_count
    FROM activities a
    LEFT JOIN categories c ON a.category_id = c.id
    ${whereClause}
    ORDER BY a.updated_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const tagRows = db.prepare(`
    SELECT at.activity_id, t.id as tag_id, t.name as tag_name
    FROM activity_tags at
    JOIN tags t ON at.tag_id = t.id
    WHERE at.activity_id IN (${activities.map(() => '?').join(',')})
  `).all(...activities.map(a => a.id));

  const tagsByActivity = {};
  tagRows.forEach(row => {
    if (!tagsByActivity[row.activity_id]) tagsByActivity[row.activity_id] = [];
    tagsByActivity[row.activity_id].push({ id: row.tag_id, name: row.tag_name });
  });

  activities.forEach(a => { a.tags = tagsByActivity[a.id] || []; });

  res.json({ activities, total: countRow.total, page, limit, totalPages: Math.ceil(countRow.total / limit) });
});

// GET /:id
router.get('/:id', optionalAuth, (req, res) => {
  const db = req.app.get('db');
  const activity = db.prepare(`
    SELECT a.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
    u.username as creator_name, g.name as game_name, g.icon as game_icon,
    (SELECT COUNT(*) FROM questions WHERE activity_id = a.id) as question_count,
    (SELECT COUNT(*) FROM attempts WHERE activity_id = a.id AND status = 'completed') as attempts_count,
    (SELECT AVG(score) FROM attempts WHERE activity_id = a.id AND status = 'completed') as avg_score
    FROM activities a
    LEFT JOIN categories c ON a.category_id = c.id
    LEFT JOIN users u ON a.created_by = u.id
    LEFT JOIN games g ON a.game_id = g.id
    WHERE a.id = ?
  `).get(req.params.id);

  if (!activity) return res.status(404).json({ error: 'Activity not found' });

  const tags = db.prepare(`
    SELECT t.id, t.name FROM tags t
    JOIN activity_tags at ON t.id = at.tag_id
    WHERE at.activity_id = ?
  `).all(req.params.id);

  activity.tags = tags;
  res.json(activity);
});

// POST /
router.post('/', authenticate, requireRole('teacher', 'admin'), (req, res) => {
  const db = req.app.get('db');
  const errors = validateActivity(req.body);
  if (errors.length > 0) return res.status(400).json({ errors });

  const { title, description, category_id, game_id, difficulty, settings, tag_ids, time_limit, scoring_config } = req.body;

  const defaultSettings = JSON.stringify({ time_limit: time_limit || 30, scoring: scoring_config || { base_points: 10, time_bonus: true, wrong_answer_penalty: 0 }, lives_enabled: false, lives_count: 3, randomize_questions: false, pool_size: 0, show_explanation: true });

  try {
    const result = db.prepare(
      'INSERT INTO activities (title, description, category_id, game_id, difficulty, created_by, status, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, \'draft\', ?, datetime(\'now\'), datetime(\'now\'))'
    ).run(title, description || null, category_id || null, game_id, difficulty || 'medium', req.user.id, settings || defaultSettings);

    const activityId = result.lastInsertRowid;

    if (Array.isArray(tag_ids)) {
      const stmt = db.prepare('INSERT INTO activity_tags (activity_id, tag_id) VALUES (?, ?)');
      tag_ids.forEach(tagId => stmt.run(activityId, tagId));
    }

    const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(activityId);
    res.status(201).json(activity);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create activity', details: err.message });
  }
});

// PUT /:id
router.put('/:id', authenticate, (req, res) => {
  const db = req.app.get('db');
  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id);
  if (!activity) return res.status(404).json({ error: 'Activity not found' });
  if (activity.created_by !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const { title, description, category_id, game_id, difficulty, settings, tag_ids, status } = req.body;

  const updates = [];
  const params = [];
  if (title !== undefined) { updates.push('title = ?'); params.push(title); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  if (category_id !== undefined) { updates.push('category_id = ?'); params.push(category_id); }
  if (game_id !== undefined) { updates.push('game_id = ?'); params.push(game_id); }
  if (difficulty !== undefined) { updates.push('difficulty = ?'); params.push(difficulty); }
  if (settings !== undefined) { updates.push('settings = ?'); params.push(typeof settings === 'string' ? settings : JSON.stringify(settings)); }
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }

  if (updates.length > 0) {
    updates.push('updated_at = datetime(\'now\')');
    params.push(req.params.id);
    db.prepare(`UPDATE activities SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  if (Array.isArray(tag_ids)) {
    db.prepare('DELETE FROM activity_tags WHERE activity_id = ?').run(req.params.id);
    const stmt = db.prepare('INSERT INTO activity_tags (activity_id, tag_id) VALUES (?, ?)');
    tag_ids.forEach(tagId => stmt.run(req.params.id, tagId));
  }

  const updated = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE /:id
router.delete('/:id', authenticate, (req, res) => {
  const db = req.app.get('db');
  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id);
  if (!activity) return res.status(404).json({ error: 'Activity not found' });
  if (activity.created_by !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  db.prepare('UPDATE activities SET status = \'archived\', updated_at = datetime(\'now\') WHERE id = ?').run(req.params.id);
  res.json({ message: 'Activity archived' });
});

// POST /:id/duplicate
router.post('/:id/duplicate', authenticate, (req, res) => {
  const db = req.app.get('db');
  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id);
  if (!activity) return res.status(404).json({ error: 'Activity not found' });

  try {
    const result = db.prepare(
      'INSERT INTO activities (title, description, category_id, game_id, difficulty, created_by, status, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, \'draft\', ?, datetime(\'now\'), datetime(\'now\'))'
    ).run(`Copy of ${activity.title}`, activity.description, activity.category_id, activity.game_id, activity.difficulty, req.user.id, activity.settings);

    const newId = result.lastInsertRowid;

    const originalTags = db.prepare('SELECT tag_id FROM activity_tags WHERE activity_id = ?').all(activity.id);
    const tagStmt = db.prepare('INSERT INTO activity_tags (activity_id, tag_id) VALUES (?, ?)');
    originalTags.forEach(t => tagStmt.run(newId, t.tag_id));

    const questions = db.prepare('SELECT * FROM questions WHERE activity_id = ? ORDER BY sort_order').all(activity.id);
    questions.forEach(q => {
      const qResult = db.prepare(
        'INSERT INTO questions (activity_id, type, question_text, explanation, image_id, audio_id, reading_passage, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))'
      ).run(newId, q.type, q.question_text, q.explanation, q.image_id, q.audio_id, q.reading_passage, q.sort_order);

      const choices = db.prepare('SELECT * FROM choices WHERE question_id = ?').all(q.id);
      choices.forEach(c => {
        db.prepare(
          'INSERT INTO choices (question_id, text, is_correct, image_id, audio_id, explanation, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(qResult.lastInsertRowid, c.text, c.is_correct, c.image_id, c.audio_id, c.explanation, c.sort_order);
      });
    });

    const newActivity = db.prepare('SELECT * FROM activities WHERE id = ?').get(newId);
    res.status(201).json(newActivity);
  } catch (err) {
    res.status(500).json({ error: 'Failed to duplicate activity', details: err.message });
  }
});

// POST /:id/publish
router.post('/:id/publish', authenticate, (req, res) => {
  const db = req.app.get('db');
  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id);
  if (!activity) return res.status(404).json({ error: 'Activity not found' });
  if (activity.created_by !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  db.prepare('UPDATE activities SET status = \'published\', published_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?').run(req.params.id);
  res.json({ message: 'Activity published' });
});

// POST /:id/unpublish
router.post('/:id/unpublish', authenticate, (req, res) => {
  const db = req.app.get('db');
  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id);
  if (!activity) return res.status(404).json({ error: 'Activity not found' });
  if (activity.created_by !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  db.prepare('UPDATE activities SET status = \'draft\', updated_at = datetime(\'now\') WHERE id = ?').run(req.params.id);
  res.json({ message: 'Activity unpublished' });
});

// POST /:id/archive
router.post('/:id/archive', authenticate, (req, res) => {
  const db = req.app.get('db');
  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id);
  if (!activity) return res.status(404).json({ error: 'Activity not found' });
  if (activity.created_by !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  db.prepare('UPDATE activities SET status = \'archived\', updated_at = datetime(\'now\') WHERE id = ?').run(req.params.id);
  res.json({ message: 'Activity archived' });
});

// POST /:id/restore
router.post('/:id/restore', authenticate, (req, res) => {
  const db = req.app.get('db');
  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id);
  if (!activity) return res.status(404).json({ error: 'Activity not found' });
  if (activity.created_by !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  db.prepare('UPDATE activities SET status = \'draft\', updated_at = datetime(\'now\') WHERE id = ?').run(req.params.id);
  res.json({ message: 'Activity restored to draft' });
});

// GET /:id/questions
router.get('/:id/questions', optionalAuth, (req, res) => {
  const db = req.app.get('db');
  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id);
  if (!activity) return res.status(404).json({ error: 'Activity not found' });

  const questions = db.prepare('SELECT * FROM questions WHERE activity_id = ? ORDER BY sort_order').all(req.params.id);
  questions.forEach(q => {
    q.choices = db.prepare('SELECT * FROM choices WHERE question_id = ? ORDER BY sort_order').all(q.id);
  });

  res.json(questions);
});

module.exports = router;
