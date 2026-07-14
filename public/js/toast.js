window.Toast = {
  container: null,

  init() {
    if (this.container) return;
    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    this.container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10000;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
    document.body.appendChild(this.container);
  },

  show(message, type = 'info', duration = 3000) {
    if (!this.container) this.init();

    const icons = {
      success: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#22c55e"/><path d="M6 10l3 3 5-5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      error: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#ef4444"/><path d="M7 7l6 6M13 7l-6 6" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
      warning: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#eab308"/><path d="M10 6v5M10 13v1" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
      info: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#3b82f6"/><path d="M10 9v5M10 6.5v.5" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>'
    };

    const colors = {
      success: { bg: '#f0fdf4', border: '#22c55e', text: '#166534' },
      error: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' },
      warning: { bg: '#fffbeb', border: '#eab308', text: '#92400e' },
      info: { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af' }
    };

    const c = colors[type] || colors.info;
    const icon = icons[type] || icons.info;

    const toast = document.createElement('div');
    toast.style.cssText = 'pointer-events:auto;display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:8px;border-left:4px solid ' + c.border + ';background:' + c.bg + ';color:' + c.text + ';box-shadow:0 4px 12px rgba(0,0,0,0.15);font-size:14px;font-family:inherit;cursor:pointer;max-width:380px;transform:translateX(120%);transition:transform 0.3s ease,opacity 0.3s ease;opacity:1;';
    toast.innerHTML = '<span style="flex-shrink:0;">' + icon + '</span><span style="flex:1;line-height:1.4;">' + this._escHtml(message) + '</span><span style="flex-shrink:0;cursor:pointer;opacity:0.6;font-size:18px;line-height:1;" data-toast-close>&times;</span>';

    toast.addEventListener('click', (e) => {
      if (e.target.dataset.toastClose !== undefined || e.target === toast) {
        this._remove(toast);
      }
    });

    this.container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.transform = 'translateX(0)';
    });

    if (duration > 0) {
      setTimeout(() => this._remove(toast), duration);
    }

    return toast;
  },

  _remove(toast) {
    if (!toast || !toast.parentNode) return;
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(120%)';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  },

  _escHtml(str) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
    return String(str).replace(/[&<>"]/g, c => map[c]);
  },

  success(msg) {
    return this.show(msg, 'success');
  },

  error(msg) {
    return this.show(msg, 'error');
  },

  warning(msg) {
    return this.show(msg, 'warning');
  },

  info(msg) {
    return this.show(msg, 'info');
  },

  // ── Sound effects via Web Audio API ──────────────────────
  _getAudioCtx() {
    if (!this._audioCtx || this._audioCtx.state === 'closed') {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._audioCtx.state === 'suspended') {
      this._audioCtx.resume();
    }
    return this._audioCtx;
  },

  _playTone(freq, startTime, duration, type = 'sine', gainVal = 0.3) {
    const ctx = this._getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(gainVal, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  },

  playCorrect() {
    const ctx = this._getAudioCtx();
    const now = ctx.currentTime;
    this._playTone(523.25, now, 0.15, 'sine', 0.25);
    this._playTone(659.25, now + 0.12, 0.2, 'sine', 0.25);
  },

  playIncorrect() {
    const ctx = this._getAudioCtx();
    const now = ctx.currentTime;
    this._playTone(311.13, now, 0.2, 'sine', 0.2);
    this._playTone(261.63, now + 0.15, 0.3, 'sine', 0.2);
  },

  playComplete() {
    const ctx = this._getAudioCtx();
    const now = ctx.currentTime;
    this._playTone(523.25, now, 0.15, 'sine', 0.25);
    this._playTone(659.25, now + 0.12, 0.15, 'sine', 0.25);
    this._playTone(783.99, now + 0.24, 0.15, 'sine', 0.25);
    this._playTone(1046.5, now + 0.36, 0.3, 'sine', 0.3);
  },

  playStar() {
    const ctx = this._getAudioCtx();
    const now = ctx.currentTime;
    this._playTone(1318.51, now, 0.12, 'sine', 0.2);
    this._playTone(1567.98, now + 0.08, 0.2, 'sine', 0.2);
  }
};
