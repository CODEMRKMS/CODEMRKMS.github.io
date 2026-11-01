/* ============================================
   PARTICLES — Reusable Particle System
   ============================================ */

class ParticleSystem {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.options = {
      maxParticles: options.maxParticles || 100,
      gravity: options.gravity || 0,
      friction: options.friction || 0.98,
      fadeRate: options.fadeRate || 0.015,
      ...options
    };
    this.running = false;
  }

  resize() {
    this.canvas.width = this.canvas.offsetWidth * (window.devicePixelRatio || 1);
    this.canvas.height = this.canvas.offsetHeight * (window.devicePixelRatio || 1);
    this.ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  }

  emit(x, y, count, particleOptions = {}) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.options.maxParticles) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = (particleOptions.speed || 3) + Math.random() * (particleOptions.speedVariance || 4);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (particleOptions.upwardBias || 0),
        size: (particleOptions.size || 2) + Math.random() * (particleOptions.sizeVariance || 3),
        color: particleOptions.colors
          ? particleOptions.colors[Math.floor(Math.random() * particleOptions.colors.length)]
          : '#00F5FF',
        alpha: 1,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        shape: particleOptions.shape || 'circle'
      });
    }
  }

  update() {
    this.ctx.clearRect(0, 0, this.canvas.offsetWidth, this.canvas.offsetHeight);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += this.options.gravity;
      p.vx *= this.options.friction;
      p.vy *= this.options.friction;
      p.alpha -= this.options.fadeRate;
      p.rotation += p.rotationSpeed;

      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.globalAlpha = p.alpha;
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate((p.rotation * Math.PI) / 180);

      if (p.shape === 'square') {
        this.ctx.fillStyle = p.color;
        this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      } else if (p.shape === 'star') {
        this.drawStar(p.size, p.color);
      } else {
        this.ctx.beginPath();
        this.ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        this.ctx.fillStyle = p.color;
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = p.color;
        this.ctx.fill();
      }

      this.ctx.restore();
    }
  }

  drawStar(size, color) {
    const spikes = 5;
    const outerRadius = size;
    const innerRadius = size / 2;
    this.ctx.beginPath();
    this.ctx.fillStyle = color;
    for (let i = 0; i < spikes * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = (i * Math.PI) / spikes - Math.PI / 2;
      if (i === 0) this.ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      else this.ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    this.ctx.closePath();
    this.ctx.fill();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.resize();
    this.loop();
  }

  loop() {
    if (!this.running) return;
    this.update();
    if (this.particles.length > 0) {
      requestAnimationFrame(() => this.loop());
    } else {
      this.running = false;
    }
  }

  stop() {
    this.running = false;
    this.particles = [];
    this.ctx.clearRect(0, 0, this.canvas.offsetWidth, this.canvas.offsetHeight);
  }

  // Convenience: Rocket burst (for CTA button)
  rocketBurst(x, y) {
    this.emit(x, y, 30, {
      speed: 4,
      speedVariance: 6,
      upwardBias: 5,
      size: 2,
      sizeVariance: 3,
      colors: ['#6C63FF', '#00F5FF', '#FFB830', '#F0F0FF'],
      shape: 'circle'
    });
    this.start();
  }

  // Convenience: Gold confetti (for awards)
  goldConfetti(x, y) {
    this.emit(x, y, 40, {
      speed: 2,
      speedVariance: 4,
      upwardBias: 3,
      size: 3,
      sizeVariance: 4,
      colors: ['#FFD700', '#FFB830', '#FFA500', '#FFED4A', '#F0F0FF'],
      shape: 'square'
    });
    this.options.gravity = -0.02; // Zero-G float upward
    this.start();
  }

  // Convenience: Full screen explosion (Easter egg)
  fullExplosion() {
    const w = this.canvas.offsetWidth;
    const h = this.canvas.offsetHeight;
    const cx = w / 2;
    const cy = h / 2;

    for (let i = 0; i < 8; i++) {
      setTimeout(() => {
        const x = cx + (Math.random() - 0.5) * w * 0.6;
        const y = cy + (Math.random() - 0.5) * h * 0.6;
        this.emit(x, y, 50, {
          speed: 6,
          speedVariance: 10,
          size: 2,
          sizeVariance: 5,
          colors: ['#6C63FF', '#00F5FF', '#FFB830', '#FF3366', '#FFD700', '#00FF88'],
          shape: ['circle', 'square', 'star'][Math.floor(Math.random() * 3)]
        });
      }, i * 100);
    }
    this.options.gravity = 0;
    this.options.fadeRate = 0.01;
    this.start();
  }
}

window.ParticleSystem = ParticleSystem;
