window.Confetti = {
  canvas: null,
  ctx: null,
  particles: [],
  animationId: null,

  init() {
    if (this.canvas) return;
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;';
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    window.addEventListener('resize', () => {
      if (this.canvas) {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
      }
    });
  },

  createParticle(originX, originY) {
    const colors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#f97316', '#a855f7', '#ec4899'];
    const angle = Math.random() * Math.PI * 2;
    const velocity = 4 + Math.random() * 8;
    return {
      x: originX || Math.random() * this.canvas.width,
      y: originY || -10,
      vx: Math.cos(angle) * velocity * (Math.random() * 0.6 + 0.7),
      vy: -Math.abs(Math.sin(angle) * velocity) - Math.random() * 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 4 + Math.random() * 6,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 12,
      gravity: 0.12 + Math.random() * 0.08,
      drag: 0.98 + Math.random() * 0.015,
      opacity: 1,
      fadeRate: 0.003 + Math.random() * 0.005,
      shape: Math.random() > 0.4 ? 'rect' : 'circle',
      w: 3 + Math.random() * 5,
      h: 6 + Math.random() * 4,
    };
  },

  animate() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vy += p.gravity;
      p.vx *= p.drag;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;
      p.opacity -= p.fadeRate;

      if (p.opacity <= 0 || p.y > this.canvas.height + 20) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate((p.rotation * Math.PI) / 180);
      this.ctx.globalAlpha = p.opacity;
      this.ctx.fillStyle = p.color;

      if (p.shape === 'rect') {
        this.ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      } else {
        this.ctx.beginPath();
        this.ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        this.ctx.fill();
      }

      this.ctx.restore();
    }

    if (this.particles.length > 0) {
      this.animationId = requestAnimationFrame(() => this.animate());
    } else {
      this.destroy();
    }
  },

  burst(count = 100) {
    this.init();
    const centerX = this.canvas.width / 2;
    const topY = this.canvas.height * 0.15;

    for (let i = 0; i < count; i++) {
      const offsetX = (Math.random() - 0.5) * 300;
      const offsetY = (Math.random() - 0.5) * 80;
      this.particles.push(this.createParticle(centerX + offsetX, topY + offsetY));
    }

    if (!this.animationId) {
      this.animate();
    }
  },

  burstFrom(x, y, count = 60) {
    this.init();
    for (let i = 0; i < count; i++) {
      this.particles.push(this.createParticle(x, y));
    }
    if (!this.animationId) {
      this.animate();
    }
  },

  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.particles = [];
  }
};
