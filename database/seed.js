const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { initializeDatabase } = require('./schema');

const dbPath = path.join(__dirname, '..', 'database', 'eduquiz.db');
const db = new Database(dbPath);

initializeDatabase(db);

function seed() {
  const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (existingAdmin) {
    console.log('Database already seeded. Skipping.');
    db.close();
    return;
  }

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
      'Quiz',
      'quiz',
      'Classic multiple-choice quiz game',
      'quiz',
      JSON.stringify({
        allowSkipping: true,
        showFeedback: true,
        feedbackDelay: 1500,
        allowBack: false,
        scoring: { basePoints: 10, streakBonus: 5, timeBonus: false }
      })
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
    for (const cat of categories) {
      insertCat.run(...cat);
    }

    const tags = [
      ['A1', 'a1', '#4CAF50'],
      ['A2', 'a2', '#8BC34A'],
      ['B1', 'b1', '#FF9800'],
      ['Kids', 'kids', '#E91E63'],
      ['Grade 1', 'grade-1', '#2196F3'],
      ['Grade 2', 'grade-2', '#03A9F4'],
      ['Present Simple', 'present-simple', '#9C27B0'],
      ['Past Simple', 'past-simple', '#673AB7'],
      ['Animals', 'animals-tag', '#FF5722'],
      ['Listening', 'listening-tag', '#00BCD4'],
      ['Speaking', 'speaking-tag', '#FFC107']
    ];

    const insertTag = db.prepare(`INSERT INTO tags (name, slug, color) VALUES (?, ?, ?)`);
    for (const tag of tags) {
      insertTag.run(...tag);
    }

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
    for (const badge of badges) {
      insertBadge.run(...badge);
    }

    const achievements = [
      ['Quiz Starter', 'Complete 10 quizzes', '🎯', 'activities_completed', 10, 100],
      ['Question Master', 'Answer 100 questions', '🧠', 'questions_answered', 100, 200],
      ['Perfectionist', 'Get 5 perfect scores', '💎', 'perfect_scores', 5, 300],
      ['Dedicated Learner', 'Play for 7 days in a row', '📅', 'streak_days', 7, 250],
      ['Knowledge Seeker', 'Answer 500 questions', '🎓', 'questions_answered', 500, 500],
      ['Category Champion', 'Complete all activities in a category', '🏆', 'categories_completed', 1, 400]
    ];

    const insertAchievement = db.prepare(`INSERT INTO achievements (name, description, icon, type, target, xp_reward) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const ach of achievements) {
      insertAchievement.run(...ach);
    }

    // Activity 1: Colors Quiz
    db.prepare(`INSERT INTO activities (game_id, title, description, category_id, difficulty, created_by, status, settings, time_limit, timer_type, lives_enabled, max_lives, randomize_questions, randomize_answers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      1,
      'Colors Quiz',
      'Test your knowledge of color names in English!',
      7,
      'easy',
      2,
      'published',
      JSON.stringify({ allowSkipping: true, showFeedback: true, feedbackDelay: 1500 }),
      0,
      'none',
      0,
      3,
      0,
      1
    );

    const activity1Id = db.prepare('SELECT last_insert_rowid() as id').get().id;

    db.prepare(`INSERT INTO activity_tags (activity_id, tag_id) VALUES (?, ?)`).run(activity1Id, 1);
    db.prepare(`INSERT INTO activity_tags (activity_id, tag_id) VALUES (?, ?)`).run(activity1Id, 4);

    const questions1 = [
      ['What color is the sky on a clear day?', 'text', 'The sky appears blue due to the way sunlight scatters in the atmosphere.', 1, 10],
      ['Which color do you get when you mix red and blue?', 'text', 'Mixing red and blue paint creates purple.', 2, 10],
      ['What color are bananas when they are ripe?', 'text', 'Bananas turn yellow when they are ripe.', 3, 10],
      ['Which color is associated with the grass?', 'text', 'Grass is green because of chlorophyll.', 4, 10],
      ['What color is a typical fire truck?', 'text', 'Fire trucks are traditionally painted red for high visibility.', 5, 10]
    ];

    const insertQ1 = db.prepare(`INSERT INTO questions (activity_id, type, question_text, explanation, sort_order, points_override) VALUES (?, ?, ?, ?, ?, ?)`);
    const insertC1 = db.prepare(`INSERT INTO choices (question_id, text, is_correct, sort_order) VALUES (?, ?, ?, ?)`);

    for (const q of questions1) {
      insertQ1.run(activity1Id, q[1], q[0], q[2], q[3], q[5]);
      const qId = db.prepare('SELECT last_insert_rowid() as id').get().id;
      insertC1.run(qId, q[0].includes('sky') ? 'Blue' : q[0].includes('mix red and blue') ? 'Purple' : q[0].includes('bananas') ? 'Yellow' : q[0].includes('grass') ? 'Green' : 'Red', 1, 1);
      insertC1.run(qId, q[0].includes('sky') ? 'Red' : q[0].includes('mix red and blue') ? 'Blue' : q[0].includes('bananas') ? 'Green' : q[0].includes('grass') ? 'Blue' : 'Yellow', 0, 2);
      insertC1.run(qId, q[0].includes('sky') ? 'Green' : q[0].includes('mix red and blue') ? 'Orange' : q[0].includes('bananas') ? 'Red' : q[0].includes('grass') ? 'Yellow' : 'Blue', 0, 3);
      insertC1.run(qId, q[0].includes('sky') ? 'Yellow' : q[0].includes('mix red and blue') ? 'Green' : q[0].includes('bananas') ? 'Blue' : q[0].includes('grass') ? 'Red' : 'Green', 0, 4);
    }

    // Activity 2: Animal Kingdom
    db.prepare(`INSERT INTO activities (game_id, title, description, category_id, difficulty, created_by, status, settings, time_limit, timer_type, lives_enabled, max_lives, randomize_questions, randomize_answers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      1,
      'Animal Kingdom',
      'Learn about animals and their characteristics!',
      3,
      'medium',
      2,
      'published',
      JSON.stringify({ allowSkipping: true, showFeedback: true, feedbackDelay: 1500 }),
      120,
      'per_activity',
      1,
      3,
      1,
      1
    );

    const activity2Id = db.prepare('SELECT last_insert_rowid() as id').get().id;

    db.prepare(`INSERT INTO activity_tags (activity_id, tag_id) VALUES (?, ?)`).run(activity2Id, 2);
    db.prepare(`INSERT INTO activity_tags (activity_id, tag_id) VALUES (?, ?)`).run(activity2Id, 9);

    const questions2 = [
      ['Which animal is known as the "King of the Jungle"?', 'image_text', 'The lion is called the King of the Jungle, even though it actually lives in savannas.', 1, 15],
      ['What is the largest animal on Earth?', 'image_text', 'The blue whale is the largest animal ever known to have lived on Earth.', 2, 15],
      ['Which animal is known for its black and white stripes?', 'image_text', 'Zebras are easily recognized by their distinctive black and white striped coats.', 3, 15],
      ['What do pandas primarily eat?', 'image_text', 'Giant pandas mainly eat bamboo, which makes up 99% of their diet.', 4, 15],
      ['Which bird is known for migrating the longest distance?', 'image_text', 'The Arctic tern migrates from Arctic to Antarctic and back each year, covering about 71,000 km.', 5, 15]
    ];

    const insertQ2 = db.prepare(`INSERT INTO questions (activity_id, type, question_text, explanation, sort_order, points_override) VALUES (?, ?, ?, ?, ?, ?)`);
    const insertC2 = db.prepare(`INSERT INTO choices (question_id, text, is_correct, sort_order) VALUES (?, ?, ?, ?)`);

    for (const q of questions2) {
      insertQ2.run(activity2Id, q[1], q[0], q[2], q[3], q[5]);
      const qId = db.prepare('SELECT last_insert_rowid() as id').get().id;

      if (q[0].includes('King of the Jungle')) {
        insertC2.run(qId, 'Lion', 1, 1);
        insertC2.run(qId, 'Tiger', 0, 2);
        insertC2.run(qId, 'Elephant', 0, 3);
        insertC2.run(qId, 'Bear', 0, 4);
      } else if (q[0].includes('largest animal')) {
        insertC2.run(qId, 'Blue Whale', 1, 1);
        insertC2.run(qId, 'Elephant', 0, 2);
        insertC2.run(qId, 'Giraffe', 0, 3);
        insertC2.run(qId, 'Hippopotamus', 0, 4);
      } else if (q[0].includes('stripes')) {
        insertC2.run(qId, 'Zebra', 1, 1);
        insertC2.run(qId, 'Tiger', 0, 2);
        insertC2.run(qId, 'Leopard', 0, 3);
        insertC2.run(qId, 'Cheetah', 0, 4);
      } else if (q[0].includes('pandas')) {
        insertC2.run(qId, 'Bamboo', 1, 1);
        insertC2.run(qId, 'Fish', 0, 2);
        insertC2.run(qId, 'Meat', 0, 3);
        insertC2.run(qId, 'Fruit', 0, 4);
      } else if (q[0].includes('migrating')) {
        insertC2.run(qId, 'Arctic Tern', 1, 1);
        insertC2.run(qId, 'Eagle', 0, 2);
        insertC2.run(qId, 'Penguin', 0, 3);
        insertC2.run(qId, 'Swan', 0, 4);
      }
    }

    // Initialize activity analytics
    db.prepare(`INSERT INTO activity_analytics (activity_id) VALUES (?)`).run(activity1Id);
    db.prepare(`INSERT INTO activity_analytics (activity_id) VALUES (?)`).run(activity2Id);

    // Create sample assignment
    db.prepare(`INSERT INTO assignments (activity_id, teacher_id, title, instructions, due_at, status) VALUES (?, ?, ?, ?, ?, ?)`).run(
      activity1Id,
      2,
      'Colors Quiz Homework',
      'Complete this quiz to practice your color vocabulary. You can retake it as many times as you want.',
      '2026-12-31 23:59:59',
      'active'
    );

    const assignmentId = db.prepare('SELECT last_insert_rowid() as id').get().id;
    db.prepare(`INSERT INTO assignment_students (assignment_id, student_id, status) VALUES (?, ?, ?)`).run(assignmentId, 3, 'assigned');
  });

  transaction();

  console.log('Database seeded successfully!');
  console.log('Users created:');
  console.log('  admin / admin123 (Admin)');
  console.log('  teacher / teacher123 (Teacher)');
  console.log('  student / student123 (Student)');
  console.log('Activities created: Colors Quiz, Animal Kingdom');
  console.log('Categories: 16');
  console.log('Tags: 11');
  console.log('Badges: 10');
  console.log('Achievements: 6');

  db.close();
}

seed();
