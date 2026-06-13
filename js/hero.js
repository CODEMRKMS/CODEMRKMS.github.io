/* ============================================
   HERO — Three.js 3D Scene + Floating Code
   ============================================ */

(function () {
  const isMobile = window.innerWidth <= 768;

  // ---- Mobile Fallback: CSS Star Field ----
  if (isMobile) {
    const fallback = document.getElementById('hero-stars-fallback');
    if (fallback) {
      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      fallback.appendChild(canvas);
      const ctx = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      canvas.width = fallback.offsetWidth * dpr;
      canvas.height = fallback.offsetHeight * dpr;
      ctx.scale(dpr, dpr);

      const stars = [];
      for (let i = 0; i < 200; i++) {
        stars.push({
          x: Math.random() * fallback.offsetWidth,
          y: Math.random() * fallback.offsetHeight,
          r: Math.random() * 1.5,
          alpha: Math.random(),
          speed: 0.005 + Math.random() * 0.01
        });
      }

      function drawStars() {
        ctx.clearRect(0, 0, fallback.offsetWidth, fallback.offsetHeight);
        stars.forEach(s => {
          s.alpha += s.speed;
          if (s.alpha > 1 || s.alpha < 0) s.speed *= -1;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(240, 240, 255, ${Math.abs(s.alpha)})`;
          ctx.fill();
        });
        requestAnimationFrame(drawStars);
      }
      drawStars();
    }
    initHeroText();
    return;
  }

  // ---- Desktop: Three.js Scene ----
  const canvas = document.getElementById('hero-canvas');
  if (!canvas || typeof THREE === 'undefined') {
    initHeroText();
    return;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 50;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Code snippets and legal terms
  const snippets = [
    'def predict()', 'RSI crossover', 'Section 420 IPC', 'git push',
    'const pay = voice()', 'langchain.load()', 'npm install',
    'SELECT * FROM', 'import torch', 'model.fit()', 'sudo deploy',
    'async/await', 'docker build', 'kubectl apply', 'res.json()',
    'Section 302 IPC', 'useState()', 'backtest()', 'JWT.verify()',
    'tf.keras.Model', 'pip install', 'git merge', 'OAuth2.0',
    'CNN.forward()', 'legal_nlp()', 'RSA encrypt', 'blockchain.add()',
    'lambda x:', 'yield return', 'mutex.lock()', 'ssh deploy',
    'float[][] grid', 'try/catch', 'React.memo()', 'void main()'
  ];

  // Create text sprites
  const textGroup = new THREE.Group();
  const spriteObjects = [];

  function createTextSprite(text) {
    const canvas2d = document.createElement('canvas');
    const ctx = canvas2d.getContext('2d');
    const fontSize = 14;
    ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
    const metrics = ctx.measureText(text);
    const w = metrics.width + 20;
    const h = fontSize + 16;
    canvas2d.width = w * 2;
    canvas2d.height = h * 2;
    ctx.scale(2, 2);

    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, w, h);

    const colors = ['rgba(108,99,255,0.7)', 'rgba(0,245,255,0.6)', 'rgba(255,184,48,0.5)', 'rgba(240,240,255,0.4)'];
    ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
    ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 8;
    ctx.shadowColor = ctx.fillStyle;
    ctx.fillText(text, w / 2, h / 2);

    const texture = new THREE.CanvasTexture(canvas2d);
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.7 });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(w / 10, h / 10, 1);
    return sprite;
  }

  snippets.forEach(text => {
    const sprite = createTextSprite(text);
    const spread = 60;
    sprite.position.set(
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread * 0.5
    );

    const data = {
      sprite,
      vx: (Math.random() - 0.5) * 0.015,
      vy: (Math.random() - 0.5) * 0.015,
      vz: (Math.random() - 0.5) * 0.01,
      rotSpeed: (Math.random() - 0.5) * 0.002
    };

    spriteObjects.push(data);
    textGroup.add(sprite);
  });

  scene.add(textGroup);

  // Star particles background
  const starGeometry = new THREE.BufferGeometry();
  const starCount = 1500;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount * 3; i++) {
    starPositions[i] = (Math.random() - 0.5) * 200;
  }
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMaterial = new THREE.PointsMaterial({
    color: 0xF0F0FF,
    size: 0.15,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true
  });
  const stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);

  // Mouse tracking for gravitational lens
  let mouseNorm = { x: 0, y: 0 };
  document.addEventListener('mousemove', (e) => {
    mouseNorm.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseNorm.y = -(e.clientY / window.innerHeight) * 2 + 1;
  });

  // Animation loop
  function animate() {
    requestAnimationFrame(animate);

    // Drift snippets
    spriteObjects.forEach(obj => {
      obj.sprite.position.x += obj.vx;
      obj.sprite.position.y += obj.vy;
      obj.sprite.position.z += obj.vz;

      // Bounce off bounds
      const bound = 35;
      if (Math.abs(obj.sprite.position.x) > bound) obj.vx *= -1;
      if (Math.abs(obj.sprite.position.y) > bound) obj.vy *= -1;
      if (Math.abs(obj.sprite.position.z) > bound * 0.4) obj.vz *= -1;
    });

    // Subtle camera movement following mouse
    camera.position.x += (mouseNorm.x * 3 - camera.position.x) * 0.02;
    camera.position.y += (mouseNorm.y * 2 - camera.position.y) * 0.02;
    camera.lookAt(0, 0, 0);

    // Slow star rotation
    stars.rotation.y += 0.0002;
    stars.rotation.x += 0.0001;

    renderer.render(scene, camera);
  }

  animate();

  // Resize handler
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  initHeroText();

  // ---- Hero Text Animations ----
  function initHeroText() {
    // Letter animation
    const nameEl = document.querySelector('.hero-name');
    if (nameEl) {
      const letters = nameEl.querySelectorAll('.letter');
      letters.forEach((letter, i) => {
        // Random starting positions
        const rx = (Math.random() - 0.5) * 400;
        const ry = (Math.random() - 0.5) * 300;
        const rr = (Math.random() - 0.5) * 90;
        letter.style.transform = `translate(${rx}px, ${ry}px) rotate(${rr}deg)`;
        letter.style.opacity = '0';

        setTimeout(() => {
          letter.style.transition = `all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 0.05}s`;
          letter.style.transform = 'translate(0, 0) rotate(0deg)';
          letter.style.opacity = '1';
          letter.classList.add('landed');
        }, 800 + i * 50);
      });
    }

    // Typewriter effect
    const typewriterEl = document.querySelector('.typewriter-text');
    if (typewriterEl) {
      const titles = [
        'Software Engineer',
        'AI/ML Builder',
        'Full-Stack Developer',
        'Hackathon Finalist'
      ];
      let titleIndex = 0;
      let charIndex = 0;
      let isDeleting = false;
      let speed = 80;

      function typewrite() {
        const current = titles[titleIndex];

        if (isDeleting) {
          typewriterEl.textContent = current.substring(0, charIndex - 1);
          charIndex--;
          speed = 40;
        } else {
          typewriterEl.textContent = current.substring(0, charIndex + 1);
          charIndex++;
          speed = 80;
        }

        if (!isDeleting && charIndex === current.length) {
          speed = 2000; // Pause at end
          isDeleting = true;
        } else if (isDeleting && charIndex === 0) {
          isDeleting = false;
          titleIndex = (titleIndex + 1) % titles.length;
          speed = 400;
        }

        setTimeout(typewrite, speed);
      }

      setTimeout(typewrite, 2000);
    }
  }

  // CTA Rocket Burst
  const ctaBtn = document.querySelector('.hero-cta');
  if (ctaBtn) {
    const particleCanvas = document.createElement('canvas');
    particleCanvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99998;';
    document.body.appendChild(particleCanvas);
    const ps = new ParticleSystem(particleCanvas);

    ctaBtn.addEventListener('mouseenter', (e) => {
      const rect = ctaBtn.getBoundingClientRect();
      ps.rocketBurst(rect.left + rect.width / 2, rect.top);
    });
  }
})();
