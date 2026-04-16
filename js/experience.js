/* ============================================
   EXPERIENCE — Mission Timeline Scroll Animations
   ============================================ */

(function() {
  const entries = document.querySelectorAll('.timeline-entry');

  if (entries.length === 0) return;

  // ---- Scroll-triggered entry reveals ----
  const entryObserver = new IntersectionObserver((entries_list) => {
    entries_list.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        el.classList.add('visible');
        el.classList.add('warp');

        // Remove warp class after animation
        setTimeout(() => el.classList.remove('warp'), 500);

        // Animate bullet points one-by-one
        const bullets = el.querySelectorAll('.mission-bullets li');
        bullets.forEach((bullet, i) => {
          setTimeout(() => {
            bullet.classList.add('visible');
          }, 400 + i * 200);
        });
      }
    });
  }, {
    threshold: 0.2,
    rootMargin: '0px 0px -80px 0px'
  });

  entries.forEach(entry => entryObserver.observe(entry));
})();
