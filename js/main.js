/* ============================================
   MAIN — App Init, Fuel Gauge,
          Easter Egg, Section Warp Transitions
   ============================================ */

(function() {
  // ---- Fuel Gauge (Scroll Progress) ----
  const fuelGauge = document.getElementById('fuel-gauge');
  const fuelFill = document.getElementById('fuel-fill');

  if (fuelGauge && fuelFill) {
    function updateFuel() {
      const scrollY = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = Math.min(scrollY / docHeight * 100, 100);

      fuelFill.style.height = progress + '%';

      if (scrollY > window.innerHeight * 0.5) {
        fuelGauge.classList.add('visible');
      } else {
        fuelGauge.classList.remove('visible');
      }
    }

    window.addEventListener('scroll', updateFuel, { passive: true });
  }

  // ---- Section Warp Flash Transitions ----
  const sections = document.querySelectorAll('.section[id]');
  const flashedSections = new Set();

  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !flashedSections.has(entry.target.id)) {
        flashedSections.add(entry.target.id);
        const flash = document.createElement('div');
        flash.className = 'warp-flash';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 250);
      }
    });
  }, { threshold: 0.1 });

  sections.forEach(section => sectionObserver.observe(section));

  // ---- Easter Egg: Type "SHADAB" ----
  let easterBuffer = '';
  const easterWord = 'SHADAB';

  document.addEventListener('keydown', (e) => {
    easterBuffer += e.key.toUpperCase();
    if (easterBuffer.length > easterWord.length) {
      easterBuffer = easterBuffer.slice(-easterWord.length);
    }

    if (easterBuffer === easterWord) {
      easterBuffer = '';
      triggerEasterEgg();
    }
  });

  function triggerEasterEgg() {
    let easterCanvas = document.getElementById('easter-egg-canvas');
    if (!easterCanvas) {
      easterCanvas = document.createElement('canvas');
      easterCanvas.id = 'easter-egg-canvas';
      easterCanvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99998;pointer-events:none;';
      document.body.appendChild(easterCanvas);
    }

    const ps = new ParticleSystem(easterCanvas, {
      maxParticles: 500,
      gravity: 0,
      friction: 0.99,
      fadeRate: 0.008
    });

    ps.fullExplosion();

    // Flash the screen
    const flash = document.createElement('div');
    flash.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: radial-gradient(circle, rgba(108,99,255,0.3), transparent);
      z-index: 99997; pointer-events: none;
      animation: warpFlash 0.5s ease-out forwards;
    `;
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 500);
  }

  // ---- Smooth Scroll for Anchor Links ----
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ---- Reveal on Scroll (Generic) ----
  const revealElements = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('active');
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

  revealElements.forEach(el => revealObserver.observe(el));
})();
