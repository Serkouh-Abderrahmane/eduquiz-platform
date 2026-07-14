const router = require('express').Router();
const { authenticate } = require('../middleware/auth');

function calculateBadges(db, userId) {
  const stats = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(userId);
  const badges = db.prepare('SELECT * FROM badges').all();
  const awarded = [];
  badges.forEach(badge => {
    const existing = db.prepare('SELECT id FROM user_badges WHERE user_id = ? AND badge_id = ?').get(userId, badge.id);
    if (existing) return;
    let criteria = {};
    try { criteria = JSON.parse(badge.criteria || '{}'); } catch (e) { criteria = {}; }
    let earned = false;
    if (criteria.type === 'activities_completed' && stats.total_activities_completed >= (criteria.count || 1)) earned = true;
    if (criteria.type === 'perfect_score' && stats.total_perfect_scores >= (criteria.count || 1)) earned = true;
    if (criteria.type === 'perfect_scores' && stats.total_perfect_scores >= (criteria.count || 1)) earned = true;
    if (criteria.type === 'xp' && stats.xp >= (criteria.count || 1)) earned = true;
    if (criteria.type === 'streak' && stats.longest_streak >= (criteria.count || 1)) earned = true;
    if (criteria.type === 'correct_answers' && stats.total_correct_answers >= (criteria.count || 1)) earned = true;
    if (criteria.type === 'total_questions' && stats.total_questions_answered >= (criteria.count || 1)) earned = true;
    if (criteria.type === 'level_reached' && stats.level >= (criteria.count || 1)) earned = true;
    if (earned) {
      db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_id, earned_at) VALUES (?, ?, datetime(\'now\'))').run(userId, badge.id);
      awarded.push(badge);
    }
  });
  return awarded;
}

function checkAchievements(db, userId) {
  const stats = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(userId);
  const achievements = db.prepare('SELECT * FROM achievements').all();
  const unlocked = [];
  achievements.forEach(ach => {
    const existing = db.prepare('SELECT id FROM user_achievements WHERE user_id = ? AND achievement_id = ?').get(userId, ach.id);
    let progress = 0;
    if (ach.type === 'activities_completed') progress = stats.total_activities_completed;
    else if (ach.type === 'questions_answered') progress = stats.total_questions_answered;
    else if (ach.type === 'perfect_scores') progress = stats.total_perfect_scores;
    else if (ach.type === 'streak_days') progress = stats.streak_days;
    else if (ach.type === 'level_reached') progress = stats.level;
    else progress = stats.total_questions_answered;

    if (existing) {
      if (progress >= ach.target) {
        db.prepare('UPDATE user_achievements SET current_progress = ?, completed = 1, completed_at = datetime(\'now\') WHERE id = ?').run(progress, existing.id);
      } else {
        db.prepare('UPDATE user_achievements SET current_progress = ? WHERE id = ?').run(progress, existing.id);
      }
    } else {
      const completed = progress >= ach.target ? 1 : 0;
      db.prepare('INSERT INTO user_achievements (user_id, achievement_id, current_progress, completed, completed_at) VALUES (?, ?, ?, ?, ?)').run(userId, ach.id, progress, completed, completed ? new Date().toISOString() : null);
      if (completed) unlocked.push(ach);
    }
  });
  return unlocked;
}

// POST /start
router.post('/start', authenticate, (req, res) => {
  const db = req.app.get('db');
  const { activity_id } = req.body;

  if (!activity_id) return res.status(400).json({ error: 'activity_id is required' });

  const activity = db.prepare('SELECT * FROM activities WHERE id = ? AND status = \'published\'').get(activity_id);
  if (!activity) return res.status(404).json({ error: 'Activity not found or not published' });

  let settings = {};
  try { settings = typeof activity.settings === 'string' ? JSON.parse(activity.settings) : (activity.settings || {}); } catch (e) { settings = {}; }

  let scoringConfig = {};
  try { scoringConfig = typeof activity.scoring_config === 'string' ? JSON.parse(activity.scoring_config) : (activity.scoring_config || {}); } catch (e) { scoringConfig = {}; }

  const basePoints = scoringConfig.base_points || 10;
  const wrongPenalty = scoringConfig.wrong_answer_penalty || 0;

  let questions = db.prepare('SELECT * FROM questions WHERE activity_id = ? AND is_active = 1 ORDER BY sort_order').all(activity_id);

  if (activity.randomize_questions) {
    for (let i = questions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questions[i], questions[j]] = [questions[j], questions[i]];
    }
  }

  if (activity.question_pool_size > 0 && activity.question_pool_size < questions.length) {
    questions = questions.slice(0, activity.question_pool_size);
  }

  if (questions.length === 0) {
    return res.status(400).json({ error: 'No questions available for this activity' });
  }

  questions.forEach(q => {
    let choices = db.prepare('SELECT * FROM choices WHERE question_id = ? ORDER BY sort_order').all(q.id);
    if (activity.randomize_answers) {
      for (let i = choices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [choices[i], choices[j]] = [choices[j], choices[i]];
      }
    }
    q.choices = choices;
  });

  try {
    const result = db.prepare(
      'INSERT INTO attempts (user_id, activity_id, score, total_possible, current_question_index, time_spent, lives_remaining, status, started_at) VALUES (?, ?, 0, ?, 0, 0, ?, \'in_progress\', datetime(\'now\'))'
    ).run(req.user.id, activity_id, questions.length, activity.lives_enabled ? activity.max_lives : null);

    const attemptId = result.lastInsertRowid;

    const firstQuestion = questions[0];
    const safeChoices = firstQuestion.choices.map(c => ({
      id: c.id,
      text: c.text,
      image_id: c.image_id,
      audio_id: c.audio_id
    }));

    res.status(201).json({
      attempt: {
        id: attemptId,
        activity_id: activity_id,
        status: 'in_progress',
        score: 0,
        lives_remaining: activity.lives_enabled ? activity.max_lives : null
      },
      activity: {
        id: activity.id,
        title: activity.title,
        description: activity.description,
        settings: settings,
        timer_type: activity.timer_type,
        time_limit: activity.time_limit,
        lives_enabled: activity.lives_enabled,
        max_lives: activity.max_lives
      },
      question: {
        id: firstQuestion.id,
        type: firstQuestion.type,
        question_text: firstQuestion.question_text,
        explanation: firstQuestion.explanation,
        image_id: firstQuestion.image_id,
        audio_id: firstQuestion.audio_id,
        reading_passage: firstQuestion.reading_passage,
        choices: safeChoices,
        sort_order: firstQuestion.sort_order,
        index: 0
      },
      total_questions: questions.length,
      settings: {
        base_points: basePoints,
        wrong_penalty: wrongPenalty,
        timer_type: activity.timer_type,
        time_limit: activity.time_limit,
        lives_enabled: activity.lives_enabled,
        max_lives: activity.max_lives,
        show_explanation: settings.show_explanation !== false
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to start attempt', details: err.message });
  }
});

// GET /attempt/:id
router.get('/attempt/:id', authenticate, (req, res) => {
  const db = req.app.get('db');
  const attempt = db.prepare('SELECT * FROM attempts WHERE id = ? AND user_id = ?').get(parseInt(req.params.id), req.user.id);
  if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(attempt.activity_id);

  const questions = db.prepare('SELECT * FROM questions WHERE activity_id = ? AND is_active = 1 ORDER BY sort_order').all(attempt.activity_id);
  questions.forEach(q => {
    q.choices = db.prepare('SELECT id, text, image_id, audio_id FROM choices WHERE question_id = ? ORDER BY sort_order').all(q.id);
  });

  const currentIndex = attempt.current_question_index;
  const currentQuestion = currentIndex < questions.length ? questions[currentIndex] : null;

  let timeRemaining = null;
  if (activity && activity.timer_type === 'per_activity' && activity.time_limit > 0 && attempt.started_at) {
    const elapsed = Math.floor((Date.now() - new Date(attempt.started_at + 'Z').getTime()) / 1000);
    timeRemaining = Math.max(0, activity.time_limit - elapsed);
  }

  res.json({
    attempt: {
      id: attempt.id,
      activity_id: attempt.activity_id,
      status: attempt.status,
      score: attempt.score,
      lives_remaining: attempt.lives_remaining
    },
    current_question: currentQuestion ? { ...currentQuestion, index: currentIndex } : null,
    progress: { answered: currentIndex, total: questions.length },
    time_remaining: timeRemaining,
    started_at: attempt.started_at
  });
});

// POST /attempt/:id/answer
router.post('/attempt/:id/answer', authenticate, (req, res) => {
  const db = req.app.get('db');
  const { question_id, choice_id, time_spent } = req.body;

  if (!question_id || !choice_id) return res.status(400).json({ error: 'question_id and choice_id are required' });

  const attempt = db.prepare('SELECT * FROM attempts WHERE id = ? AND user_id = ? AND status = \'in_progress\'').get(parseInt(req.params.id), req.user.id);
  if (!attempt) return res.status(404).json({ error: 'Attempt not found or already completed' });

  const question = db.prepare('SELECT * FROM questions WHERE id = ? AND activity_id = ?').get(question_id, attempt.activity_id);
  if (!question) return res.status(404).json({ error: 'Question not found for this activity' });

  const selectedChoice = db.prepare('SELECT * FROM choices WHERE id = ? AND question_id = ?').get(choice_id, question_id);
  if (!selectedChoice) return res.status(404).json({ error: 'Choice not found' });

  const correctChoice = db.prepare('SELECT * FROM choices WHERE question_id = ? AND is_correct = 1').get(question_id);

  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(attempt.activity_id);

  let scoringConfig = {};
  try { scoringConfig = typeof activity.scoring_config === 'string' ? JSON.parse(activity.scoring_config) : (activity.scoring_config || {}); } catch (e) { scoringConfig = {}; }
  const basePoints = scoringConfig.base_points || 10;

  let settings = {};
  try { settings = typeof activity.settings === 'string' ? JSON.parse(activity.settings) : (activity.settings || {}); } catch (e) { settings = {}; }

  const isCorrect = selectedChoice.is_correct ? true : false;
  let pointsEarned = 0;

  if (isCorrect) {
    pointsEarned = question.points_override || basePoints;
    if (activity.timer_type === 'per_activity' && activity.time_limit > 0 && time_spent !== undefined) {
      const timeBonus = Math.max(0, ((activity.time_limit - (time_spent || 0)) / activity.time_limit) * 5);
      pointsEarned += Math.round(timeBonus * 10) / 10;
    }
  } else {
    pointsEarned = -(scoringConfig.wrong_answer_penalty || 0);
  }

  const newScore = Math.max(0, attempt.score + pointsEarned);
  const newIndex = attempt.current_question_index + 1;
  const totalQuestions = attempt.total_possible;

  let newStatus = 'in_progress';
  let livesRemaining = attempt.lives_remaining;

  if (activity.lives_enabled && livesRemaining !== null) {
    if (!isCorrect) {
      livesRemaining = Math.max(0, livesRemaining - 1);
      if (livesRemaining <= 0) {
        newStatus = 'abandoned';
      }
    }
  }

  if (newIndex >= totalQuestions && newStatus === 'in_progress') {
    newStatus = 'completed';
  }

  db.prepare(
    'INSERT INTO answers (attempt_id, question_id, choice_id, is_correct, time_spent, points_earned, answered_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))'
  ).run(attempt.id, question_id, choice_id, isCorrect ? 1 : 0, time_spent || 0, pointsEarned);

  db.prepare(
    'UPDATE attempts SET score = ?, current_question_index = ?, lives_remaining = ?, status = ?, total_possible = ? WHERE id = ?'
  ).run(newScore, newIndex, livesRemaining, newStatus, totalQuestions, attempt.id);

  let nextQuestion = null;
  if (newStatus === 'in_progress' && newIndex < totalQuestions) {
    let allQuestions = db.prepare('SELECT * FROM questions WHERE activity_id = ? AND is_active = 1 ORDER BY sort_order').all(attempt.activity_id);
    if (newIndex < allQuestions.length) {
      const nq = allQuestions[newIndex];
      let nqChoices = db.prepare('SELECT id, text, image_id, audio_id FROM choices WHERE question_id = ? ORDER BY sort_order').all(nq.id);
      if (activity.randomize_answers) {
        for (let i = nqChoices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [nqChoices[i], nqChoices[j]] = [nqChoices[j], nqChoices[i]];
        }
      }
      nextQuestion = { ...nq, choices: nqChoices, index: newIndex };
    }
  }

  res.json({
    is_correct: isCorrect,
    correct_choice_id: correctChoice ? correctChoice.id : null,
    explanation: settings.show_explanation !== false ? (question.explanation || null) : null,
    points_earned: pointsEarned,
    new_score: newScore,
    lives_remaining: livesRemaining,
    status: newStatus,
    next_question: nextQuestion
  });
});

// POST /attempt/:id/next
router.post('/attempt/:id/next', authenticate, (req, res) => {
  const db = req.app.get('db');
  const attempt = db.prepare('SELECT * FROM attempts WHERE id = ? AND user_id = ?').get(parseInt(req.params.id), req.user.id);
  if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

  if (attempt.status !== 'in_progress') {
    return res.json({ status: attempt.status, next_question: null });
  }

  let questions = db.prepare('SELECT * FROM questions WHERE activity_id = ? AND is_active = 1 ORDER BY sort_order').all(attempt.activity_id);
  const currentIndex = attempt.current_question_index;

  if (currentIndex >= questions.length) {
    db.prepare('UPDATE attempts SET status = \'completed\', completed_at = datetime(\'now\') WHERE id = ?').run(attempt.id);
    return res.json({ status: 'completed', next_question: null });
  }

  const next = questions[currentIndex];
  let nextChoices = db.prepare('SELECT id, text, image_id, audio_id FROM choices WHERE question_id = ? ORDER BY sort_order').all(next.id);

  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(attempt.activity_id);
  if (activity && activity.randomize_answers) {
    for (let i = nextChoices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [nextChoices[i], nextChoices[j]] = [nextChoices[j], nextChoices[i]];
    }
  }

  res.json({ status: 'in_progress', next_question: { ...next, choices: nextChoices, index: currentIndex } });
});

// POST /attempt/:id/abandon
router.post('/attempt/:id/abandon', authenticate, (req, res) => {
  const db = req.app.get('db');
  const attempt = db.prepare('SELECT * FROM attempts WHERE id = ? AND user_id = ?').get(parseInt(req.params.id), req.user.id);
  if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

  db.prepare('UPDATE attempts SET status = \'abandoned\', completed_at = datetime(\'now\') WHERE id = ?').run(attempt.id);
  res.json({ message: 'Attempt abandoned' });
});

// GET /attempt/:id/result
router.get('/attempt/:id/result', authenticate, (req, res) => {
  const db = req.app.get('db');
  const attempt = db.prepare('SELECT * FROM attempts WHERE id = ? AND user_id = ?').get(parseInt(req.params.id), req.user.id);
  if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(attempt.activity_id);

  const percentage = attempt.total_possible > 0 ? Math.round((attempt.current_question_index > 0 ? (function() {
    const correct = db.prepare('SELECT COUNT(*) as cnt FROM answers WHERE attempt_id = ? AND is_correct = 1').get(attempt.id);
    return correct.cnt;
  })() : 0) / attempt.total_possible * 100) : 0;

  const correctCount = db.prepare('SELECT COUNT(*) as cnt FROM answers WHERE attempt_id = ? AND is_correct = 1').get(attempt.id).cnt;
  const totalAnswered = db.prepare('SELECT COUNT(*) as cnt FROM answers WHERE attempt_id = ?').get(attempt.id).cnt;
  const actualPercentage = attempt.total_possible > 0 ? Math.round((correctCount / attempt.total_possible) * 100) : 0;

  let stars = 0;
  if (attempt.status === 'completed') stars = 1;
  if (actualPercentage >= 70) stars = 2;
  if (actualPercentage === 100) stars = 3;

  let xpEarned = attempt.score;
  let coinsEarned = Math.floor(attempt.score / 10);
  if (coinsEarned < 1 && attempt.score > 0) coinsEarned = 1;

  if (attempt.status === 'completed' && actualPercentage === 100) {
    xpEarned = Math.round(xpEarned * 1.5);
    coinsEarned = Math.round(coinsEarned * 1.5);
  }

  let badgeEarned = null;

  if (attempt.status === 'completed') {
    const userStats = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(req.user.id);
    if (userStats) {
      const newXp = userStats.xp + xpEarned;
      const newCoins = userStats.coins + coinsEarned;
      const newLevel = Math.floor(newXp / 100) + 1;
      const newCompleted = userStats.total_activities_completed + 1;
      const newPerfect = userStats.total_perfect_scores + (actualPercentage === 100 ? 1 : 0);
      const newQuestionsAnswered = userStats.total_questions_answered + totalAnswered;
      const newCorrectAnswers = userStats.total_correct_answers + correctCount;

      const today = new Date().toISOString().split('T')[0];
      let newStreak = userStats.streak_days;
      let newLongestStreak = userStats.longest_streak;
      if (userStats.last_active_date !== today) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        if (userStats.last_active_date === yesterday) {
          newStreak = userStats.streak_days + 1;
        } else {
          newStreak = 1;
        }
        if (newStreak > newLongestStreak) newLongestStreak = newStreak;
      }

      db.prepare(
        'UPDATE user_stats SET xp = ?, coins = ?, level = ?, streak_days = ?, longest_streak = ?, last_active_date = ?, total_activities_completed = ?, total_perfect_scores = ?, total_questions_answered = ?, total_correct_answers = ?, updated_at = datetime(\'now\') WHERE user_id = ?'
      ).run(newXp, newCoins, newLevel, newStreak, newLongestStreak, today, newCompleted, newPerfect, newQuestionsAnswered, newCorrectAnswers, req.user.id);

      const badges = calculateBadges(db, req.user.id);
      if (badges.length > 0) badgeEarned = badges[0];

      checkAchievements(db, req.user.id);
    }

    const existingAnalytics = db.prepare('SELECT id FROM activity_analytics WHERE activity_id = ?').get(attempt.activity_id);
    if (existingAnalytics) {
      db.prepare(
        'UPDATE activity_analytics SET total_attempts = total_attempts + 1, completed_attempts = completed_attempts + 1, avg_score = (SELECT AVG(score) FROM attempts WHERE activity_id = ? AND status = \'completed\'), last_attempt_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE activity_id = ?'
      ).run(attempt.activity_id, attempt.activity_id);
    } else {
      db.prepare(
        'INSERT INTO activity_analytics (activity_id, total_attempts, completed_attempts, avg_score, last_attempt_at, updated_at) VALUES (?, 1, 1, ?, datetime(\'now\'), datetime(\'now\'))'
      ).run(attempt.activity_id, attempt.score);
    }
  }

  const questionAnswers = db.prepare(`
    SELECT a.*, q.question_text, q.type, q.explanation as question_explanation
    FROM answers a
    JOIN questions q ON a.question_id = q.id
    WHERE a.attempt_id = ?
  `).all(attempt.id);

  const questionsWithDetails = questionAnswers.map(qa => {
    const userChoice = db.prepare('SELECT id, text FROM choices WHERE id = ?').get(qa.choice_id);
    const correctChoice = db.prepare('SELECT id, text FROM choices WHERE question_id = ? AND is_correct = 1').get(qa.question_id);
    return {
      question_id: qa.question_id,
      question_text: qa.question_text,
      type: qa.type,
      user_choice: userChoice,
      correct_choice: correctChoice,
      is_correct: qa.is_correct ? true : false,
      points_earned: qa.points_earned,
      time_spent: qa.time_spent,
      explanation: qa.question_explanation
    };
  });

  res.json({
    attempt_id: attempt.id,
    activity_id: attempt.activity_id,
    activity_title: activity ? activity.title : null,
    status: attempt.status,
    score: attempt.score,
    percentage: actualPercentage,
    stars,
    time_spent: attempt.time_spent || 0,
    questions_total: attempt.total_possible,
    correct_answers: correctCount,
    xp_earned: xpEarned,
    coins_earned: coinsEarned,
    badge_earned: badgeEarned,
    started_at: attempt.started_at,
    completed_at: attempt.completed_at,
    questions: questionsWithDetails
  });
});

module.exports = router;
