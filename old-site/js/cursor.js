/* ============================================
   CUSTOM CURSOR — Glowing Cyan Crosshair + Comet Trail
   ============================================ */

(function() {
  // Don't run on mobile
  if (window.innerWidth <= 768 || 'ontouchstart' in window) return;

  const cursor = document.createElement('div');
  cursor.id = 'custom-cursor';
  cursor.innerHTML = `
    <div class="cursor-crosshair">
      <div class="cursor-h"></div>
      <div class="cursor-v"></div>
      <div class="cursor-dot"></div>
      <div class="cursor-ring"></div>
    </div>
  `;
  document.body.appendChild(cursor);

  // Styles
  const style = document.createElement('style');
  style.textContent = `
    #custom-cursor {
      position: fixed;
      top: 0;
      left: 0;
      pointer-events: none;
      z-index: 100001;
      mix-blend-mode: screen;
    }

    .cursor-crosshair {
      position: relative;
      width: 30px;
      height: 30px;
      transform: translate(-50%, -50%);
    }

    .cursor-h, .cursor-v {
      position: absolute;
      background: rgba(0, 245, 255, 0.6);
      box-shadow: 0 0 6px rgba(0, 245, 255, 0.8);
    }

    .cursor-h {
      width: 100%;
      height: 1px;
      top: 50%;
    }

    .cursor-v {
      height: 100%;
      width: 1px;
      left: 50%;
    }

    .cursor-dot {
      position: absolute;
      width: 4px;
      height: 4px;
      background: #00F5FF;
      border-radius: 50%;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      box-shadow: 0 0 10px rgba(0, 245, 255, 0.9), 0 0 20px rgba(0, 245, 255, 0.4);
    }

    .cursor-ring {
      position: absolute;
      width: 100%;
      height: 100%;
      border: 1px solid rgba(0, 245, 255, 0.25);
      border-radius: 50%;
      top: 0;
      left: 0;
      transition: transform 0.15s ease-out, border-color 0.15s ease;
    }

    #custom-cursor.hovering .cursor-ring {
      transform: scale(1.5);
      border-color: rgba(108, 99, 255, 0.5);
    }

    .comet-trail {
      position: fixed;
      pointer-events: none;
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: rgba(0, 245, 255, 0.6);
      z-index: 100000;
      transition: opacity 0.4s ease, transform 0.4s ease;
    }
  `;
  document.head.appendChild(style);

  let mouseX = -100, mouseY = -100;
  let cursorX = -100, cursorY = -100;
  const trailDots = [];
  const TRAIL_LENGTH = 12;
  const TRAIL_DECAY = 0.06;

  // Create trail dots
  for (let i = 0; i < TRAIL_LENGTH; i++) {
    const dot = document.createElement('div');
    dot.className = 'comet-trail';
    dot.style.opacity = 0;
    document.body.appendChild(dot);
    trailDots.push({ el: dot, x: -100, y: -100, alpha: 0 });
  }

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  // Hover detection for interactive elements
  document.addEventListener('mouseover', (e) => {
    const t = e.target;
    if (t.tagName === 'A' || t.tagName === 'BUTTON' || t.closest('a') || t.closest('button') || t.classList.contains('project-card') || t.classList.contains('trophy-card') || t.classList.contains('holo-chip') || t.classList.contains('nav-item')) {
      cursor.classList.add('hovering');
    }
  });

  document.addEventListener('mouseout', (e) => {
    const t = e.target;
    if (t.tagName === 'A' || t.tagName === 'BUTTON' || t.closest('a') || t.closest('button') || t.classList.contains('project-card') || t.classList.contains('trophy-card') || t.classList.contains('holo-chip') || t.classList.contains('nav-item')) {
      cursor.classList.remove('hovering');
    }
  });

  function animate() {
    // Smooth cursor follow
    cursorX += (mouseX - cursorX) * 0.15;
    cursorY += (mouseY - cursorY) * 0.15;
    cursor.style.transform = `translate(${cursorX}px, ${cursorY}px)`;

    // Update trail
    for (let i = trailDots.length - 1; i > 0; i--) {
      trailDots[i].x = trailDots[i - 1].x;
      trailDots[i].y = trailDots[i - 1].y;
    }
    trailDots[0].x = cursorX;
    trailDots[0].y = cursorY;

    trailDots.forEach((dot, i) => {
      const progress = i / TRAIL_LENGTH;
      const size = 4 * (1 - progress * 0.7);
      const alpha = 0.5 * (1 - progress);

      dot.el.style.transform = `translate(${dot.x - size / 2}px, ${dot.y - size / 2}px)`;
      dot.el.style.width = size + 'px';
      dot.el.style.height = size + 'px';
      dot.el.style.opacity = alpha;
      dot.el.style.background = `rgba(0, 245, 255, ${alpha})`;
      dot.el.style.boxShadow = `0 0 ${6 * (1 - progress)}px rgba(0, 245, 255, ${alpha * 0.5})`;
    });

    requestAnimationFrame(animate);
  }

  animate();
})();
