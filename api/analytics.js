const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');

// GET /activity/:id
router.get('/activity/:id', authenticate, (req, res) => {
  const db = req.app.get('db');
  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id);
  if (!activity) return res.status(404).json({ error: 'Activity not found' });

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_attempts,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completions,
      AVG(CASE WHEN status = 'completed' THEN score ELSE NULL END) as avg_score,
      AVG(time_spent) as avg_time
    FROM attempts WHERE activity_id = ?
  `).get(req.params.id);

  const completionRate = stats.total_attempts > 0 ? Math.round(((stats.completions || 0) / stats.total_attempts) * 100) : 0;

  const scoreDistribution = db.prepare(`
    SELECT
      CASE
        WHEN percentage >= 90 THEN '90-100'
        WHEN percentage >= 70 THEN '70-89'
        WHEN percentage >= 50 THEN '50-69'
        WHEN percentage >= 30 THEN '30-49'
        ELSE '0-29'
      END as range,
      COUNT(*) as count
    FROM attempts WHERE activity_id = ? AND status = 'completed'
    GROUP BY range ORDER BY range DESC
  `).all(req.params.id);

  const questions = db.prepare('SELECT * FROM questions WHERE activity_id = ?').all(req.params.id);
  const mostMissed = [];
  questions.forEach(q => {
    const missCount = db.prepare(`
      SELECT COUNT(*) as missed FROM answers an
      JOIN attempts att ON an.attempt_id = att.id
      WHERE an.question_id = ? AND att.activity_id = ? AND an.is_correct = 0
    `).get(q.id, req.params.id);
    mostMissed.push({ question_id: q.id, question_text: q.question_text, missed_count: missCount.missed });
  });
  mostMissed.sort((a, b) => b.missed_count - a.missed_count);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const attemptTrend = db.prepare(`
    SELECT DATE(started_at) as date, COUNT(*) as attempts, AVG(score) as avg_score
    FROM attempts WHERE activity_id = ? AND started_at >= ? AND status = 'completed'
    GROUP BY DATE(started_at) ORDER BY date
  `).all(req.params.id, thirtyDaysAgo);

  res.json({
    activity_id: req.params.id,
    total_attempts: stats.total_attempts || 0,
    completion_rate: completionRate,
    avg_score: Math.round((stats.avg_score || 0) * 100) / 100,
    avg_time: Math.round(stats.avg_time || 0),
    score_distribution: scoreDistribution,
    most_missed_questions: mostMissed.slice(0, 10),
    attempt_trend: attemptTrend
  });
});

// GET /user/:id
router.get('/user/:id', authenticate, requireRole('admin', 'teacher'), (req, res) => {
  const db = req.app.get('db');
  const user = db.prepare('SELECT id, username, display_name, role FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const stats = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(req.params.id);

  const userAttempts = db.prepare(`
    SELECT att.*, a.title as activity_title, a.category_id
    FROM attempts att
    JOIN activities a ON att.activity_id = a.id
    WHERE att.user_id = ? AND att.status = 'completed'
    ORDER BY att.completed_at DESC LIMIT 20
  `).all(req.params.id);

  const avgScore = db.prepare('SELECT AVG(score) as avg FROM attempts WHERE user_id = ? AND status = \'completed\'').get(req.params.id);

  const categoryPerformance = db.prepare(`
    SELECT a.category_id, c.name as category_name,
      COUNT(*) as attempts,
      AVG(att.score) as avg_score
    FROM attempts att
    JOIN activities a ON att.activity_id = a.id
    LEFT JOIN categories c ON a.category_id = c.id
    WHERE att.user_id = ? AND att.status = 'completed'
    GROUP BY a.category_id
    ORDER BY avg_score DESC
  `).all(req.params.id);

  const strengths = categoryPerformance.filter(c => c.avg_score >= 70).map(c => ({ category: c.category_name, avg_score: Math.round(c.avg_score) }));
  const weaknesses = categoryPerformance.filter(c => c.avg_score < 50).map(c => ({ category: c.category_name, avg_score: Math.round(c.avg_score) }));

  res.json({
    user,
    stats,
    avg_score: Math.round((avgScore.avg || 0) * 100) / 100,
    strengths,
    weaknesses,
    recent_activity: userAttempts.map(a => ({
      attempt_id: a.id,
      activity_title: a.activity_title,
      score: a.score,
      completed_at: a.completed_at
    })),
    streak_days: stats ? stats.streak_days : 0,
    longest_streak: stats ? stats.longest_streak : 0
  });
});

// GET /leaderboard
router.get('/leaderboard', authenticate, (req, res) => {
  const db = req.app.get('db');
  const period = req.query.period || 'all';
  const activityId = req.query.activity_id;

  let dateFilter = '';
  if (period === 'week') {
    dateFilter = `AND att.started_at >= datetime('now', '-7 days')`;
  } else if (period === 'month') {
    dateFilter = `AND att.started_at >= datetime('now', '-30 days')`;
  }

  let activityFilter = '';
  let params = [];
  if (activityId) {
    activityFilter = 'AND att.activity_id = ?';
    params.push(activityId);
  }

  const leaderboard = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar,
      COUNT(att.id) as total_attempts,
      MAX(att.score) as best_score,
      AVG(att.score) as avg_score
    FROM users u
    JOIN attempts att ON u.id = att.user_id
    WHERE att.status = 'completed' ${dateFilter} ${activityFilter}
    GROUP BY u.id
    ORDER BY best_score DESC
    LIMIT 50
  `).all(...params);

  res.json({ period, activity_id: activityId || null, leaderboard });
});

// GET /dashboard
router.get('/dashboard', authenticate, requireRole('admin', 'teacher'), (req, res) => {
  const db = req.app.get('db');

  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
  const totalActivities = db.prepare('SELECT COUNT(*) as count FROM activities').get();
  const totalAttempts = db.prepare('SELECT COUNT(*) as count FROM attempts').get();
  const avgScore = db.prepare('SELECT AVG(score) as avg FROM attempts WHERE status = \'completed\'').get();

  const popularActivities = db.prepare(`
    SELECT a.id, a.title, a.difficulty,
      COUNT(att.id) as attempts,
      AVG(att.score) as avg_score
    FROM activities a
    JOIN attempts att ON a.id = att.activity_id
    WHERE att.status = 'completed'
    GROUP BY a.id
    ORDER BY attempts DESC
    LIMIT 10
  `).all();

  const recentActivity = db.prepare(`
    SELECT att.id, att.score, att.status, att.started_at,
      u.username, u.display_name,
      a.title as activity_title
    FROM attempts att
    JOIN users u ON att.user_id = u.id
    JOIN activities a ON att.activity_id = a.id
    ORDER BY att.started_at DESC
    LIMIT 20
  `).all();

  res.json({
    total_users: totalUsers.count,
    total_activities: totalActivities.count,
    total_attempts: totalAttempts.count,
    avg_score: Math.round((avgScore.avg || 0) * 100) / 100,
    popular_activities: popularActivities,
    recent_activity: recentActivity
  });
});

module.exports = router;
