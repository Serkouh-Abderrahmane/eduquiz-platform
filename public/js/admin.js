window.AdminApp = {
  state: {
    currentSection: 'dashboard',
    activities: [],
    categories: [],
    tags: [],
    users: [],
    badges: [],
    assignments: [],
    editingActivity: null,
    editingQuestion: null,
    page: 1,
    totalPages: 1,
    filters: {},
    search: '',
    questionsList: [],
    selectedChoices: []
  },

  async init() {
    Toast.init();

    if (!API.isLoggedIn()) {
      window.location.href = '/login.html?redirect=/admin.html';
      return;
    }
    if (!API.isAdmin() && !API.isTeacher()) {
      document.getElementById('app').innerHTML = '<div class="unauthorized-page"><h2>Access Denied</h2><p>You need admin or teacher privileges.</p><a href="/" class="btn btn-primary">Go Home</a></div>';
      return;
    }

    this._setupNav();
    this._setupEventDelegation();

    const hash = window.location.hash.slice(1) || 'dashboard';
    this.navigate(hash);

    window.addEventListener('hashchange', () => {
      const h = window.location.hash.slice(1) || 'dashboard';
      if (h !== this.state.currentSection) {
        this.navigate(h);
      }
    });
  },

  _setupNav() {
    const navItems = document.querySelectorAll('.sidebar-nav-item, [data-nav]');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const section = item.dataset.section || item.dataset.nav || item.getAttribute('href')?.slice(1);
        if (section) this.navigate(section);
      });
    });
  },

  _setupEventDelegation() {
    document.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      const id = target.dataset.id;
      const value = target.dataset.value;
      this._handleAction(action, id, value, target);
    });
  },

  async _handleAction(action, id, value, target) {
    switch (action) {
      case 'edit-activity': await this.openActivityEditor(id); break;
      case 'delete-activity': this.showConfirm('Delete this activity?', async () => { await API.deleteActivity(id); Toast.success('Activity deleted'); await this.loadActivities(); }); break;
      case 'duplicate-activity': try { await API.duplicateActivity(id); Toast.success('Activity duplicated'); await this.loadActivities(); } catch (err) { Toast.error(err.message); } break;
      case 'publish-activity': try { await API.publishActivity(id); Toast.success('Activity published'); await this.loadActivities(); } catch (err) { Toast.error(err.message); } break;
      case 'unpublish-activity': try { await API.unpublishActivity(id); Toast.success('Unpublished'); await this.loadActivities(); } catch (err) { Toast.error(err.message); } break;
      case 'archive-activity': try { await API.archiveActivity(id); Toast.success('Archived'); await this.loadActivities(); } catch (err) { Toast.error(err.message); } break;
      case 'restore-activity': try { await API.restoreActivity(id); Toast.success('Restored'); await this.loadActivities(); } catch (err) { Toast.error(err.message); } break;
      case 'preview-activity': this.previewActivity(id); break;
      case 'add-question': this.openQuestionBuilder(null); break;
      case 'edit-question': { const q = this.state.questionsList.find(x => (x.id || x._id) === id); this.openQuestionBuilder(q); break; }
      case 'delete-question': this.showConfirm('Delete this question?', async () => { await API.deleteQuestion(id); Toast.success('Question deleted'); await this._refreshQuestions(); }); break;
      case 'duplicate-question': try { await API.duplicateQuestion(id); Toast.success('Question duplicated'); await this._refreshQuestions(); } catch (err) { Toast.error(err.message); } break;
      case 'add-choice': this.addChoice(); break;
      case 'remove-choice': this.removeChoice(parseInt(value)); break;
      case 'add-tag': await this._addTag(); break;
      case 'delete-tag': this.showConfirm('Delete this tag?', async () => { await API.deleteTag(id); Toast.success('Tag deleted'); await this.loadTags(); }); break;
      case 'delete-category': this.showConfirm('Delete this category?', async () => { await API.deleteCategory(id); Toast.success('Category deleted'); await this.loadCategories(); }); break;
      case 'delete-badge': Toast.info('Badge deletion coming soon'); break;
      case 'change-role': await this._changeUserRole(id, value); break;
      case 'create-assignment': Toast.info('Assignment creation coming soon'); break;
      case 'add-category': this._showAddCategoryModal(); break;
      case 'add-badge': this._showAddBadgeModal(); break;
      case 'save-activity': await this._saveActivity(); break;
      case 'save-question': await this._saveQuestion(); break;
      case 'close-modal': this.closeModal(); break;
      case 'page': this.state.page = parseInt(value); await this.loadActivities(); break;
      default: break;
    }
  },

  navigate(section) {
    this.state.currentSection = section;
    window.location.hash = section;

    document.querySelectorAll('.sidebar-nav-item, [data-nav]').forEach(item => {
      item.classList.toggle('active', (item.dataset.section || item.dataset.nav || item.getAttribute('href')?.slice(1)) === section);
    });

    const titleMap = {
      dashboard: 'Dashboard',
      activities: 'Activities',
      categories: 'Categories',
      tags: 'Tags',
      users: 'Users',
      badges: 'Badges',
      assignments: 'Assignments'
    };
    const titleEl = document.getElementById('page-title') || document.querySelector('.page-title');
    if (titleEl) titleEl.textContent = titleMap[section] || 'Admin';

    switch (section) {
      case 'dashboard': this.loadDashboard(); break;
      case 'activities': this.loadActivities(); break;
      case 'categories': this.loadCategories(); break;
      case 'tags': this.loadTags(); break;
      case 'users': this.loadUsers(); break;
      case 'badges': this.loadBadges(); break;
      case 'assignments': this.loadAssignments(); break;
      default: this.loadDashboard();
    }
  },

  // ═══════════════════════════════════════════════════════════
  // DASHBOARD
  // ═══════════════════════════════════════════════════════════
  async loadDashboard() {
    const content = this._getContent();
    content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading dashboard...</p></div>';

    try {
      const stats = await API.getDashboardStats();
      this.renderDashboard(stats);
    } catch (err) {
      content.innerHTML = '<div class="error-state"><p>Failed to load dashboard.</p></div>';
    }
  },

  renderDashboard(stats) {
    const content = this._getContent();
    const s = stats.data || stats;

    const statCards = [
      { label: 'Total Users', value: Utils.formatNumber(s.totalUsers || s.users || 0), icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>', color: '#3b82f6' },
      { label: 'Activities', value: Utils.formatNumber(s.totalActivities || s.activities || 0), icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>', color: '#22c55e' },
      { label: 'Attempts', value: Utils.formatNumber(s.totalAttempts || s.attempts || 0), icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10"/></svg>', color: '#eab308' },
      { label: 'Avg Score', value: (s.avgScore || s.averageScore || 0) + '%', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>', color: '#a855f7' }
    ];

    let recentHtml = '';
    const recent = s.recentActivities || s.recent || [];
    if (Array.isArray(recent) && recent.length > 0) {
      const rows = recent.slice(0, 5).map(a => `
        <tr>
          <td>${Utils.sanitize(a.title || 'Untitled')}</td>
          <td>${Utils.formatDate(a.createdAt || a.created_at || a.date || new Date())}</td>
          <td>${a.attempts || 0}</td>
        </tr>
      `).join('');
      recentHtml = `
        <div class="admin-card">
          <h3 class="admin-card-title">Recent Activities</h3>
          <table class="admin-table">
            <thead><tr><th>Title</th><th>Created</th><th>Attempts</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    }

    content.innerHTML = `
      <div class="stats-grid admin-stats-grid">
        ${statCards.map(sc => `
          <div class="stat-card admin-stat-card">
            <div class="stat-icon" style="background:${sc.color}20;color:${sc.color}">${sc.icon}</div>
            <div class="stat-info">
              <div class="stat-value">${sc.value}</div>
              <div class="stat-label">${sc.label}</div>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="admin-quick-actions">
        <h3 class="admin-card-title">Quick Actions</h3>
        <div class="quick-actions-row">
          <button class="btn btn-primary" data-action="edit-activity" data-id="">New Activity</button>
          <button class="btn btn-outline" data-nav="activities" data-section="activities">View All Activities</button>
          <button class="btn btn-outline" data-nav="users" data-section="users">Manage Users</button>
        </div>
      </div>
      ${recentHtml}
    `;
  },

  // ═══════════════════════════════════════════════════════════
  // ACTIVITIES
  // ═══════════════════════════════════════════════════════════
  async loadActivities() {
    const content = this._getContent();
    content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading activities...</p></div>';

    try {
      const params = { page: this.state.page, limit: 10 };
      if (this.state.search) params.search = this.state.search;
      if (this.state.filters.category) params.category = this.state.filters.category;
      if (this.state.filters.difficulty) params.difficulty = this.state.filters.difficulty;
      if (this.state.filters.status) params.status = this.state.filters.status;
      if (this.state.filters.gameType) params.gameType = this.state.filters.gameType;

      const resp = await API.getActivities(params);
      this.state.activities = resp.activities || resp.data || resp || [];
      this.state.totalPages = resp.totalPages || resp.total_pages || 1;
      this.state.page = resp.page || resp.currentPage || this.state.page;

      this.renderActivitiesList();
    } catch (err) {
      content.innerHTML = '<div class="error-state"><p>Failed to load activities.</p></div>';
    }
  },

  renderActivitiesList() {
    const content = this._getContent();
    const activities = this.state.activities;
    const diffColors = { easy: '#22c55e', medium: '#eab308', hard: '#ef4444' };
    const catOptions = this.state.categories.map(c => `<option value="${c.id || c._id}" ${this.state.filters.category === (c.id || c._id) ? 'selected' : ''}>${Utils.sanitize(c.name)}</option>`).join('');

    const rows = activities.map(a => {
      const id = a.id || a._id;
      const title = Utils.sanitize(Utils.truncate(a.title || '', 40));
      const cat = a.category?.name || a.categoryName || '-';
      const diff = (a.difficulty || 'medium').toLowerCase();
      const status = (a.status || 'draft').toLowerCase();
      const qCount = a.questionCount || a.questions_count || 0;
      const attempts = a.attempts || a.attemptsCount || 0;
      const avgScore = a.avgScore || a.averageScore || 0;

      return `
        <tr>
          <td><strong>${title}</strong></td>
          <td>${Utils.sanitize(cat)}</td>
          <td><span class="difficulty-badge" style="background:${diffColors[diff] || '#6b7280'}">${Utils.capitalize(diff)}</span></td>
          <td>${this.formatStatus(status)}</td>
          <td>${qCount}</td>
          <td>${attempts}</td>
          <td>${avgScore}%</td>
          <td class="actions-cell">
            <button class="btn-icon" data-action="edit-activity" data-id="${id}" title="Edit"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button class="btn-icon" data-action="preview-activity" data-id="${id}" title="Preview"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
            <button class="btn-icon" data-action="duplicate-activity" data-id="${id}" title="Duplicate"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>
            ${status === 'draft' ? '<button class="btn-icon" data-action="publish-activity" data-id="' + id + '" title="Publish"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></button>' : ''}
            ${status === 'published' ? '<button class="btn-icon" data-action="unpublish-activity" data-id="' + id + '" title="Unpublish"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></button>' : ''}
            ${status !== 'archived' ? '<button class="btn-icon" data-action="archive-activity" data-id="' + id + '" title="Archive"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg></button>' : ''}
            ${status === 'archived' ? '<button class="btn-icon" data-action="restore-activity" data-id="' + id + '" title="Restore"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg></button>' : ''}
            <button class="btn-icon btn-icon-danger" data-action="delete-activity" data-id="${id}" title="Delete"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
          </td>
        </tr>
      `;
    }).join('');

    let paginationHtml = '';
    if (this.state.totalPages > 1) {
      const pages = [];
      for (let i = 1; i <= this.state.totalPages; i++) {
        pages.push('<button class="btn btn-sm ' + (i === this.state.page ? 'btn-primary' : 'btn-outline') + '" data-action="page" data-value="' + i + '">' + i + '</button>');
      }
      paginationHtml = '<div class="pagination">' + pages.join('') + '</div>';
    }

    content.innerHTML = `
      <div class="admin-toolbar">
        <div class="toolbar-filters">
          <input type="text" id="activity-search-input" class="form-input" placeholder="Search..." value="${Utils.sanitize(this.state.search)}" />
          <select id="filter-cat" class="form-select"><option value="">All Categories</option>${catOptions}</select>
          <select id="filter-diff" class="form-select">
            <option value="">All Difficulties</option>
            <option value="easy" ${this.state.filters.difficulty === 'easy' ? 'selected' : ''}>Easy</option>
            <option value="medium" ${this.state.filters.difficulty === 'medium' ? 'selected' : ''}>Medium</option>
            <option value="hard" ${this.state.filters.difficulty === 'hard' ? 'selected' : ''}>Hard</option>
          </select>
          <select id="filter-stat" class="form-select">
            <option value="">All Statuses</option>
            <option value="draft" ${this.state.filters.status === 'draft' ? 'selected' : ''}>Draft</option>
            <option value="published" ${this.state.filters.status === 'published' ? 'selected' : ''}>Published</option>
            <option value="archived" ${this.state.filters.status === 'archived' ? 'selected' : ''}>Archived</option>
          </select>
        </div>
        <button class="btn btn-primary" data-action="edit-activity" data-id="">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Activity
        </button>
      </div>
      <div class="admin-table-wrapper">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Title</th><th>Category</th><th>Difficulty</th><th>Status</th><th>Questions</th><th>Attempts</th><th>Avg Score</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="8" class="empty-row">No activities found.</td></tr>'}</tbody>
        </table>
      </div>
      ${paginationHtml}
    `;

    const searchInput = document.getElementById('activity-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', Utils.debounce(() => {
        this.state.search = searchInput.value;
        this.state.page = 1;
        this.loadActivities();
      }, 300));
    }
    ['filter-cat', 'filter-diff', 'filter-stat'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => {
          if (id === 'filter-cat') this.state.filters.category = el.value;
          if (id === 'filter-diff') this.state.filters.difficulty = el.value;
          if (id === 'filter-stat') this.state.filters.status = el.value;
          this.state.page = 1;
          this.loadActivities();
        });
      }
    });
  },

  // ═══════════════════════════════════════════════════════════
  // ACTIVITY EDITOR
  // ═══════════════════════════════════════════════════════════
  async openActivityEditor(activityId = null) {
    let activity = null;
    if (activityId) {
      try {
        const resp = await API.getActivity(activityId);
        activity = resp.activity || resp.data || resp;
        const qResp = await API.getActivityQuestions(activityId);
        this.state.questionsList = qResp.questions || qResp.data || [];
      } catch (err) {
        Toast.error('Failed to load activity.');
        return;
      }
    } else {
      this.state.questionsList = [];
    }
    this.state.editingActivity = activity;
    this.renderActivityEditor(activity);
  },

  renderActivityEditor(activity) {
    const content = this._getContent();
    const isNew = !activity;
    const title = isNew ? 'New Activity' : 'Edit: ' + (activity.title || '');

    const catOptions = this.state.categories.map(c => {
      const cid = c.id || c._id;
      const selected = activity?.category?._id === cid || activity?.category === cid ? 'selected' : '';
      return `<option value="${cid}" ${selected}>${Utils.sanitize(c.name)}</option>`;
    }).join('');

    const settings = activity?.settings || {};
    const qList = this.state.questionsList;

    const questionItems = qList.map((q, i) => {
      const qid = q.id || q._id;
      const qText = Utils.sanitize(Utils.truncate(q.text || q.question || '', 60));
      const type = q.type || 'text';
      return `
        <div class="question-list-item" data-question-id="${qid}">
          <span class="question-number">${i + 1}</span>
          <span class="question-type-badge">${Utils.capitalize(type)}</span>
          <span class="question-text-preview">${qText}</span>
          <span class="question-item-actions">
            <button class="btn-icon" data-action="edit-question" data-id="${qid}" title="Edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button class="btn-icon" data-action="duplicate-question" data-id="${qid}" title="Duplicate"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>
            <button class="btn-icon btn-icon-danger" data-action="delete-question" data-id="${qid}" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
          </span>
        </div>
      `;
    }).join('');

    content.innerHTML = `
      <div class="editor-wrapper">
        <div class="editor-header">
          <button class="btn btn-outline btn-sm" id="editor-back-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
            Back
          </button>
          <h2>${Utils.sanitize(title)}</h2>
          <button class="btn btn-primary" data-action="save-activity">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Save
          </button>
        </div>

        <div class="editor-tabs" id="editor-tabs">
          <button class="tab-btn active" data-tab="details">Details</button>
          <button class="tab-btn" data-tab="questions">Questions (${qList.length})</button>
          <button class="tab-btn" data-tab="settings">Settings</button>
        </div>

        <div class="editor-tab-content" id="tab-content">
          <div class="tab-pane active" id="tab-details">
            <div class="form-grid">
              <div class="form-group full-width">
                <label for="act-title">Title *</label>
                <input type="text" id="act-title" class="form-input" value="${Utils.sanitize(activity?.title || '')}" placeholder="Activity title" required />
              </div>
              <div class="form-group full-width">
                <label for="act-desc">Description</label>
                <textarea id="act-desc" class="form-textarea" rows="3" placeholder="Activity description">${Utils.sanitize(activity?.description || '')}</textarea>
              </div>
              <div class="form-group">
                <label for="act-category">Category</label>
                <select id="act-category" class="form-select">
                  <option value="">None</option>
                  ${catOptions}
                </select>
              </div>
              <div class="form-group">
                <label for="act-difficulty">Difficulty</label>
                <select id="act-difficulty" class="form-select">
                  <option value="easy" ${activity?.difficulty === 'easy' ? 'selected' : ''}>Easy</option>
                  <option value="medium" ${(!activity || activity?.difficulty === 'medium') ? 'selected' : ''}>Medium</option>
                  <option value="hard" ${activity?.difficulty === 'hard' ? 'selected' : ''}>Hard</option>
                </select>
              </div>
              <div class="form-group full-width">
                <label for="act-cover">Cover Image URL</label>
                <input type="text" id="act-cover" class="form-input" value="${Utils.sanitize(activity?.coverImage || activity?.cover_image || '')}" placeholder="https://..." />
              </div>
            </div>
          </div>

          <div class="tab-pane" id="tab-questions" style="display:none;">
            <div class="questions-toolbar">
              <h3>Questions (${qList.length})</h3>
              <button class="btn btn-primary btn-sm" data-action="add-question">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Question
              </button>
            </div>
            <div class="questions-list" id="questions-list">
              ${questionItems || '<p class="empty-text">No questions yet. Add your first question!</p>'}
            </div>
          </div>

          <div class="tab-pane" id="tab-settings" style="display:none;">
            <div class="form-grid">
              <div class="form-group">
                <label for="set-timer">Timer Type</label>
                <select id="set-timer" class="form-select">
                  <option value="none" ${settings.timer_type === 'none' || !settings.timer_type ? 'selected' : ''}>No Timer</option>
                  <option value="per_question" ${settings.timer_type === 'per_question' ? 'selected' : ''}>Per Question</option>
                  <option value="total" ${settings.timer_type === 'total' ? 'selected' : ''}>Total Time</option>
                </select>
              </div>
              <div class="form-group">
                <label for="set-time-per-q">Time Per Question (seconds)</label>
                <input type="number" id="set-time-per-q" class="form-input" value="${settings.time_per_question || 15}" min="5" max="120" />
              </div>
              <div class="form-group">
                <label for="set-total-time">Total Time (seconds)</label>
                <input type="number" id="set-total-time" class="form-input" value="${settings.total_time || 300}" min="30" max="3600" />
              </div>
              <div class="form-group">
                <label for="set-lives">Max Lives</label>
                <input type="number" id="set-lives" class="form-input" value="${settings.max_lives || 3}" min="1" max="10" />
              </div>
              <div class="form-group">
                <label for="set-scoring">Scoring Mode</label>
                <select id="set-scoring" class="form-select">
                  <option value="standard" ${settings.scoring === 'standard' || !settings.scoring ? 'selected' : ''}>Standard</option>
                  <option value="speed" ${settings.scoring === 'speed' ? 'selected' : ''}>Speed Bonus</option>
                  <option value="no-negative" ${settings.scoring === 'no-negative' ? 'selected' : ''}>No Penalty</option>
                </select>
              </div>
              <div class="form-group">
                <label>
                  <input type="checkbox" id="set-feedback" ${settings.show_feedback !== false ? 'checked' : ''} />
                  Show Feedback After Answer
                </label>
              </div>
              <div class="form-group">
                <label>
                  <input type="checkbox" id="set-randomize" ${settings.randomize_questions ? 'checked' : ''} />
                  Randomize Questions
                </label>
              </div>
              <div class="form-group">
                <label>
                  <input type="checkbox" id="set-randomize-choices" ${settings.randomize_choices ? 'checked' : ''} />
                  Randomize Choices
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('editor-back-btn').addEventListener('click', () => {
      this.navigate('activities');
    });

    document.querySelectorAll('#editor-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#editor-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');
        const pane = document.getElementById('tab-' + btn.dataset.tab);
        if (pane) pane.style.display = '';
      });
    });
  },

  async _saveActivity() {
    const id = this.state.editingActivity?.id || this.state.editingActivity?._id;
    const title = document.getElementById('act-title')?.value?.trim();
    if (!title) {
      Toast.error('Title is required.');
      return;
    }

    const data = {
      title: title,
      description: document.getElementById('act-desc')?.value || '',
      category: document.getElementById('act-category')?.value || null,
      difficulty: document.getElementById('act-difficulty')?.value || 'medium',
      coverImage: document.getElementById('act-cover')?.value || '',
      settings: {
        timer_type: document.getElementById('set-timer')?.value || 'none',
        time_per_question: parseInt(document.getElementById('set-time-per-q')?.value) || 15,
        total_time: parseInt(document.getElementById('set-total-time')?.value) || 300,
        max_lives: parseInt(document.getElementById('set-lives')?.value) || 3,
        scoring: document.getElementById('set-scoring')?.value || 'standard',
        show_feedback: document.getElementById('set-feedback')?.checked !== false,
        randomize_questions: document.getElementById('set-randomize')?.checked || false,
        randomize_choices: document.getElementById('set-randomize-choices')?.checked || false,
      }
    };

    try {
      if (id) {
        await API.updateActivity(id, data);
        Toast.success('Activity updated!');
      } else {
        const resp = await API.createActivity(data);
        const newId = resp.id || resp._id || resp.activity?.id || resp.activity?._id;
        Toast.success('Activity created!');
        if (newId) {
          this.state.editingActivity = { id: newId, _id: newId };
          await this.openActivityEditor(newId);
          return;
        }
      }
      this.navigate('activities');
    } catch (err) {
      Toast.error('Failed to save: ' + (err.message || 'Unknown error'));
    }
  },

  // ═══════════════════════════════════════════════════════════
  // QUESTION BUILDER
  // ═══════════════════════════════════════════════════════════
  openQuestionBuilder(question = null) {
    this.state.editingQuestion = question;
    const isNew = !question;
    const types = ['text', 'image', 'audio', 'image_text', 'fill_in', 'grammar', 'reading'];
    const typeOptions = types.map(t => `<option value="${t}" ${question?.type === t ? 'selected' : ''}>${Utils.capitalize(t.replace('_', ' '))}</option>`).join('');

    const choices = question?.choices || question?.answers || [
      { text: '', isCorrect: true, explanation: '' },
      { text: '', isCorrect: false, explanation: '' },
      { text: '', isCorrect: false, explanation: '' },
      { text: '', isCorrect: false, explanation: '' }
    ];
    this.state.selectedChoices = choices.map(c => ({ ...c }));

    const choiceRows = this.state.selectedChoices.map((c, i) => this._renderChoiceRow(c, i)).join('');

    const showImage = ['image', 'image_text'].includes(question?.type || 'text');
    const showAudio = ['audio'].includes(question?.type || 'text');
    const showReading = ['reading'].includes(question?.type || 'text');

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'question-builder-overlay';
    overlay.innerHTML = `
      <div class="modal question-builder-modal">
        <div class="modal-header">
          <h3>${isNew ? 'New Question' : 'Edit Question'}</h3>
          <button class="btn-icon modal-close-btn" data-action="close-modal">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label for="qb-type">Question Type</label>
            <select id="qb-type" class="form-select">${typeOptions}</select>
          </div>
          <div class="form-group" id="qb-image-group" style="${showImage ? '' : 'display:none;'}">
            <label for="qb-image">Image URL</label>
            <input type="text" id="qb-image" class="form-input" value="${Utils.sanitize(question?.imageUrl || question?.image_url || '')}" placeholder="https://..." />
          </div>
          <div class="form-group" id="qb-audio-group" style="${showAudio ? '' : 'display:none;'}">
            <label for="qb-audio">Audio URL</label>
            <input type="text" id="qb-audio" class="form-input" value="${Utils.sanitize(question?.audioUrl || question?.audio_url || '')}" placeholder="https://..." />
          </div>
          <div class="form-group" id="qb-reading-group" style="${showReading ? '' : 'display:none;'}">
            <label for="qb-reading">Reading Passage</label>
            <textarea id="qb-reading" class="form-textarea" rows="5" placeholder="Enter reading passage...">${Utils.sanitize(question?.passage || question?.readingPassage || '')}</textarea>
          </div>
          <div class="form-group">
            <label for="qb-text">Question Text *</label>
            <textarea id="qb-text" class="form-textarea" rows="3" placeholder="Enter question..." required>${Utils.sanitize(question?.text || question?.question || '')}</textarea>
          </div>
          <div class="form-group">
            <label>Choices</label>
            <div id="choices-container">${choiceRows}</div>
            <button class="btn btn-outline btn-sm" data-action="add-choice" style="margin-top:8px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Choice
            </button>
          </div>
          <div class="form-group">
            <label for="qb-explanation">Explanation (optional)</label>
            <textarea id="qb-explanation" class="form-textarea" rows="2" placeholder="Explain the correct answer...">${Utils.sanitize(question?.explanation || '')}</textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" data-action="close-modal">Cancel</button>
          <button class="btn btn-primary" data-action="save-question">Save Question</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeModal();
    });

    document.getElementById('qb-type').addEventListener('change', (e) => {
      const t = e.target.value;
      document.getElementById('qb-image-group').style.display = ['image', 'image_text'].includes(t) ? '' : 'none';
      document.getElementById('qb-audio-group').style.display = ['audio'].includes(t) ? '' : 'none';
      document.getElementById('qb-reading-group').style.display = ['reading'].includes(t) ? '' : 'none';
    });

    overlay.querySelectorAll('[data-action="add-choice"]').forEach(btn => {
      btn.addEventListener('click', () => this.addChoice());
    });
  },

  _renderChoiceRow(choice, index) {
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    return `
      <div class="choice-row" data-choice-index="${index}">
        <span class="choice-row-letter">${letters[index] || (index + 1)}</span>
        <input type="text" class="form-input choice-text-input" data-index="${index}" value="${Utils.sanitize(choice.text || '')}" placeholder="Choice text" />
        <label class="choice-correct-toggle">
          <input type="radio" name="correct-choice" value="${index}" ${choice.isCorrect ? 'checked' : ''} />
          Correct
        </label>
        <input type="text" class="form-input choice-explanation-input" data-index="${index}" value="${Utils.sanitize(choice.explanation || '')}" placeholder="Explanation (optional)" />
        <button class="btn-icon btn-icon-danger" data-action="remove-choice" data-value="${index}" title="Remove">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `;
  },

  addChoice() {
    const container = document.getElementById('choices-container');
    if (!container) return;
    const index = this.state.selectedChoices.length;
    this.state.selectedChoices.push({ text: '', isCorrect: false, explanation: '' });
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = this._renderChoiceRow({ text: '', isCorrect: false, explanation: '' }, index);
    const row = tempDiv.firstElementChild;
    container.appendChild(row);

    row.querySelector('[data-action="remove-choice"]')?.addEventListener('click', () => {
      this.removeChoice(index);
    });
  },

  removeChoice(index) {
    if (this.state.selectedChoices.length <= 2) {
      Toast.warning('Minimum 2 choices required.');
      return;
    }
    this.state.selectedChoices.splice(index, 1);
    this._rebuildChoicesUI();
  },

  _rebuildChoicesUI() {
    const container = document.getElementById('choices-container');
    if (!container) return;
    container.innerHTML = this.state.selectedChoices.map((c, i) => this._renderChoiceRow(c, i)).join('');

    container.querySelectorAll('[data-action="remove-choice"]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.removeChoice(parseInt(btn.dataset.value));
      });
    });
  },

  async _saveQuestion() {
    const type = document.getElementById('qb-type')?.value || 'text';
    const text = document.getElementById('qb-text')?.value?.trim();
    if (!text) {
      Toast.error('Question text is required.');
      return;
    }

    const choiceInputs = document.querySelectorAll('.choice-text-input');
    const explanationInputs = document.querySelectorAll('.choice-explanation-input');
    const correctRadio = document.querySelector('input[name="correct-choice"]:checked');
    const correctIndex = correctRadio ? parseInt(correctRadio.value) : 0;

    const choices = [];
    let hasEmpty = false;
    choiceInputs.forEach((input, i) => {
      const choiceText = input.value.trim();
      if (!choiceText) hasEmpty = true;
      choices.push({
        text: choiceText,
        isCorrect: i === correctIndex,
        explanation: explanationInputs[i]?.value?.trim() || ''
      });
    });

    if (hasEmpty) {
      Toast.error('All choices must have text.');
      return;
    }

    const activityId = this.state.editingActivity?.id || this.state.editingActivity?._id;
    const questionId = this.state.editingQuestion?.id || this.state.editingQuestion?._id;

    const data = {
      activityId: activityId,
      type: type,
      text: text,
      choices: choices,
      explanation: document.getElementById('qb-explanation')?.value?.trim() || '',
      imageUrl: document.getElementById('qb-image')?.value?.trim() || '',
      audioUrl: document.getElementById('qb-audio')?.value?.trim() || '',
      passage: document.getElementById('qb-reading')?.value?.trim() || ''
    };

    try {
      if (questionId) {
        await API.updateQuestion(questionId, data);
        Toast.success('Question updated!');
      } else {
        await API.createQuestion(data);
        Toast.success('Question added!');
      }
      this.closeModal();
      await this._refreshQuestions();
    } catch (err) {
      Toast.error('Failed to save question: ' + (err.message || ''));
    }
  },

  async _refreshQuestions() {
    const activityId = this.state.editingActivity?.id || this.state.editingActivity?._id;
    if (!activityId) return;
    try {
      const resp = await API.getActivityQuestions(activityId);
      this.state.questionsList = resp.questions || resp.data || [];
    } catch (_) {
      this.state.questionsList = [];
    }

    const tabBtn = document.querySelector('[data-tab="questions"]');
    if (tabBtn) tabBtn.textContent = 'Questions (' + this.state.questionsList.length + ')';

    const list = document.getElementById('questions-list');
    if (list) {
      if (this.state.questionsList.length === 0) {
        list.innerHTML = '<p class="empty-text">No questions yet. Add your first question!</p>';
      } else {
        list.innerHTML = this.state.questionsList.map((q, i) => {
          const qid = q.id || q._id;
          const qText = Utils.sanitize(Utils.truncate(q.text || q.question || '', 60));
          const type = q.type || 'text';
          return `
            <div class="question-list-item" data-question-id="${qid}">
              <span class="question-number">${i + 1}</span>
              <span class="question-type-badge">${Utils.capitalize(type)}</span>
              <span class="question-text-preview">${qText}</span>
              <span class="question-item-actions">
                <button class="btn-icon" data-action="edit-question" data-id="${qid}" title="Edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                <button class="btn-icon" data-action="duplicate-question" data-id="${qid}" title="Duplicate"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>
                <button class="btn-icon btn-icon-danger" data-action="delete-question" data-id="${qid}" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
              </span>
            </div>
          `;
        }).join('');
      }
    }
  },

  // ═══════════════════════════════════════════════════════════
  // CATEGORIES
  // ═══════════════════════════════════════════════════════════
  async loadCategories() {
    const content = this._getContent();
    content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading categories...</p></div>';

    try {
      const resp = await API.getCategories();
      this.state.categories = resp.categories || resp.data || resp || [];
      this.renderCategories();
    } catch (err) {
      content.innerHTML = '<div class="error-state"><p>Failed to load categories.</p></div>';
    }
  },

  renderCategories() {
    const content = this._getContent();
    const items = this.state.categories.map(c => `
      <div class="list-item">
        <span class="list-item-name">${Utils.sanitize(c.name)}</span>
        <span class="list-item-meta">${c.activityCount || c.activities_count || 0} activities</span>
        <span class="list-item-actions">
          <button class="btn-icon btn-icon-danger" data-action="delete-category" data-id="${c.id || c._id}" title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </span>
      </div>
    `).join('');

    content.innerHTML = `
      <div class="admin-toolbar">
        <h3>Categories</h3>
        <button class="btn btn-primary" data-action="add-category">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Category
        </button>
      </div>
      <div class="list-container">
        ${items || '<p class="empty-text">No categories yet.</p>'}
      </div>
    `;
  },

  _showAddCategoryModal() {
    this.showModal('Add Category', `
      <div class="form-group">
        <label for="cat-name">Category Name *</label>
        <input type="text" id="cat-name" class="form-input" placeholder="Enter category name" required />
      </div>
    `, [
      { label: 'Cancel', class: 'btn-outline', action: 'close-modal' },
      { label: 'Add', class: 'btn-primary', id: 'modal-confirm-btn' }
    ]);

    setTimeout(() => {
      const confirmBtn = document.getElementById('modal-confirm-btn');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
          const name = document.getElementById('cat-name')?.value?.trim();
          if (!name) { Toast.error('Name is required.'); return; }
          try {
            await API.createCategory({ name });
            Toast.success('Category added!');
            this.closeModal();
            await this.loadCategories();
          } catch (err) {
            Toast.error(err.message || 'Failed to add category.');
          }
        });
      }
    }, 50);
  },

  // ═══════════════════════════════════════════════════════════
  // TAGS
  // ═══════════════════════════════════════════════════════════
  async loadTags() {
    const content = this._getContent();
    content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading tags...</p></div>';

    try {
      const resp = await API.getTags();
      this.state.tags = resp.tags || resp.data || resp || [];
      this.renderTags();
    } catch (err) {
      content.innerHTML = '<div class="error-state"><p>Failed to load tags.</p></div>';
    }
  },

  renderTags() {
    const content = this._getContent();
    const tagItems = this.state.tags.map(t => `
      <span class="tag-item">
        <span class="tag-name">${Utils.sanitize(t.name)}</span>
        <span class="tag-count">${t.activityCount || t.activities_count || 0}</span>
        <button class="btn-icon btn-icon-sm btn-icon-danger" data-action="delete-tag" data-id="${t.id || t._id}" title="Delete">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </span>
    `).join('');

    content.innerHTML = `
      <div class="admin-toolbar">
        <h3>Tags</h3>
        <div class="toolbar-inline">
          <input type="text" id="new-tag-input" class="form-input" placeholder="New tag name..." />
          <button class="btn btn-primary" data-action="add-tag">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add
          </button>
        </div>
      </div>
      <div class="tags-container">
        ${tagItems || '<p class="empty-text">No tags yet.</p>'}
      </div>
    `;

    const tagInput = document.getElementById('new-tag-input');
    if (tagInput) {
      tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this._addTag();
        }
      });
    }
  },

  async _addTag() {
    const input = document.getElementById('new-tag-input');
    const name = input?.value?.trim();
    if (!name) { Toast.error('Enter a tag name.'); return; }
    try {
      await API.createTag({ name });
      Toast.success('Tag added!');
      input.value = '';
      await this.loadTags();
    } catch (err) {
      Toast.error(err.message || 'Failed to add tag.');
    }
  },

  // ═══════════════════════════════════════════════════════════
  // USERS
  // ═══════════════════════════════════════════════════════════
  async loadUsers() {
    const content = this._getContent();
    content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading users...</p></div>';

    try {
      const resp = await API.getUsers({ page: this.state.page, limit: 20 });
      this.state.users = resp.users || resp.data || resp || [];
      this.state.totalPages = resp.totalPages || resp.total_pages || 1;
      this.renderUsers();
    } catch (err) {
      content.innerHTML = '<div class="error-state"><p>Failed to load users.</p></div>';
    }
  },

  renderUsers() {
    const content = this._getContent();
    const rows = this.state.users.map(u => {
      const uid = u.id || u._id;
      const role = u.role || 'student';
      const roleColor = role === 'admin' ? '#ef4444' : role === 'teacher' ? '#3b82f6' : '#6b7280';
      return `
        <tr>
          <td><strong>${Utils.sanitize(u.username || u.name || '')}</strong></td>
          <td>${Utils.sanitize(u.email || '-')}</td>
          <td>
            <select class="form-select form-select-sm role-select" data-user-id="${uid}" ${!API.isAdmin() ? 'disabled' : ''}>
              <option value="student" ${role === 'student' ? 'selected' : ''}>Student</option>
              <option value="teacher" ${role === 'teacher' ? 'selected' : ''}>Teacher</option>
              ${API.isAdmin() ? '<option value="admin" ' + (role === 'admin' ? 'selected' : '') + '>Admin</option>' : ''}
            </select>
          </td>
          <td>${u.totalAttempts || u.attempts || 0}</td>
          <td>${u.avgScore || u.averageScore || 0}%</td>
          <td>${Utils.formatDate(u.createdAt || u.created_at || u.joinedAt || new Date())}</td>
        </tr>
      `;
    }).join('');

    content.innerHTML = `
      <div class="admin-table-wrapper">
        <table class="admin-table">
          <thead>
            <tr><th>Username</th><th>Email</th><th>Role</th><th>Attempts</th><th>Avg Score</th><th>Joined</th></tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="6" class="empty-row">No users found.</td></tr>'}</tbody>
        </table>
      </div>
    `;

    if (API.isAdmin()) {
      content.querySelectorAll('.role-select').forEach(select => {
        select.addEventListener('change', async () => {
          const uid = select.dataset.userId;
          const newRole = select.value;
          await this._changeUserRole(uid, newRole);
        });
      });
    }
  },

  async _changeUserRole(userId, role) {
    try {
      await API.updateUserRole(userId, role);
      Toast.success('Role updated!');
    } catch (err) {
      Toast.error(err.message || 'Failed to update role.');
      await this.loadUsers();
    }
  },

  // ═══════════════════════════════════════════════════════════
  // BADGES
  // ═══════════════════════════════════════════════════════════
  async loadBadges() {
    const content = this._getContent();
    content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading badges...</p></div>';

    try {
      const resp = await API.getBadges();
      this.state.badges = resp.badges || resp.data || resp || [];
      this.renderBadges();
    } catch (err) {
      content.innerHTML = '<div class="error-state"><p>Failed to load badges.</p></div>';
    }
  },

  renderBadges() {
    const content = this._getContent();
    const cards = this.state.badges.map(b => `
      <div class="badge-card">
        <div class="badge-card-icon">${b.icon || b.image || '🏅'}</div>
        <div class="badge-card-name">${Utils.sanitize(b.name || 'Badge')}</div>
        <div class="badge-card-desc">${Utils.sanitize(Utils.truncate(b.description || '', 60))}</div>
      </div>
    `).join('');

    content.innerHTML = `
      <div class="admin-toolbar">
        <h3>Badges</h3>
        <button class="btn btn-primary" data-action="add-badge">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Badge
        </button>
      </div>
      <div class="badges-grid">
        ${cards || '<p class="empty-text">No badges yet.</p>'}
      </div>
    `;
  },

  _showAddBadgeModal() {
    this.showModal('Create Badge', `
      <div class="form-group">
        <label for="badge-name">Badge Name *</label>
        <input type="text" id="badge-name" class="form-input" placeholder="e.g. Quick Learner" required />
      </div>
      <div class="form-group">
        <label for="badge-desc">Description</label>
        <textarea id="badge-desc" class="form-textarea" rows="2" placeholder="Badge description"></textarea>
      </div>
      <div class="form-group">
        <label for="badge-icon">Icon (emoji or URL)</label>
        <input type="text" id="badge-icon" class="form-input" placeholder="e.g. 🏆 or https://..." />
      </div>
      <div class="form-group">
        <label for="badge-criteria">Criteria</label>
        <input type="text" id="badge-criteria" class="form-input" placeholder="e.g. complete 5 activities" />
      </div>
    `, [
      { label: 'Cancel', class: 'btn-outline', action: 'close-modal' },
      { label: 'Create', class: 'btn-primary', id: 'modal-confirm-btn' }
    ]);

    setTimeout(() => {
      const confirmBtn = document.getElementById('modal-confirm-btn');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
          const name = document.getElementById('badge-name')?.value?.trim();
          if (!name) { Toast.error('Name is required.'); return; }
          try {
            await API.createBadge({
              name,
              description: document.getElementById('badge-desc')?.value || '',
              icon: document.getElementById('badge-icon')?.value || '',
              criteria: document.getElementById('badge-criteria')?.value || ''
            });
            Toast.success('Badge created!');
            this.closeModal();
            await this.loadBadges();
          } catch (err) {
            Toast.error(err.message || 'Failed to create badge.');
          }
        });
      }
    }, 50);
  },

  // ═══════════════════════════════════════════════════════════
  // ASSIGNMENTS
  // ═══════════════════════════════════════════════════════════
  async loadAssignments() {
    const content = this._getContent();
    content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading assignments...</p></div>';

    try {
      const resp = await API.getAssignments({ page: this.state.page });
      this.state.assignments = resp.assignments || resp.data || resp || [];
      this.renderAssignments();
    } catch (err) {
      content.innerHTML = '<div class="error-state"><p>Failed to load assignments.</p></div>';
    }
  },

  renderAssignments() {
    const content = this._getContent();
    const items = this.state.assignments.map(a => `
      <div class="list-item">
        <span class="list-item-name">${Utils.sanitize(a.title || a.activity?.title || 'Assignment')}</span>
        <span class="list-item-meta">Due: ${a.dueDate ? Utils.formatDate(a.dueDate) : 'No due date'}</span>
        <span class="list-item-meta">${a.assignedTo || a.studentCount || 0} students</span>
      </div>
    `).join('');

    content.innerHTML = `
      <div class="admin-toolbar">
        <h3>Assignments</h3>
        <button class="btn btn-primary" data-action="create-assignment">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Assignment
        </button>
      </div>
      <div class="list-container">
        ${items || '<p class="empty-text">No assignments yet.</p>'}
      </div>
    `;
  },

  // ═══════════════════════════════════════════════════════════
  // MODALS
  // ═══════════════════════════════════════════════════════════
  showModal(title, contentHtml, actions = []) {
    this.closeModal();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'admin-modal-overlay';

    const actionsHtml = actions.map(a =>
      `<button class="btn ${a.class || 'btn-outline'}" ${a.id ? 'id="' + a.id + '"' : ''} ${a.action ? 'data-action="' + a.action + '"' : ''}>${a.label}</button>`
    ).join('');

    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="btn-icon modal-close-btn" data-action="close-modal">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">${contentHtml}</div>
        ${actionsHtml ? '<div class="modal-footer">' + actionsHtml + '</div>' : ''}
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeModal();
    });
  },

  closeModal() {
    const overlay = document.getElementById('admin-modal-overlay') || document.getElementById('question-builder-overlay');
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  },

  showConfirm(message, onConfirm) {
    this.showModal('Confirm', `<p>${Utils.sanitize(message)}</p>`, [
      { label: 'Cancel', class: 'btn-outline', action: 'close-modal' },
      { label: 'Yes, Continue', class: 'btn-primary', id: 'confirm-yes-btn' }
    ]);

    setTimeout(() => {
      const btn = document.getElementById('confirm-yes-btn');
      if (btn) {
        btn.addEventListener('click', async () => {
          this.closeModal();
          if (onConfirm) await onConfirm();
        });
      }
    }, 50);
  },

  // ═══════════════════════════════════════════════════════════
  // PREVIEW
  // ═══════════════════════════════════════════════════════════
  previewActivity(activityId) {
    if (activityId) {
      window.open('/game.html?id=' + activityId, '_blank');
    }
  },

  // ═══════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════
  formatStatus(status) {
    const map = {
      draft: '<span class="status-badge status-draft">Draft</span>',
      published: '<span class="status-badge status-published">Published</span>',
      archived: '<span class="status-badge status-archived">Archived</span>'
    };
    return map[status] || '<span class="status-badge">' + Utils.capitalize(status) + '</span>';
  },

  _getContent() {
    return document.getElementById('admin-content') || document.getElementById('content') || document.getElementById('app');
  },

  showLoading() {
    const content = this._getContent();
    if (content) {
      content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading...</p></div>';
    }
  },

  hideLoading() {
    const spinner = document.querySelector('.loading-spinner');
    if (spinner) spinner.remove();
  }
};

document.addEventListener('DOMContentLoaded', () => AdminApp.init());
