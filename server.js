const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const { initializeDatabase } = require('./database/schema');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
const dbPath = path.join(__dirname, 'database', 'eduquiz.db');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdirSync(path.join(uploadsDir, 'images'), { recursive: true });
fs.mkdirSync(path.join(uploadsDir, 'audio'), { recursive: true });

const db = new Database(dbPath);
initializeDatabase(db);

// Auto-seed database if empty (needed for Railway ephemeral filesystem)
const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!existingAdmin) {
  console.log('Database empty, seeding...');
  const transaction = db.transaction(() => {
    const adminHash = bcrypt.hashSync('admin123', 10);
    const teacherHash = bcrypt.hashSync('teacher123', 10);
    const studentHash = bcrypt.hashSync('student123', 10);

    db.prepare(`INSERT INTO users (username, email, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)`).run('admin', 'admin@eduquiz.com', adminHash, 'admin', 'Administrator');
    db.prepare(`INSERT INTO users (username, email, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)`).run('teacher', 'teacher@eduquiz.com', teacherHash, 'teacher', 'Demo Teacher');
    db.prepare(`INSERT INTO users (username, email, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)`).run('student', 'student@eduquiz.com', studentHash, 'student', 'Demo Student');

    db.prepare(`INSERT INTO user_stats (user_id) VALUES (1)`);
    db.prepare(`INSERT INTO user_stats (user_id) VALUES (2)`);
    db.prepare(`INSERT INTO user_stats (user_id) VALUES (3)`);

    db.prepare(`INSERT INTO games (name, slug, description, icon, config_schema) VALUES (?, ?, ?, ?, ?)`).run(
      'Quiz', 'quiz', 'Classic multiple-choice quiz game', 'quiz',
      JSON.stringify({ allowSkipping: true, showFeedback: true, feedbackDelay: 1500, allowBack: false, scoring: { basePoints: 10, streakBonus: 5, timeBonus: false } })
    );

    const categories = [
      ['Vocabulary', 'vocabulary', 'Learn new words and their meanings', null, '📖', '#4CAF50', 1],
      ['Grammar', 'grammar', 'Grammar rules and structures', null, '📝', '#2196F3', 2],
      ['Animals', 'animals', 'Animal names and facts', null, '🐾', '#FF9800', 3],
      ['Food', 'food', 'Food names and vocabulary', null, '🍎', '#F44336', 4],
      ['School', 'school', 'School-related vocabulary', null, '🏫', '#9C27B0', 5],
      ['Family', 'family', 'Family members and relationships', null, '👨‍👩‍👧‍👦', '#E91E63', 6],
      ['Colors', 'colors', 'Color names and identification', null, '🎨', '#00BCD4', 7],
      ['Numbers', 'numbers', 'Numbers and counting', null, '🔢', '#FF5722', 8],
      ['Jobs', 'jobs', 'Occupations and professions', null, '💼', '#607D8B', 9],
      ['Transportation', 'transportation', 'Vehicles and modes of transport', null, '🚗', '#795548', 10],
      ['Daily Routine', 'daily-routine', 'Everyday activities and routines', null, '⏰', '#009688', 11],
      ['Body Parts', 'body-parts', 'Parts of the human body', null, '🦴', '#FFC107', 12],
      ['Weather', 'weather', 'Weather conditions and seasons', null, '🌤️', '#03A9F4', 13],
      ['Phonics', 'phonics', 'Letter sounds and pronunciation', null, '🔤', '#673AB7', 14],
      ['Reading', 'reading', 'Reading comprehension', null, '📚', '#8BC34A', 15],
      ['Listening', 'listening', 'Listening comprehension exercises', null, '🎧', '#CDDC39', 16]
    ];
    const insertCat = db.prepare(`INSERT INTO categories (name, slug, description, parent_id, icon, color, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const cat of categories) { insertCat.run(...cat); }

    const tags = [
      ['A1', 'a1', '#4CAF50'], ['A2', 'a2', '#8BC34A'], ['B1', 'b1', '#FF9800'],
      ['Kids', 'kids', '#E91E63'], ['Grade 1', 'grade-1', '#2196F3'], ['Grade 2', 'grade-2', '#03A9F4'],
      ['Present Simple', 'present-simple', '#9C27B0'], ['Past Simple', 'past-simple', '#673AB7'],
      ['Animals', 'animals-tag', '#FF5722'], ['Listening', 'listening-tag', '#00BCD4'], ['Speaking', 'speaking-tag', '#FFC107']
    ];
    const insertTag = db.prepare(`INSERT INTO tags (name, slug, color) VALUES (?, ?, ?)`);
    for (const tag of tags) { insertTag.run(...tag); }

    const badges = [
      ['First Quiz', 'Complete your first quiz', '🏅', 'milestone', JSON.stringify({ type: 'activities_completed', count: 1 }), 50],
      ['Perfect Score', 'Get 100% on any quiz', '⭐', 'achievement', JSON.stringify({ type: 'perfect_score', count: 1 }), 100],
      ['Speed Demon', 'Complete a quiz in under 30 seconds', '⚡', 'challenge', JSON.stringify({ type: 'time_under', seconds: 30 }), 150],
      ['Streak Master', 'Answer 10 questions correctly in a row', '🔥', 'streak', JSON.stringify({ type: 'streak', count: 10 }), 200],
      ['Quiz Veteran', 'Complete 50 quizzes', '🎖️', 'milestone', JSON.stringify({ type: 'activities_completed', count: 50 }), 500],
      ['Bookworm', 'Answer 500 questions correctly', '📚', 'milestone', JSON.stringify({ type: 'correct_answers', count: 500 }), 300],
      ['Explorer', 'Try quizzes in 5 different categories', '🧭', 'exploration', JSON.stringify({ type: 'categories_tried', count: 5 }), 100],
      ['Rising Star', 'Reach level 5', '🌟', 'level', JSON.stringify({ type: 'level_reached', count: 5 }), 250],
      ['Night Owl', 'Complete a quiz after midnight', '🦉', 'special', JSON.stringify({ type: 'time_of_day', hour_start: 0, hour_end: 4 }), 75],
      ['Comeback Kid', 'Complete a quiz after failing once', '💪', 'resilience', JSON.stringify({ type: 'comeback', count: 1 }), 100]
    ];
    const insertBadge = db.prepare(`INSERT INTO badges (name, description, icon, category, criteria, xp_reward) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const badge of badges) { insertBadge.run(...badge); }

    const achievements = [
      ['Quiz Starter', 'Complete 10 quizzes', '🎯', 'activities_completed', 10, 100],
      ['Question Master', 'Answer 100 questions', '🧠', 'questions_answered', 100, 200],
      ['Perfectionist', 'Get 5 perfect scores', '💎', 'perfect_scores', 5, 300],
      ['Dedicated Learner', 'Play for 7 days in a row', '📅', 'streak_days', 7, 250],
      ['Knowledge Seeker', 'Answer 500 questions', '🎓', 'questions_answered', 500, 500],
      ['Category Champion', 'Complete all activities in a category', '🏆', 'categories_completed', 1, 400]
    ];
    const insertAchievement = db.prepare(`INSERT INTO achievements (name, description, icon, type, target, xp_reward) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const ach of achievements) { insertAchievement.run(...ach); }

    // Activity 1: Colors Quiz
    db.prepare(`INSERT INTO activities (game_id, title, description, category_id, difficulty, created_by, status, settings, time_limit, timer_type, lives_enabled, max_lives, randomize_questions, randomize_answers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      1, 'Colors Quiz', 'Test your knowledge of color names in English!', 7, 'easy', 2, 'published',
      JSON.stringify({ allowSkipping: true, showFeedback: true, feedbackDelay: 1500 }), 0, 'none', 0, 3, 0, 1
    );
    const a1Id = db.prepare('SELECT last_insert_rowid() as id').get().id;
    db.prepare(`INSERT INTO activity_tags (activity_id, tag_id) VALUES (?, ?)`).run(a1Id, 1);
    db.prepare(`INSERT INTO activity_tags (activity_id, tag_id) VALUES (?, ?)`).run(a1Id, 4);

    const q1Data = [
      ['What color is the sky on a clear day?', 'text', 'The sky appears blue.', 1, 10, 'Blue', 'Red', 'Green', 'Yellow'],
      ['Which color do you get when you mix red and blue?', 'text', 'Mixing red and blue paint creates purple.', 2, 10, 'Purple', 'Blue', 'Orange', 'Green'],
      ['What color are bananas when they are ripe?', 'text', 'Bananas turn yellow when ripe.', 3, 10, 'Yellow', 'Green', 'Red', 'Blue'],
      ['Which color is associated with the grass?', 'text', 'Grass is green.', 4, 10, 'Green', 'Blue', 'Yellow', 'Red'],
      ['What color is a typical fire truck?', 'text', 'Fire trucks are traditionally red.', 5, 10, 'Red', 'Yellow', 'Blue', 'Green']
    ];
    const insQ1 = db.prepare(`INSERT INTO questions (activity_id, type, question_text, explanation, sort_order, points_override) VALUES (?, ?, ?, ?, ?, ?)`);
    const insC1 = db.prepare(`INSERT INTO choices (question_id, text, is_correct, sort_order) VALUES (?, ?, ?, ?)`);
    for (const q of q1Data) {
      insQ1.run(a1Id, q[1], q[0], q[2], q[3], q[5]);
      const qId = db.prepare('SELECT last_insert_rowid() as id').get().id;
      insC1.run(qId, q[6], 1, 1);
      insC1.run(qId, q[7], 0, 2);
      insC1.run(qId, q[8], 0, 3);
      insC1.run(qId, q[9], 0, 4);
    }

    // Activity 2: Animal Kingdom
    db.prepare(`INSERT INTO activities (game_id, title, description, category_id, difficulty, created_by, status, settings, time_limit, timer_type, lives_enabled, max_lives, randomize_questions, randomize_answers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      1, 'Animal Kingdom', 'Learn about animals and their characteristics!', 3, 'medium', 2, 'published',
      JSON.stringify({ allowSkipping: true, showFeedback: true, feedbackDelay: 1500 }), 120, 'per_activity', 1, 3, 1, 1
    );
    const a2Id = db.prepare('SELECT last_insert_rowid() as id').get().id;
    db.prepare(`INSERT INTO activity_tags (activity_id, tag_id) VALUES (?, ?)`).run(a2Id, 2);
    db.prepare(`INSERT INTO activity_tags (activity_id, tag_id) VALUES (?, ?)`).run(a2Id, 9);

    const q2Data = [
      ['Which animal is the "King of the Jungle"?', 'image_text', 'The lion is called King of the Jungle.', 1, 15, 'Lion', 'Tiger', 'Elephant', 'Bear'],
      ['What is the largest animal on Earth?', 'image_text', 'The blue whale is the largest animal.', 2, 15, 'Blue Whale', 'Elephant', 'Giraffe', 'Hippopotamus'],
      ['Which animal has black and white stripes?', 'image_text', 'Zebras have distinctive stripes.', 3, 15, 'Zebra', 'Tiger', 'Leopard', 'Cheetah'],
      ['What do pandas primarily eat?', 'image_text', 'Giant pandas mainly eat bamboo.', 4, 15, 'Bamboo', 'Fish', 'Meat', 'Fruit'],
      ['Which bird migrates the longest distance?', 'image_text', 'The Arctic tern migrates the longest.', 5, 15, 'Arctic Tern', 'Eagle', 'Penguin', 'Swan']
    ];
    const insQ2 = db.prepare(`INSERT INTO questions (activity_id, type, question_text, explanation, sort_order, points_override) VALUES (?, ?, ?, ?, ?, ?)`);
    const insC2 = db.prepare(`INSERT INTO choices (question_id, text, is_correct, sort_order) VALUES (?, ?, ?, ?)`);
    for (const q of q2Data) {
      insQ2.run(a2Id, q[1], q[0], q[2], q[3], q[5]);
      const qId = db.prepare('SELECT last_insert_rowid() as id').get().id;
      insC2.run(qId, q[6], 1, 1);
      insC2.run(qId, q[7], 0, 2);
      insC2.run(qId, q[8], 0, 3);
      insC2.run(qId, q[9], 0, 4);
    }

    db.prepare(`INSERT INTO activity_analytics (activity_id) VALUES (?)`).run(a1Id);
    db.prepare(`INSERT INTO activity_analytics (activity_id) VALUES (?)`).run(a2Id);

    db.prepare(`INSERT INTO assignments (activity_id, teacher_id, title, instructions, due_at, status) VALUES (?, ?, ?, ?, ?, ?)`).run(
      a1Id, 2, 'Colors Quiz Homework', 'Complete this quiz to practice your color vocabulary.', '2026-12-31 23:59:59', 'active'
    );
    const assignmentId = db.prepare('SELECT last_insert_rowid() as id').get().id;
    db.prepare(`INSERT INTO assignment_students (assignment_id, student_id, status) VALUES (?, ?, ?)`).run(assignmentId, 3, 'assigned');
  });
  transaction();
  console.log('Database seeded successfully!');
}

app.set('db', db);

// Middleware
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "data:"],
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(compression());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Mount API routers
try {
  const authRouter = require('./api/auth');
  app.use('/api/auth', authRouter);
} catch (e) {
  console.warn('API router not found: api/auth.js');
}

try {
  const activitiesRouter = require('./api/activities');
  app.use('/api/activities', activitiesRouter);
} catch (e) {
  console.warn('API router not found: api/activities.js');
}

try {
  const questionsRouter = require('./api/questions');
  app.use('/api/questions', questionsRouter);
} catch (e) {
  console.warn('API router not found: api/questions.js');
}

try {
  const gameplayRouter = require('./api/gameplay');
  app.use('/api/gameplay', gameplayRouter);
} catch (e) {
  console.warn('API router not found: api/gameplay.js');
}

try {
  const analyticsRouter = require('./api/analytics');
  app.use('/api/analytics', analyticsRouter);
} catch (e) {
  console.warn('API router not found: api/analytics.js');
}

try {
  const adminRouter = require('./api/admin');
  app.use('/api/admin', adminRouter);
} catch (e) {
  console.warn('API router not found: api/admin.js');
}

try {
  const uploadRouter = require('./api/upload');
  app.use('/api/upload', uploadRouter);
} catch (e) {
  console.warn('API router not found: api/upload.js');
}

// Page routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/game', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'game.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/results', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'results.html'));
});

// 404 for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  db.close();
  process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\nEduQuiz Platform running at http://localhost:${PORT}`);
  console.log(`Admin panel at http://localhost:${PORT}/admin`);
  console.log(`Press Ctrl+C to stop\n`);
});
