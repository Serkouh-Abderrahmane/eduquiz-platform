const router = require('express').Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { authenticate } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'eduquiz-secret-key-2024';

function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

// POST /register
router.post('/register', (req, res) => {
  const db = req.app.get('db');
  const { username, email, password, role, display_name } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existing) {
    return res.status(409).json({ error: 'Username or email already exists' });
  }

  const validRoles = ['student', 'teacher', 'admin'];
  const userRole = validRoles.includes(role) ? role : 'student';
  const hashedPassword = bcrypt.hashSync(password, 10);

  try {
    const result = db.prepare(
      'INSERT INTO users (username, email, password_hash, role, display_name, created_at, last_login) VALUES (?, ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))'
    ).run(username, email, hashedPassword, userRole, display_name || username);

    const user = db.prepare('SELECT id, username, email, role, display_name, avatar, created_at, last_login FROM users WHERE id = ?').get(result.lastInsertRowid);

    db.prepare(
      'INSERT INTO user_stats (user_id, xp, coins, level, total_activities_completed, total_perfect_scores, total_questions_answered, total_correct_answers, streak_days, longest_streak, created_at, updated_at) VALUES (?, 0, 0, 1, 0, 0, 0, 0, 0, 0, datetime(\'now\'), datetime(\'now\'))'
    ).run(user.id);

    const stats = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(user.id);
    const token = generateToken(user);

    res.status(201).json({ token, user: { ...user, stats } });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed', details: err.message });
  }
});

// POST /login
router.post('/login', (req, res) => {
  const db = req.app.get('db');
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  db.prepare('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?').run(user.id);
  user.last_login = new Date().toISOString();

  const stats = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(user.id);
  const token = generateToken(user);

  const { password_hash, ...safeUser } = user;
  res.json({ token, user: { ...safeUser, stats } });
});

// GET /me
router.get('/me', authenticate, (req, res) => {
  const db = req.app.get('db');
  const user = db.prepare('SELECT id, username, email, role, display_name, avatar, created_at, last_login FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const stats = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(user.id);
  res.json({ user: { ...user, stats } });
});

// PUT /me
router.put('/me', authenticate, (req, res) => {
  const db = req.app.get('db');
  const { display_name, avatar } = req.body;

  const user = db.prepare('SELECT id, username, email, role, display_name, avatar, created_at, last_login FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (display_name !== undefined) {
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(display_name, req.user.id);
  }
  if (avatar !== undefined) {
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, req.user.id);
  }

  const updated = db.prepare('SELECT id, username, email, role, display_name, avatar, created_at, last_login FROM users WHERE id = ?').get(req.user.id);
  const stats = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(req.user.id);
  res.json({ user: { ...updated, stats } });
});

module.exports = router;
