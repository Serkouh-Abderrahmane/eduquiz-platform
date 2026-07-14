window.API = {
  token: localStorage.getItem('token'),
  user: JSON.parse(localStorage.getItem('user') || 'null'),

  // ── Core request ─────────────────────────────────────────
  async request(method, url, data, options = {}) {
    const headers = {};
    if (this.token) {
      headers['Authorization'] = 'Bearer ' + this.token;
    }
    if (data && !(data instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const config = {
      method: method.toUpperCase(),
      headers: { ...headers, ...options.headers },
    };

    if (data) {
      config.body = data instanceof FormData ? data : JSON.stringify(data);
    }

    try {
      const response = await fetch(url, config);

      if (response.status === 401) {
        this.clearAuth();
        if (window.Toast) {
          window.Toast.error('Session expired. Please log in again.');
        }
        setTimeout(() => {
          window.location.href = '/login.html';
        }, 1500);
        throw new Error('Unauthorized');
      }

      if (response.status === 204) {
        return { success: true };
      }

      const contentType = response.headers.get('content-type') || '';
      let result;
      if (contentType.includes('application/json')) {
        result = await response.json();
      } else {
        result = await response.text();
      }

      if (!response.ok) {
        const message = (result && result.message) || (result && result.error) || 'Request failed';
        throw new Error(message);
      }

      return result;
    } catch (err) {
      if (err.message === 'Unauthorized') throw err;
      if (window.Toast && err.message !== 'Unauthorized') {
        window.Toast.error(err.message || 'Something went wrong');
      }
      throw err;
    }
  },

  async get(url) {
    return this.request('GET', url);
  },

  async post(url, data) {
    return this.request('POST', url, data);
  },

  async put(url, data) {
    return this.request('PUT', url, data);
  },

  async delete(url) {
    return this.request('DELETE', url);
  },

  // ── Auth ─────────────────────────────────────────────────
  async login(username, password) {
    const result = await this.post('/api/auth/login', { username, password });
    if (result.token) {
      this.setAuth(result.token, result.user);
    }
    return result;
  },

  async register(data) {
    const result = await this.post('/api/auth/register', data);
    if (result.token) {
      this.setAuth(result.token, result.user);
    }
    return result;
  },

  async getProfile() {
    return this.get('/api/auth/me');
  },

  async updateProfile(data) {
    const result = await this.put('/api/auth/me', data);
    if (result.user) {
      this.user = result.user;
      localStorage.setItem('user', JSON.stringify(result.user));
    }
    return result;
  },

  logout() {
    this.clearAuth();
    window.location.href = '/';
  },

  isLoggedIn() {
    return !!this.token && !!this.user;
  },

  isAdmin() {
    return this.user && this.user.role === 'admin';
  },

  isTeacher() {
    return this.user && (this.user.role === 'teacher' || this.user.role === 'admin');
  },

  // ── Activities ───────────────────────────────────────────
  async getActivities(params = {}) {
    const qs = this.buildQueryString(params);
    return this.get('/api/activities' + qs);
  },

  async getActivity(id) {
    return this.get('/api/activities/' + id);
  },

  async createActivity(data) {
    return this.post('/api/activities', data);
  },

  async updateActivity(id, data) {
    return this.put('/api/activities/' + id, data);
  },

  async deleteActivity(id) {
    return this.delete('/api/activities/' + id);
  },

  async duplicateActivity(id) {
    return this.post('/api/activities/' + id + '/duplicate');
  },

  async publishActivity(id) {
    return this.post('/api/activities/' + id + '/publish');
  },

  async unpublishActivity(id) {
    return this.post('/api/activities/' + id + '/unpublish');
  },

  async archiveActivity(id) {
    return this.post('/api/activities/' + id + '/archive');
  },

  async restoreActivity(id) {
    return this.post('/api/activities/' + id + '/restore');
  },

  async getActivityQuestions(id) {
    return this.get('/api/activities/' + id + '/questions');
  },

  // ── Questions ────────────────────────────────────────────
  async createQuestion(data) {
    return this.post('/api/questions', data);
  },

  async updateQuestion(id, data) {
    return this.put('/api/questions/' + id, data);
  },

  async deleteQuestion(id) {
    return this.delete('/api/questions/' + id);
  },

  async reorderQuestions(ids) {
    return this.post('/api/questions/reorder', { question_ids: ids });
  },

  async duplicateQuestion(id) {
    return this.post('/api/questions/' + id + '/duplicate');
  },

  // ── Gameplay ─────────────────────────────────────────────
  async startGame(activityId) {
    return this.post('/api/gameplay/start', { activity_id: activityId });
  },

  async getAttemptState(id) {
    return this.get('/api/gameplay/attempt/' + id);
  },

  async submitAnswer(attemptId, data) {
    return this.post('/api/gameplay/attempt/' + attemptId + '/answer', data);
  },

  async nextQuestion(attemptId) {
    return this.post('/api/gameplay/attempt/' + attemptId + '/next');
  },

  async abandonGame(attemptId) {
    return this.post('/api/gameplay/attempt/' + attemptId + '/abandon');
  },

  async getResults(attemptId) {
    return this.get('/api/gameplay/attempt/' + attemptId + '/result');
  },

  // ── Analytics ────────────────────────────────────────────
  async getActivityAnalytics(id) {
    return this.get('/api/analytics/activity/' + id);
  },

  async getLeaderboard(params = {}) {
    const qs = this.buildQueryString(params);
    return this.get('/api/analytics/leaderboard' + qs);
  },

  async getDashboardStats() {
    return this.get('/api/analytics/dashboard');
  },

  // ── Admin ────────────────────────────────────────────────
  async getUsers(params = {}) {
    const qs = this.buildQueryString(params);
    return this.get('/api/admin/users' + qs);
  },

  async updateUserRole(id, role) {
    return this.put('/api/admin/users/' + id + '/role', { role });
  },

  async getCategories() {
    return this.get('/api/admin/categories');
  },

  async createCategory(data) {
    return this.post('/api/admin/categories', data);
  },

  async updateCategory(id, data) {
    return this.put('/api/admin/categories/' + id, data);
  },

  async deleteCategory(id) {
    return this.delete('/api/admin/categories/' + id);
  },

  async getTags() {
    return this.get('/api/admin/tags');
  },

  async createTag(data) {
    return this.post('/api/admin/tags', data);
  },

  async deleteTag(id) {
    return this.delete('/api/admin/tags/' + id);
  },

  async getBadges() {
    return this.get('/api/admin/badges');
  },

  async createBadge(data) {
    return this.post('/api/admin/badges', data);
  },

  async getAssignments(params = {}) {
    const qs = this.buildQueryString(params);
    return this.get('/api/admin/assignments' + qs);
  },

  // ── Upload ───────────────────────────────────────────────
  async uploadImage(file) {
    const formData = new FormData();
    formData.append('file', file);
    return this.post('/api/upload/image', formData);
  },

  async uploadAudio(file) {
    const formData = new FormData();
    formData.append('file', file);
    return this.post('/api/upload/audio', formData);
  },

  async getUploadedImages(params = {}) {
    const qs = this.buildQueryString(params);
    return this.get('/api/upload/images' + qs);
  },

  async getUploadedAudio(params = {}) {
    const qs = this.buildQueryString(params);
    return this.get('/api/upload/audio' + qs);
  },

  // ── Helpers ──────────────────────────────────────────────
  buildQueryString(params) {
    const filtered = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined && value !== '') {
        filtered[key] = value;
      }
    }
    if (Object.keys(filtered).length === 0) return '';
    return '?' + Object.entries(filtered)
      .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
      .join('&');
  },

  setAuth(token, user) {
    this.token = token;
    this.user = user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  },

  clearAuth() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }
};
