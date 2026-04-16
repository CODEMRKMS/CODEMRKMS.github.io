/* ============================================
   NAVIGATION — Visibility, Glitch, Satellite Dot
   ============================================ */

(function() {
  const nav = document.getElementById('main-nav');
  const navItems = document.querySelectorAll('.nav-item');
  const satellite = document.querySelector('.nav-satellite');
  const sections = document.querySelectorAll('.section[id]');
  const hamburger = document.querySelector('.nav-hamburger');
  const navItemsContainer = document.querySelector('.nav-items');

  if (!nav) return;

  // Show nav after scrolling past hero
  let lastScroll = 0;
  const heroHeight = window.innerHeight;

  function updateNavVisibility() {
    const scrollY = window.scrollY;
    if (scrollY > heroHeight * 0.7) {
      nav.classList.add('visible');
    } else {
      nav.classList.remove('visible');
    }
    lastScroll = scrollY;
  }

  window.addEventListener('scroll', updateNavVisibility, { passive: true });

  // Active section tracking
  const observerOptions = {
    threshold: 0.3,
    rootMargin: '-10% 0px -10% 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navItems.forEach(item => {
          item.classList.remove('active');
          if (item.getAttribute('href') === `#${id}`) {
            item.classList.add('active');
            updateSatellite(item);
          }
        });
      }
    });
  }, observerOptions);

  sections.forEach(section => observer.observe(section));

  // Satellite dot positioning
  function updateSatellite(activeItem) {
    if (!satellite || !activeItem) return;
    const navRect = nav.querySelector('.nav-inner').getBoundingClientRect();
    const itemRect = activeItem.getBoundingClientRect();
    const left = itemRect.left - navRect.left + itemRect.width / 2 - 3;
    satellite.style.left = left + 'px';
  }

  // Smooth scroll on nav click
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = item.getAttribute('href');
      const target = document.querySelector(targetId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
        // Close mobile menu if open
        if (navItemsContainer) navItemsContainer.classList.remove('open');
        if (hamburger) hamburger.classList.remove('active');
      }
    });
  });

  // Mobile hamburger
  if (hamburger && navItemsContainer) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      navItemsContainer.classList.toggle('open');
    });
  }

  // Initial satellite position
  setTimeout(() => {
    const firstActive = document.querySelector('.nav-item.active') || navItems[0];
    if (firstActive) updateSatellite(firstActive);
  }, 500);
})();
