window.ResultsApp = {
  async init() {
    Toast.init();

    const attemptId = Utils.getParam('attemptId') || Utils.getParam('attempt');
    const activityId = Utils.getParam('activityId') || Utils.getParam('activity');

    if (!attemptId) {
      this._showError('No results to display. Please complete a game first.');
      return;
    }

    let results;
    try {
      results = await API.getResults(attemptId);
    } catch (err) {
      this._showError('Failed to load results. ' + (err.message || ''));
      return;
    }

    this._results = results;
    this._activityId = activityId || results.activity_id;
    this._attemptId = attemptId;
    this.renderResults(results);
  },

  renderResults(results) {
    const app = document.getElementById('app') || document.body;
    const totalQ = results.questions_total || 1;
    const score = results.score || 0;
    const correct = results.correct_answers || 0;
    const percentage = results.percentage || (totalQ > 0 ? Math.round((correct / totalQ) * 100) : 0);
    const timeSpent = results.time_spent || 0;
    const xpEarned = results.xp_earned || 0;
    const coinsEarned = results.coins_earned || 0;
    const starCount = results.stars || (percentage >= 90 ? 3 : percentage >= 70 ? 2 : percentage >= 40 ? 1 : 0);
    const badgeEarned = results.badge_earned;
    const questionResults = results.questions || [];

    const circumference = 2 * Math.PI * 90;
    const dashOffset = circumference - (percentage / 100) * circumference;

    let questionBreakdownHtml = '';
    if (Array.isArray(questionResults) && questionResults.length > 0) {
      const qItems = questionResults.map((qr, i) => {
        const qCorrect = qr.is_correct;
        const qText = Utils.sanitize(Utils.truncate(qr.question_text || 'Question ' + (i + 1), 60));
        const icon = qCorrect
          ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
          : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
        const userAnswer = qr.user_choice ? qr.user_choice.text : 'No answer';
        const correctAnswer = qr.correct_choice ? qr.correct_choice.text : '';
        const explanation = qr.explanation ? '<div class="breakdown-explanation">' + Utils.sanitize(qr.explanation) + '</div>' : '';
        return `
          <div class="breakdown-item ${qCorrect ? 'breakdown-correct' : 'breakdown-incorrect'}">
            <span class="breakdown-icon">${icon}</span>
            <div class="breakdown-details">
              <span class="breakdown-text">${qText}</span>
              ${!qCorrect ? '<div class="breakdown-answers">Your answer: ' + Utils.sanitize(userAnswer) + (correctAnswer ? ' | Correct: ' + Utils.sanitize(correctAnswer) : '') + '</div>' : ''}
              ${explanation}
            </div>
          </div>
        `;
      }).join('');
      questionBreakdownHtml = `
        <div class="results-section">
          <h3 class="section-title">Question Review</h3>
          <div class="breakdown-list">${qItems}</div>
        </div>
      `;
    }

    let badgeHtml = '';
    if (badgeEarned) {
      badgeHtml = `
        <div class="results-section">
          <h3 class="section-title">Badge Earned!</h3>
          <div class="badge-item">
            <div class="badge-icon">${badgeEarned.icon || '🏅'}</div>
            <span class="badge-name">${Utils.sanitize(badgeEarned.name || 'Badge')}</span>
          </div>
        </div>
      `;
    }

    const starsHtml = [0, 1, 2].map(i => {
      const earned = i < starCount;
      return `<span class="star ${earned ? 'star-earned' : ''}" data-index="${i}">★</span>`;
    }).join('');

    app.innerHTML = `
      <div class="results-wrapper">
        <div class="results-card">
          <h1 class="results-title">${percentage >= 70 ? 'Great Job!' : percentage >= 40 ? 'Good Try!' : 'Keep Practicing!'}</h1>
          <p class="results-subtitle">${results.activity_title || 'Quiz Complete'}</p>

          <div class="score-circle-wrapper">
            <svg class="score-circle" width="200" height="200" viewBox="0 0 200 200">
              <circle class="score-bg" cx="100" cy="100" r="90" fill="none" stroke="#e5e7eb" stroke-width="12"/>
              <circle class="score-fill" id="score-fill" cx="100" cy="100" r="90" fill="none"
                stroke="#3b82f6" stroke-width="12" stroke-linecap="round"
                stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}"
                transform="rotate(-90 100 100)"/>
            </svg>
            <div class="score-center">
              <span class="score-percent" id="score-percent">0</span>
              <span class="score-label">percent</span>
            </div>
          </div>

          <div class="stars-container" id="stars-container">
            ${starsHtml}
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-icon stat-icon-correct">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="stat-value" id="stat-correct">${correct} / ${totalQ}</div>
              <div class="stat-label">Correct</div>
            </div>
            <div class="stat-card">
              <div class="stat-icon stat-icon-time">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <div class="stat-value" id="stat-time">${Utils.formatDuration(timeSpent)}</div>
              <div class="stat-label">Time</div>
            </div>
            <div class="stat-card">
              <div class="stat-icon stat-icon-xp">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10"/></svg>
              </div>
              <div class="stat-value" id="stat-xp">+${xpEarned}</div>
              <div class="stat-label">XP Earned</div>
            </div>
            <div class="stat-card">
              <div class="stat-icon stat-icon-coins">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M8 9.5h6M8 14.5h6"/></svg>
              </div>
              <div class="stat-value" id="stat-coins">+${coinsEarned}</div>
              <div class="stat-label">Coins</div>
            </div>
          </div>

          ${badgeHtml}
          ${questionBreakdownHtml}

          <div class="results-actions">
            <button class="btn btn-primary btn-lg" id="play-again-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21"/></svg>
              Play Again
            </button>
            <button class="btn btn-outline btn-lg" id="back-home-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              Back to Home
            </button>
          </div>
        </div>
      </div>
    `;

    this.animateScore(percentage, circumference, dashOffset);
    this.animateStars(starCount);

    document.getElementById('play-again-btn').addEventListener('click', () => {
      if (this._activityId) {
        window.location.href = '/game.html?id=' + this._activityId;
      } else {
        window.location.href = '/game.html';
      }
    });

    document.getElementById('back-home-btn').addEventListener('click', () => {
      window.location.href = '/';
    });

    if (starCount >= 2) {
      setTimeout(() => {
        if (window.Confetti) Confetti.burst(80);
      }, 800);
    }
  },

  animateScore(targetPercent, circumference, dashOffset) {
    const scoreFill = document.getElementById('score-fill');
    const scorePercent = document.getElementById('score-percent');
    if (!scoreFill || !scorePercent) return;

    let current = 0;
    const step = targetPercent / 40;
    const interval = setInterval(() => {
      current += step;
      if (current >= targetPercent) {
        current = targetPercent;
        clearInterval(interval);
      }
      const val = Math.round(current);
      scorePercent.textContent = val + '%';
      const offset = circumference - (current / 100) * circumference;
      scoreFill.style.strokeDashoffset = offset;
    }, 30);
  },

  animateStars(count) {
    const stars = document.querySelectorAll('.star');
    stars.forEach((star, i) => {
      star.style.opacity = '0';
      star.style.transform = 'scale(0)';
      star.style.transition = 'none';
    });

    for (let i = 0; i < count && i < stars.length; i++) {
      setTimeout(() => {
        const star = stars[i];
        star.classList.add('star-earned');
        star.style.transition = 'opacity 0.3s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
        star.style.opacity = '1';
        star.style.transform = 'scale(1)';
        if (window.Toast) Toast.playStar();
      }, 600 + i * 500);
    }
  },

  _showError(message) {
    const app = document.getElementById('app') || document.body;
    app.innerHTML = `
      <div class="results-wrapper">
        <div class="results-card error-card">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <h2>Oops!</h2>
          <p>${message}</p>
          <div class="results-actions">
            <button class="btn btn-primary" onclick="window.location.href='/'">Go Home</button>
            <button class="btn btn-outline" onclick="window.location.href='/game.html'">Browse Activities</button>
          </div>
        </div>
      </div>
    `;
  }
};

document.addEventListener('DOMContentLoaded', () => ResultsApp.init());
