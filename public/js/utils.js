window.Utils = {
  // ── DOM helpers ──────────────────────────────────────────
  $(selector) {
    return document.querySelector(selector);
  },

  $$(selector) {
    return Array.from(document.querySelectorAll(selector));
  },

  createElement(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'className') {
        el.className = value;
      } else if (key === 'dataset') {
        for (const [dk, dv] of Object.entries(value)) {
          el.dataset[dk] = dv;
        }
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(el.style, value);
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else {
        el.setAttribute(key, value);
      }
    }
    for (const child of children) {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        el.appendChild(child);
      }
    }
    return el;
  },

  html(container, htmlString) {
    if (typeof container === 'string') {
      container = document.querySelector(container);
    }
    if (container) {
      container.innerHTML = htmlString;
    }
  },

  // ── String ───────────────────────────────────────────────
  sanitize(str) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;', '`': '&#x60;' };
    return String(str).replace(/[&<>"'\/`]/g, c => map[c]);
  },

  truncate(str, len) {
    if (!str || str.length <= len) return str;
    return str.slice(0, len).trimEnd() + '...';
  },

  slugify(str) {
    return String(str)
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  },

  capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  },

  // ── Number ───────────────────────────────────────────────
  formatNumber(n) {
    return Number(n).toLocaleString();
  },

  formatPercent(n) {
    return (Number(n) * 100).toFixed(1) + '%';
  },

  clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
  },

  // ── Time ─────────────────────────────────────────────────
  formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m + ':' + String(sec).padStart(2, '0');
  },

  formatDuration(seconds) {
    const s = Math.floor(seconds);
    if (s < 60) return s + 's';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return h + 'h ' + m + 'm';
    return m + 'm ' + sec + 's';
  },

  timeAgo(dateStr) {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = Math.floor((now - then) / 1000);
    if (diff < 5) return 'just now';
    if (diff < 60) return diff + ' seconds ago';
    if (diff < 3600) return Math.floor(diff / 60) + ' minute' + (Math.floor(diff / 60) === 1 ? '' : 's') + ' ago';
    if (diff < 86400) return Math.floor(diff / 3600) + ' hour' + (Math.floor(diff / 3600) === 1 ? '' : 's') + ' ago';
    if (diff < 2592000) return Math.floor(diff / 86400) + ' day' + (Math.floor(diff / 86400) === 1 ? '' : 's') + ' ago';
    if (diff < 31536000) return Math.floor(diff / 2592000) + ' month' + (Math.floor(diff / 2592000) === 1 ? '' : 's') + ' ago';
    return Math.floor(diff / 31536000) + ' year' + (Math.floor(diff / 31536000) === 1 ? '' : 's') + ' ago';
  },

  // ── Array ────────────────────────────────────────────────
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  chunk(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  },

  unique(arr) {
    return [...new Set(arr)];
  },

  sortBy(arr, key) {
    return arr.slice().sort((a, b) => {
      const va = typeof key === 'function' ? key(a) : a[key];
      const vb = typeof key === 'function' ? key(b) : b[key];
      if (va < vb) return -1;
      if (va > vb) return 1;
      return 0;
    });
  },

  // ── Date ─────────────────────────────────────────────────
  formatDate(dateStr) {
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  },

  formatDateTime(dateStr) {
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let hours = d.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const mins = String(d.getMinutes()).padStart(2, '0');
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() + ' ' + hours + ':' + mins + ' ' + ampm;
  },

  // ── Debounce / Throttle ──────────────────────────────────
  debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  throttle(fn, limit) {
    let inThrottle = false;
    let lastArgs = null;
    let lastThis = null;
    return function (...args) {
      if (!inThrottle) {
        fn.apply(this, args);
        inThrottle = true;
        setTimeout(() => {
          inThrottle = false;
          if (lastArgs) {
            fn.apply(lastThis, lastArgs);
            lastArgs = null;
            lastThis = null;
          }
        }, limit);
      } else {
        lastArgs = args;
        lastThis = this;
      }
    };
  },

  // ── URL ──────────────────────────────────────────────────
  getParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  },

  setParam(name, value) {
    const params = new URLSearchParams(window.location.search);
    if (value === null || value === undefined) {
      params.delete(name);
    } else {
      params.set(name, value);
    }
    const newUrl = window.location.pathname + '?' + params.toString() + window.location.hash;
    window.history.replaceState({}, '', newUrl);
  },

  removeParam(name) {
    this.setParam(name, null);
  },

  // ── Misc ─────────────────────────────────────────────────
  generateId() {
    return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  },

  deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (Array.isArray(obj)) return obj.map(item => this.deepClone(item));
    const cloned = {};
    for (const [key, value] of Object.entries(obj)) {
      cloned[key] = this.deepClone(value);
    }
    return cloned;
  },

  isEmpty(obj) {
    if (obj === null || obj === undefined) return true;
    if (typeof obj === 'string') return obj.length === 0;
    if (Array.isArray(obj)) return obj.length === 0;
    if (typeof obj === 'object') return Object.keys(obj).length === 0;
    return false;
  }
};
