/* ============================================
   TESTIMONIALS — 3D Tilt, Shimmer, Scroll Reveal
   ============================================ */

(function() {
  const cards = document.querySelectorAll('.testimonial-card');
  if (cards.length === 0) return;

  // ---- 3D Tilt + Shimmer on Mouse Move ----
  cards.forEach(card => {
    if (window.innerWidth <= 768) return;

    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;

      // 3D tilt
      card.style.transform = `rotateY(${x * 15}deg) rotateX(${-y * 10}deg) translateY(-5px)`;

      // Shimmer position
      const shimmerX = ((e.clientX - rect.left) / rect.width) * 100;
      const shimmerY = ((e.clientY - rect.top) / rect.height) * 100;
      card.style.setProperty('--shimmer-x', shimmerX + '%');
      card.style.setProperty('--shimmer-y', shimmerY + '%');
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });

  // ---- Scroll Reveal ----
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
      }
    });
  }, { threshold: 0.2, rootMargin: '0px 0px -60px 0px' });

  cards.forEach(card => observer.observe(card));
})();
