window.GameApp = {
  async init() {
    Toast.init();

    const activityId = Utils.getParam('id') || Utils.getParam('activityId');

    if (activityId) {
      if (!API.isLoggedIn()) {
        this.showLoginModal(activityId);
        return;
      }
      this._startGame(activityId);
    } else {
      this.showActivitySelect();
    }

    document.addEventListener('keydown', (e) => {
      if (!GameEngine.state.answered) {
        if (e.key >= '1' && e.key <= '6') {
          const index = parseInt(e.key) - 1;
          const btns = document.querySelectorAll('.choice-btn:not(.disabled)');
          if (btns[index]) {
            btns[index].click();
          }
        }
        const letterMap = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5 };
        const lower = e.key.toLowerCase();
        if (lower in letterMap) {
          const btns = document.querySelectorAll('.choice-btn:not(.disabled)');
          if (btns[letterMap[lower]]) {
            btns[letterMap[lower]].click();
          }
        }
      }
    });
  },

  async _startGame(activityId) {
    try {
      await GameEngine.init(activityId);
    } catch (err) {
      Toast.error('Could not start game: ' + (err.message || 'Unknown error'));
    }
  },

  showLoginModal(activityId) {
    const app = document.getElementById('app') || document.body;
    app.innerHTML = `
      <div class="login-prompt-wrapper">
        <div class="login-prompt-card">
          <div class="login-prompt-icon">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="1.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
          </div>
          <h2>Login to Play</h2>
          <p>Sign in to track your progress and earn rewards.</p>
          <form id="login-form" class="login-prompt-form">
            <div class="form-group">
              <label for="login-username">Username</label>
              <input type="text" id="login-username" name="username" required autocomplete="username" placeholder="Enter username" />
            </div>
            <div class="form-group">
              <label for="login-password">Password</label>
              <input type="password" id="login-password" name="password" required autocomplete="current-password" placeholder="Enter password" />
            </div>
            <div id="login-error" class="form-error" style="display:none;"></div>
            <button type="submit" class="btn btn-primary btn-block" id="login-submit-btn">Sign In</button>
          </form>
          <div class="login-prompt-divider"><span>or</span></div>
          <button class="btn btn-outline btn-block" id="play-as-guest-btn">Play as Guest</button>
          <p class="login-prompt-footer">Don't have an account? <a href="/register.html">Sign up</a></p>
        </div>
      </div>
    `;

    const form = document.getElementById('login-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      const errorEl = document.getElementById('login-error');
      const submitBtn = document.getElementById('login-submit-btn');

      if (!username || !password) {
        errorEl.textContent = 'Please fill in all fields.';
        errorEl.style.display = 'block';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in...';

      try {
        await API.login(username, password);
        this._startGame(activityId);
      } catch (err) {
        errorEl.textContent = err.message || 'Login failed.';
        errorEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
      }
    });

    document.getElementById('play-as-guest-btn').addEventListener('click', () => {
      this._startGame(activityId);
    });
  },

  async showActivitySelect() {
    const app = document.getElementById('app') || document.body;
    app.innerHTML = `
      <div class="select-screen">
        <header class="select-header">
          <h1>Choose an Activity</h1>
          <p>Pick a quiz to start playing</p>
        </header>
        <div class="select-filters">
          <div class="filter-group">
            <input type="text" id="activity-search" class="form-input" placeholder="Search activities..." />
          </div>
          <div class="filter-group">
            <select id="filter-category" class="form-select">
              <option value="">All Categories</option>
            </select>
          </div>
          <div class="filter-group">
            <select id="filter-difficulty" class="form-select">
              <option value="">All Difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>
        <div id="activities-list" class="activities-grid">
          <div class="loading-spinner"><div class="spinner"></div><p>Loading activities...</p></div>
        </div>
      </div>
    `;

    try {
      const catResp = await API.getActivities({ status: 'published' });
      const activities = catResp.activities || [];
      const categoryMap = {};
      activities.forEach(a => {
        if (a.category_id && a.category_name && !categoryMap[a.category_id]) {
          categoryMap[a.category_id] = a.category_name;
        }
      });
      const catSelect = document.getElementById('filter-category');
      Object.entries(categoryMap).forEach(([id, name]) => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = name;
        catSelect.appendChild(opt);
      });
    } catch (_) {}

    await this._loadActivities();

    document.getElementById('activity-search').addEventListener('input', Utils.debounce(() => this._loadActivities(), 300));
    document.getElementById('filter-category').addEventListener('change', () => this._loadActivities());
    document.getElementById('filter-difficulty').addEventListener('change', () => this._loadActivities());
  },

  async _loadActivities() {
    const listEl = document.getElementById('activities-list');
    if (!listEl) return;

    const search = document.getElementById('activity-search')?.value || '';
    const category = document.getElementById('filter-category')?.value || '';
    const difficulty = document.getElementById('filter-difficulty')?.value || '';

    listEl.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading...</p></div>';

    try {
      const params = {};
      if (search) params.search = search;
      if (category) params.category_id = category;
      if (difficulty) params.difficulty = difficulty;

      const resp = await API.getActivities(params);
      const activities = resp.activities || [];

      if (!Array.isArray(activities) || activities.length === 0) {
        listEl.innerHTML = '<div class="empty-state"><p>No activities found.</p></div>';
        return;
      }

      const diffColors = { easy: '#22c55e', medium: '#eab308', hard: '#ef4444' };
      listEl.innerHTML = activities.map(a => {
        const id = a.id;
        const title = Utils.sanitize(a.title || 'Untitled');
        const desc = Utils.truncate(a.description || '', 80);
        const diff = (a.difficulty || 'medium').toLowerCase();
        const diffColor = diffColors[diff] || '#6b7280';
        const qCount = a.question_count || 0;
        const catName = a.category_name || '';

        return `
          <div class="activity-card" tabindex="0" data-id="${id}">
            <div class="activity-card-header">
              <span class="difficulty-badge" style="background:${diffColor}">${Utils.capitalize(diff)}</span>
              ${catName ? '<span class="category-badge">' + Utils.sanitize(catName) + '</span>' : ''}
            </div>
            <h3 class="activity-card-title">${title}</h3>
            <p class="activity-card-desc">${Utils.sanitize(desc)}</p>
            <div class="activity-card-footer">
              <span class="question-count">${qCount} question${qCount !== 1 ? 's' : ''}</span>
              <button class="btn btn-primary btn-sm play-btn" data-id="${id}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>
                Play
              </button>
            </div>
          </div>
        `;
      }).join('');

      listEl.querySelectorAll('.play-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.location.href = '/game.html?id=' + btn.dataset.id;
        });
      });

      listEl.querySelectorAll('.activity-card').forEach(card => {
        card.addEventListener('click', () => {
          window.location.href = '/game.html?id=' + card.dataset.id;
        });
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            window.location.href = '/game.html?id=' + card.dataset.id;
          }
        });
      });
    } catch (err) {
      listEl.innerHTML = '<div class="error-state"><p>Failed to load activities. Please try again.</p></div>';
    }
  }
};

document.addEventListener('DOMContentLoaded', () => GameApp.init());
