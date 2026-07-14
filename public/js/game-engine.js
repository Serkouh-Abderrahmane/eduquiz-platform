window.GameEngine = {
  state: {
    activityId: null,
    attemptId: null,
    activity: null,
    attempt: null,
    currentQuestion: null,
    currentQuestionIndex: 0,
    totalQuestions: 0,
    score: 0,
    lives: 0,
    maxLives: 0,
    timer: null,
    timeRemaining: 0,
    answered: false,
    selectedChoice: null,
    settings: null,
    startTime: null,
    questionStartTime: null,
    questionTimer: null,
    questionTimeRemaining: 0,
  },

  async init(activityId) {
    this.state.activityId = activityId;
    this.state.startTime = Date.now();

    try {
      const resp = await API.startGame(activityId);
      this.state.attemptId = resp.attempt.id;
      this.state.attempt = resp.attempt;
      this.state.activity = resp.activity;
      this.state.settings = resp.settings;
      this.state.totalQuestions = resp.total_questions;
      this.state.score = 0;
      this.state.maxLives = resp.settings.max_lives || 0;
      this.state.lives = resp.settings.lives_enabled ? resp.settings.max_lives : 999;
      this.state.currentQuestionIndex = 0;
      this.state.answered = false;
      this.state.selectedChoice = null;

      this._renderShell();
      if (resp.question) {
        this.state.currentQuestion = resp.question;
        this.renderQuestion(resp.question);
      } else {
        this.completeGame();
      }
    } catch (err) {
      this._renderError('Failed to start game. ' + (err.message || ''));
    }
  },

  _renderShell() {
    const container = document.getElementById('game-container') || document.body;
    container.innerHTML = `
      <div class="game-wrapper">
        <div class="game-header" id="game-header"></div>
        <div class="game-body" id="game-body">
          <div class="loading-spinner"><div class="spinner"></div><p>Loading question...</p></div>
        </div>
        <div class="game-feedback" id="game-feedback"></div>
      </div>
    `;
    this.renderHeader();
  },

  renderHeader() {
    const header = document.getElementById('game-header');
    if (!header) return;
    const progress = this.state.totalQuestions > 0
      ? Math.round((this.state.currentQuestionIndex / this.state.totalQuestions) * 100)
      : 0;
    const timerType = this.state.settings?.timer_type || 'none';
    const showTimer = timerType !== 'none' && this.state.questionTimeRemaining > 0;

    header.innerHTML = `
      <div class="header-left">
        <button class="btn-icon game-exit-btn" id="game-exit-btn" title="Exit game">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
        <div class="progress-bar-container">
          <div class="progress-bar" style="width:${progress}%"></div>
        </div>
        <span class="progress-text">${this.state.currentQuestionIndex + 1} / ${this.state.totalQuestions}</span>
      </div>
      <div class="header-center">
        ${showTimer ? '<div class="game-timer ' + (this.state.questionTimeRemaining <= 5 ? 'timer-warning' : '') + '" id="game-timer">' + Utils.formatTime(this.state.questionTimeRemaining) + '</div>' : ''}
      </div>
      <div class="header-right">
        <div class="score-display">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>
          <span id="score-display">${Utils.formatNumber(this.state.score)}</span>
        </div>
        <div class="lives-display" id="lives-display">
          ${this._renderHearts()}
        </div>
      </div>
    `;

    const exitBtn = document.getElementById('game-exit-btn');
    if (exitBtn) {
      exitBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to exit? Your progress will be lost.')) {
          this.destroy();
          window.location.href = '/';
        }
      });
    }
  },

  _renderHearts() {
    if (!this.state.settings?.lives_enabled) return '';
    let html = '';
    for (let i = 0; i < this.state.maxLives; i++) {
      const filled = i < this.state.lives;
      html += filled
        ? '<svg class="heart heart-full" width="20" height="20" viewBox="0 0 24 24" fill="#ef4444"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>'
        : '<svg class="heart heart-empty" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>';
    }
    return html;
  },

  renderQuestion(question) {
    const body = document.getElementById('game-body');
    if (!body) return;

    const q = question;
    let mediaHtml = '';

    if (q.type === 'image' || q.type === 'image_text') {
      if (q.image_id) {
        mediaHtml = '<div class="question-image"><img src="/uploads/images/' + q.image_id + '" alt="Question image" /></div>';
      }
    }

    if (q.type === 'audio') {
      if (q.audio_id) {
        mediaHtml = `
          <div class="question-audio">
            <button class="btn-audio-play" id="audio-play-btn" title="Play audio">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>
            </button>
          </div>
        `;
      }
    }

    let passageHtml = '';
    if (q.type === 'reading' && q.reading_passage) {
      passageHtml = '<div class="reading-passage">' + q.reading_passage + '</div>';
    }

    let questionText = q.question_text || '';
    if (q.type === 'fill_in') {
      questionText = questionText.replace(/_{2,}|<blank>|{blank}/gi, '<span class="fill-blank">______</span>');
    }

    const choices = q.choices || [];
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

    let choicesHtml = '<div class="choices-grid">';
    choices.forEach((choice, i) => {
      const choiceId = choice.id;
      const choiceText = choice.text || '';
      choicesHtml += `
        <button class="choice-btn" data-choice-id="${choiceId}" data-index="${i}" tabindex="0">
          <span class="choice-letter">${letters[i] || (i + 1)}</span>
          <span class="choice-text">${Utils.sanitize(choiceText)}</span>
          <span class="choice-check">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
          </span>
          <span class="choice-x">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </span>
        </button>
      `;
    });
    choicesHtml += '</div>';

    body.innerHTML = `
      <div class="question-card question-enter">
        ${passageHtml}
        ${mediaHtml}
        <div class="question-text">${questionText}</div>
        ${choicesHtml}
      </div>
    `;

    body.querySelectorAll('.choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const choiceId = btn.dataset.choiceId;
        this.selectChoice(choiceId, btn);
      });
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const choiceId = btn.dataset.choiceId;
          this.selectChoice(choiceId, btn);
        }
      });
    });

    this.state.questionStartTime = Date.now();
    this.renderHeader();
    this.startTimer();
  },

  async selectChoice(choiceId, btnElement) {
    if (this.state.answered) return;
    this.state.answered = true;
    this.state.selectedChoice = choiceId;
    this.stopTimer();

    const timeSpent = Math.floor((Date.now() - this.state.questionStartTime) / 1000);

    const allBtns = document.querySelectorAll('.choice-btn');
    allBtns.forEach(btn => {
      btn.disabled = true;
      btn.classList.add('disabled');
    });

    if (btnElement) {
      btnElement.classList.add('selected');
    }

    let result;
    try {
      result = await API.submitAnswer(this.state.attemptId, {
        question_id: parseInt(this.state.currentQuestion.id),
        choice_id: parseInt(choiceId),
        time_spent: timeSpent
      });
    } catch (err) {
      result = { is_correct: false };
    }

    const isCorrect = result.is_correct;
    const correctId = result.correct_choice_id;
    const explanation = result.explanation || '';
    const points = result.points_earned || 0;

    allBtns.forEach(btn => {
      const cid = btn.dataset.choiceId;
      if (String(cid) === String(correctId)) {
        btn.classList.add('correct');
      } else if (String(cid) === String(choiceId) && !isCorrect) {
        btn.classList.add('incorrect');
      }
    });

    if (isCorrect) {
      this.state.score = result.new_score || this.state.score;
      if (window.Toast) Toast.playCorrect();
    } else {
      if (this.state.settings?.lives_enabled) {
        this.state.lives = result.lives_remaining ?? this.state.lives - 1;
      }
      if (window.Toast) Toast.playIncorrect();
    }

    this.renderHeader();
    this.showFeedback({ correct: isCorrect, explanation, points });

    if (this.state.settings?.lives_enabled && this.state.lives <= 0) {
      setTimeout(() => this.completeGame(), 2500);
      return;
    }

    if (result.status === 'completed') {
      setTimeout(() => this.completeGame(), 2500);
    } else {
      setTimeout(() => this._advanceToNext(result.next_question), 2500);
    }
  },

  _advanceToNext(nextQuestion) {
    this.state.currentQuestionIndex++;
    this.state.answered = false;
    this.state.selectedChoice = null;

    if (nextQuestion) {
      this.state.currentQuestion = nextQuestion;
      this.renderQuestion(nextQuestion);
    } else if (this.state.currentQuestionIndex >= this.state.totalQuestions) {
      this.completeGame();
    } else {
      this.completeGame();
    }
  },

  showFeedback(result) {
    const feedbackEl = document.getElementById('game-feedback');
    if (!feedbackEl) return;

    const isCorrect = result.correct;
    const bannerClass = isCorrect ? 'feedback-correct' : 'feedback-incorrect';
    const icon = isCorrect
      ? '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
      : '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    const text = isCorrect ? 'Correct!' : 'Incorrect';
    const pointsHtml = isCorrect && result.points > 0
      ? '<span class="feedback-points">+' + result.points + ' pts</span>'
      : '';
    const explanationHtml = result.explanation
      ? '<p class="feedback-explanation">' + result.explanation + '</p>'
      : '';

    feedbackEl.innerHTML = `
      <div class="${bannerClass} feedback-enter">
        <div class="feedback-icon">${icon}</div>
        <div class="feedback-content">
          <div class="feedback-text">${text} ${pointsHtml}</div>
          ${explanationHtml}
        </div>
      </div>
    `;
    feedbackEl.classList.add('visible');

    setTimeout(() => {
      feedbackEl.classList.remove('visible');
      feedbackEl.innerHTML = '';
    }, 2200);
  },

  async completeGame() {
    this.stopTimer();

    let results;
    try {
      results = await API.getResults(this.state.attemptId);
    } catch (err) {
      results = {
        score: this.state.score,
        questions_total: this.state.totalQuestions,
        correct_answers: 0,
        time_spent: Math.floor((Date.now() - this.state.startTime) / 1000),
      };
    }

    if (window.Toast) Toast.playComplete();

    this.showCelebration();

    setTimeout(() => {
      const params = new URLSearchParams({
        attemptId: this.state.attemptId,
        activityId: this.state.activityId,
      });
      window.location.href = '/results.html?' + params.toString();
    }, 3500);
  },

  startTimer() {
    this.stopTimer();
    const timerType = this.state.settings?.timer_type || 'none';
    if (timerType === 'none') return;

    let duration = this.state.settings?.time_limit || 30;
    if (timerType === 'per_activity' && this.state.settings?.time_limit) {
      duration = this.state.settings.time_limit;
    }

    this.state.questionTimeRemaining = duration;
    this._updateTimerDisplay();

    this.state.questionTimer = setInterval(() => {
      this.state.questionTimeRemaining--;
      this._updateTimerDisplay();

      const timerEl = document.getElementById('game-timer');
      if (this.state.questionTimeRemaining <= 5 && timerEl) {
        timerEl.classList.add('timer-warning');
      }

      if (this.state.questionTimeRemaining <= 0) {
        this.stopTimer();
        if (!this.state.answered) {
          if (this.state.settings?.lives_enabled) {
            this.state.lives--;
          }
          this.state.answered = true;
          if (window.Toast) Toast.playIncorrect();
          this.showFeedback({ correct: false, explanation: 'Time\'s up!', points: 0 });
          this.renderHeader();
          setTimeout(() => this.completeGame(), 2500);
        }
      }
    }, 1000);
  },

  _updateTimerDisplay() {
    const timerEl = document.getElementById('game-timer');
    if (timerEl) {
      timerEl.textContent = Utils.formatTime(this.state.questionTimeRemaining);
    }
  },

  stopTimer() {
    if (this.state.questionTimer) {
      clearInterval(this.state.questionTimer);
      this.state.questionTimer = null;
    }
  },

  showCelebration() {
    if (window.Confetti) {
      Confetti.burst(120);
      setTimeout(() => Confetti.burst(80), 600);
      setTimeout(() => Confetti.burst(60), 1200);
    }

    const body = document.getElementById('game-body');
    if (body) {
      body.innerHTML = `
        <div class="game-complete-overlay">
          <div class="complete-animation">
            <div class="complete-icon">
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="8 12 11 15 16 9"/>
              </svg>
            </div>
            <h2 class="complete-title">Great Job!</h2>
            <p class="complete-subtitle">Calculating your results...</p>
            <div class="loading-dots"><span>.</span><span>.</span><span>.</span></div>
          </div>
        </div>
      `;
    }
  },

  _renderError(message) {
    const body = document.getElementById('game-body');
    if (body) {
      body.innerHTML = `
        <div class="game-error">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <h3>Oops!</h3>
          <p>${message}</p>
          <button class="btn btn-primary" onclick="window.location.href='/'">Go Home</button>
        </div>
      `;
    }
  },

  destroy() {
    this.stopTimer();
    this.state.currentQuestion = null;
    this.state.answered = false;
  }
};
