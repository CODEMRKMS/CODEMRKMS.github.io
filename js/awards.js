/* ============================================
   AWARDS — Trophy Shelf, Confetti, Hover Effects
   ============================================ */

(function() {
  const trophies = document.querySelectorAll('.trophy-card');
  const confettiCanvas = document.querySelector('.confetti-canvas');

  if (trophies.length === 0) return;

  // ---- Confetti on Hover ----
  let confettiPS = null;
  if (confettiCanvas) {
    confettiPS = new ParticleSystem(confettiCanvas, {
      maxParticles: 200,
      gravity: -0.015,
      friction: 0.99,
      fadeRate: 0.012
    });
  }

  trophies.forEach(trophy => {
    // 3D hover tilt
    trophy.addEventListener('mousemove', (e) => {
      if (window.innerWidth <= 768) return;
      const rect = trophy.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      trophy.style.transform = `translateY(-12px) rotateX(${-y * 10}deg) rotateY(${x * 10}deg)`;
    });

    trophy.addEventListener('mouseleave', () => {
      trophy.style.transform = '';
    });

    // Confetti burst on hover
    trophy.addEventListener('mouseenter', (e) => {
      if (!confettiPS) return;
      const rect = trophy.getBoundingClientRect();
      const section = confettiCanvas.parentElement.getBoundingClientRect();
      const x = rect.left - section.left + rect.width / 2;
      const y = rect.top - section.top + rect.height / 2;
      confettiPS.goldConfetti(x, y);
    });
  });

  // ---- Scroll-triggered trophy reveal ----
  const trophyObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.1 });

  trophies.forEach((trophy, i) => {
    trophy.style.opacity = '0';
    trophy.style.transform = 'translateY(30px)';
    trophy.style.transition = `all 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.1}s`;
    trophyObserver.observe(trophy);
  });
})();
