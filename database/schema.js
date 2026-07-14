function initializeDatabase(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      icon TEXT,
      config_schema TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin','teacher','student')) NOT NULL,
      display_name TEXT,
      avatar TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      last_login TEXT
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      parent_id INTEGER REFERENCES categories(id),
      icon TEXT,
      color TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      color TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      file_path TEXT,
      original_name TEXT,
      mime_type TEXT,
      size INTEGER,
      width INTEGER,
      height INTEGER,
      alt_text TEXT,
      uploaded_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audio_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      file_path TEXT,
      original_name TEXT,
      mime_type TEXT,
      size INTEGER,
      duration REAL,
      transcript TEXT,
      uploaded_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER REFERENCES games(id),
      title TEXT NOT NULL,
      description TEXT,
      category_id INTEGER REFERENCES categories(id),
      difficulty TEXT CHECK(difficulty IN ('easy','medium','hard')) DEFAULT 'medium',
      created_by INTEGER REFERENCES users(id),
      status TEXT CHECK(status IN ('draft','published','archived')) DEFAULT 'draft',
      settings TEXT,
      time_limit INTEGER DEFAULT 0,
      timer_type TEXT CHECK(timer_type IN ('none','per_question','per_activity')) DEFAULT 'none',
      lives_enabled INTEGER DEFAULT 0,
      max_lives INTEGER DEFAULT 3,
      scoring_config TEXT,
      feedback_config TEXT,
      randomize_questions INTEGER DEFAULT 1,
      randomize_answers INTEGER DEFAULT 1,
      question_pool_size INTEGER DEFAULT 0,
      cover_image TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      published_at TEXT
    );

    CREATE TABLE IF NOT EXISTS activity_tags (
      activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
      tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (activity_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
      type TEXT CHECK(type IN ('text','image','audio','image_text','fill_in','grammar','reading','mixed')) NOT NULL,
      question_text TEXT NOT NULL,
      explanation TEXT,
      image_id INTEGER REFERENCES images(id),
      audio_id INTEGER REFERENCES audio_files(id),
      reading_passage TEXT,
      sort_order INTEGER DEFAULT 0,
      difficulty_override TEXT,
      points_override INTEGER,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS choices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
      text TEXT,
      image_id INTEGER REFERENCES images(id),
      audio_id INTEGER REFERENCES audio_files(id),
      is_correct INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      explanation TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id INTEGER REFERENCES activities(id),
      user_id INTEGER REFERENCES users(id),
      status TEXT CHECK(status IN ('in_progress','completed','abandoned')) DEFAULT 'in_progress',
      score INTEGER DEFAULT 0,
      total_possible INTEGER DEFAULT 0,
      percentage REAL DEFAULT 0,
      time_spent INTEGER DEFAULT 0,
      current_question_index INTEGER DEFAULT 0,
      lives_remaining INTEGER,
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      answers_data TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER REFERENCES attempts(id) ON DELETE CASCADE,
      question_id INTEGER REFERENCES questions(id),
      choice_id INTEGER REFERENCES choices(id),
      is_correct INTEGER,
      time_spent INTEGER DEFAULT 0,
      points_earned INTEGER DEFAULT 0,
      answered_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_stats (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      xp INTEGER DEFAULT 0,
      coins INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      streak_days INTEGER DEFAULT 0,
      longest_streak INTEGER DEFAULT 0,
      last_active_date TEXT,
      total_activities_completed INTEGER DEFAULT 0,
      total_perfect_scores INTEGER DEFAULT 0,
      total_questions_answered INTEGER DEFAULT 0,
      total_correct_answers INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS badges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      category TEXT,
      criteria TEXT,
      xp_reward INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_badges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      badge_id INTEGER REFERENCES badges(id),
      earned_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, badge_id)
    );

    CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      type TEXT,
      target INTEGER,
      xp_reward INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      achievement_id INTEGER REFERENCES achievements(id),
      current_progress INTEGER DEFAULT 0,
      completed INTEGER DEFAULT 0,
      completed_at TEXT,
      UNIQUE(user_id, achievement_id)
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id INTEGER REFERENCES activities(id),
      teacher_id INTEGER REFERENCES users(id),
      title TEXT,
      instructions TEXT,
      due_at TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assignment_students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignment_id INTEGER REFERENCES assignments(id),
      student_id INTEGER REFERENCES users(id),
      status TEXT DEFAULT 'assigned',
      completed_at TEXT,
      UNIQUE(assignment_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS activity_analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id INTEGER REFERENCES activities(id) UNIQUE,
      total_attempts INTEGER DEFAULT 0,
      completed_attempts INTEGER DEFAULT 0,
      avg_score REAL DEFAULT 0,
      avg_time INTEGER DEFAULT 0,
      completion_rate REAL DEFAULT 0,
      most_missed_question_id INTEGER,
      last_attempt_at TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_activities_game_id ON activities(game_id);
    CREATE INDEX IF NOT EXISTS idx_activities_category_id ON activities(category_id);
    CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status);
    CREATE INDEX IF NOT EXISTS idx_activities_created_by ON activities(created_by);
    CREATE INDEX IF NOT EXISTS idx_questions_activity_id ON questions(activity_id);
    CREATE INDEX IF NOT EXISTS idx_questions_sort_order ON questions(sort_order);
    CREATE INDEX IF NOT EXISTS idx_choices_question_id ON choices(question_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_activity_id ON attempts(activity_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_user_id ON attempts(user_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_status ON attempts(status);
    CREATE INDEX IF NOT EXISTS idx_answers_attempt_id ON answers(attempt_id);
    CREATE INDEX IF NOT EXISTS idx_answers_question_id ON answers(question_id);
    CREATE INDEX IF NOT EXISTS idx_user_stats_user_id ON user_stats(user_id);
    CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
    CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
    CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug);
    CREATE INDEX IF NOT EXISTS idx_activity_tags_activity_id ON activity_tags(activity_id);
    CREATE INDEX IF NOT EXISTS idx_activity_tags_tag_id ON activity_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_assignments_activity_id ON assignments(activity_id);
    CREATE INDEX IF NOT EXISTS idx_assignments_teacher_id ON assignments(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_assignment_students_assignment_id ON assignment_students(assignment_id);
    CREATE INDEX IF NOT EXISTS idx_assignment_students_student_id ON assignment_students(student_id);
    CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
    CREATE INDEX IF NOT EXISTS idx_activity_analytics_activity_id ON activity_analytics(activity_id);
  `);

  return db;
}

module.exports = { initializeDatabase };
