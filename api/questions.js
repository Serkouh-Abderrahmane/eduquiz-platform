const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { validateQuestion } = require('../middleware/validation');

// POST /
router.post('/', authenticate, (req, res) => {
  const db = req.app.get('db');
  const errors = validateQuestion(req.body);
  if (errors.length > 0) return res.status(400).json({ errors });

  const { activity_id, type, question_text, explanation, image_id, audio_id, reading_passage, choices } = req.body;

  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(activity_id);
  if (!activity) return res.status(404).json({ error: 'Activity not found' });
  if (activity.created_by !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const maxOrder = db.prepare('SELECT MAX(sort_order) as max_order FROM questions WHERE activity_id = ?').get(activity_id);
  const sortOrder = (maxOrder.max_order || 0) + 1;

  try {
    const result = db.prepare(
      'INSERT INTO questions (activity_id, type, question_text, explanation, image_id, audio_id, reading_passage, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))'
    ).run(activity_id, type, question_text, explanation || null, image_id || null, audio_id || null, reading_passage || null, sortOrder);

    const questionId = result.lastInsertRowid;

    choices.forEach((c, idx) => {
      db.prepare(
        'INSERT INTO choices (question_id, text, is_correct, image_id, audio_id, explanation, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(questionId, c.text, c.is_correct ? 1 : 0, c.image_id || null, c.audio_id || null, c.explanation || null, idx + 1);
    });

    db.prepare('UPDATE activities SET updated_at = datetime(\'now\') WHERE id = ?').run(activity_id);

    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(questionId);
    question.choices = db.prepare('SELECT * FROM choices WHERE question_id = ? ORDER BY sort_order').all(questionId);

    res.status(201).json(question);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create question', details: err.message });
  }
});

// PUT /:id
router.put('/:id', authenticate, (req, res) => {
  const db = req.app.get('db');
  const question = db.prepare('SELECT q.*, a.created_by FROM questions q JOIN activities a ON q.activity_id = a.id WHERE q.id = ?').get(req.params.id);
  if (!question) return res.status(404).json({ error: 'Question not found' });
  if (question.created_by !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const { type, question_text, explanation, image_id, audio_id, reading_passage, choices } = req.body;

  const updates = [];
  const params = [];
  if (type !== undefined) { updates.push('type = ?'); params.push(type); }
  if (question_text !== undefined) { updates.push('question_text = ?'); params.push(question_text); }
  if (explanation !== undefined) { updates.push('explanation = ?'); params.push(explanation); }
  if (image_id !== undefined) { updates.push('image_id = ?'); params.push(image_id); }
  if (audio_id !== undefined) { updates.push('audio_id = ?'); params.push(audio_id); }
  if (reading_passage !== undefined) { updates.push('reading_passage = ?'); params.push(reading_passage); }

  if (updates.length > 0) {
    updates.push('updated_at = datetime(\'now\')');
    params.push(req.params.id);
    db.prepare(`UPDATE questions SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  if (Array.isArray(choices)) {
    db.prepare('DELETE FROM choices WHERE question_id = ?').run(req.params.id);
    choices.forEach((c, idx) => {
      db.prepare(
        'INSERT INTO choices (question_id, text, is_correct, image_id, audio_id, explanation, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(req.params.id, c.text, c.is_correct ? 1 : 0, c.image_id || null, c.audio_id || null, c.explanation || null, idx + 1);
    });
  }

  db.prepare('UPDATE activities SET updated_at = datetime(\'now\') WHERE id = ?').run(question.activity_id);

  const updated = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
  updated.choices = db.prepare('SELECT * FROM choices WHERE question_id = ? ORDER BY sort_order').all(req.params.id);
  res.json(updated);
});

// DELETE /:id
router.delete('/:id', authenticate, (req, res) => {
  const db = req.app.get('db');
  const question = db.prepare('SELECT q.*, a.created_by FROM questions q JOIN activities a ON q.activity_id = a.id WHERE q.id = ?').get(req.params.id);
  if (!question) return res.status(404).json({ error: 'Question not found' });
  if (question.created_by !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  db.prepare('DELETE FROM choices WHERE question_id = ?').run(req.params.id);
  db.prepare('DELETE FROM questions WHERE id = ?').run(req.params.id);
  db.prepare('UPDATE activities SET updated_at = datetime(\'now\') WHERE id = ?').run(question.activity_id);

  res.json({ message: 'Question deleted' });
});

// POST /reorder
router.post('/reorder', authenticate, (req, res) => {
  const db = req.app.get('db');
  const { question_ids } = req.body;

  if (!Array.isArray(question_ids) || question_ids.length === 0) {
    return res.status(400).json({ error: 'question_ids array is required' });
  }

  const stmt = db.prepare('UPDATE questions SET sort_order = ?, updated_at = datetime(\'now\') WHERE id = ?');
  question_ids.forEach((id, idx) => stmt.run(idx + 1, id));

  res.json({ message: 'Questions reordered' });
});

// POST /:id/duplicate
router.post('/:id/duplicate', authenticate, (req, res) => {
  const db = req.app.get('db');
  const question = db.prepare('SELECT q.*, a.created_by FROM questions q JOIN activities a ON q.activity_id = a.id WHERE q.id = ?').get(req.params.id);
  if (!question) return res.status(404).json({ error: 'Question not found' });

  const maxOrder = db.prepare('SELECT MAX(sort_order) as max_order FROM questions WHERE activity_id = ?').get(question.activity_id);
  const sortOrder = (maxOrder.max_order || 0) + 1;

  try {
    const result = db.prepare(
      'INSERT INTO questions (activity_id, type, question_text, explanation, image_id, audio_id, reading_passage, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))'
    ).run(question.activity_id, question.type, question.question_text, question.explanation, question.image_id, question.audio_id, question.reading_passage, sortOrder);

    const newId = result.lastInsertRowid;
    const choices = db.prepare('SELECT * FROM choices WHERE question_id = ? ORDER BY sort_order').all(question.id);
    choices.forEach(c => {
      db.prepare(
        'INSERT INTO choices (question_id, text, is_correct, image_id, audio_id, explanation, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(newId, c.text, c.is_correct, c.image_id, c.audio_id, c.explanation, c.sort_order);
    });

    db.prepare('UPDATE activities SET updated_at = datetime(\'now\') WHERE id = ?').run(question.activity_id);

    const dup = db.prepare('SELECT * FROM questions WHERE id = ?').get(newId);
    dup.choices = db.prepare('SELECT * FROM choices WHERE question_id = ? ORDER BY sort_order').all(newId);
    res.status(201).json(dup);
  } catch (err) {
    res.status(500).json({ error: 'Failed to duplicate question', details: err.message });
  }
});

module.exports = router;
