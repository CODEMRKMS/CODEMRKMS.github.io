/* ============================================
   EXPERIENCE — Three.js Scroll-Zoom Flythrough
   ============================================ */

(function () {
  if (window.innerWidth <= 768) return; // Mobile uses CSS-only fallback

  const canvas = document.getElementById('exp-canvas');
  const section = document.getElementById('experience');
  if (!canvas || !section || typeof THREE === 'undefined') return;

  // ============ SCENE ============
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x020208, 0.006);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.position.set(0, 6, 100);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  // ============ STARFIELD ============
  const starCount = 1500;
  const starGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 80 + Math.random() * 200, t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1);
    sp[i*3] = r*Math.sin(p)*Math.cos(t); sp[i*3+1] = r*Math.sin(p)*Math.sin(t); sp[i*3+2] = r*Math.cos(p);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xddeeff, size: 0.3, transparent: true, opacity: 0.6,
    sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  scene.add(stars);

  // Cosmic dust
  const dGeo = new THREE.BufferGeometry();
  const dp = new Float32Array(300 * 3);
  for (let i = 0; i < 300; i++) { dp[i*3] = (Math.random()-0.5)*100; dp[i*3+1] = (Math.random()-0.5)*40; dp[i*3+2] = (Math.random()-0.5)*200; }
  dGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  scene.add(new THREE.Points(dGeo, new THREE.PointsMaterial({
    color: 0x6C63FF, size: 0.1, transparent: true, opacity: 0.15,
    sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false
  })));

  // Lighting
  scene.add(new THREE.AmbientLight(0x111133, 0.5));
  const stationLight = new THREE.PointLight(0x6C63FF, 2, 60);
  stationLight.position.set(0, 0, 0);
  scene.add(stationLight);

  // ============ STATION OBJECTS (one per experience) ============
  const stationConfigs = [
    { z: 80, color: 0x00F5FF, glowColor: 0x00CCDD, size: 1.5, label: 'VOLVO GROUP' },
    { z: 45, color: 0x6C63FF, glowColor: 0x5544CC, size: 1.2, label: 'MADTALES.AI' },
    { z: 15, color: 0xFFB830, glowColor: 0xDD9900, size: 1.0, label: 'ASTRONOMY CLUB' }
  ];

  const stations = stationConfigs.map(cfg => {
    const group = new THREE.Group();
    group.position.set(0, 0, cfg.z);

    // Core sphere
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(cfg.size, 32, 32),
      new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.9 })
    );
    group.add(core);

    // Wireframe shell
    const wireShell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(cfg.size * 1.8, 1),
      new THREE.MeshBasicMaterial({ color: cfg.color, wireframe: true, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    group.add(wireShell);

    // Outer glow
    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(cfg.size * 2.5, 32, 32),
      new THREE.MeshBasicMaterial({ color: cfg.glowColor, transparent: true, opacity: 0.05, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false })
    ));

    // Orbiting ring
    const ringGeo = new THREE.TorusGeometry(cfg.size * 2.2, 0.03, 8, 64);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = Math.PI * 0.5;
    group.add(ring);

    // Second ring (tilted)
    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(cfg.size * 2.8, 0.02, 8, 64),
      new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring2.rotation.x = Math.PI * 0.35;
    ring2.rotation.z = Math.PI * 0.25;
    group.add(ring2);

    scene.add(group);
    return { group, core, wireShell, ring, ring2, z: cfg.z };
  });

  // ============ SCROLL STATE ============
  const DAMPING = 0.06;
  const MAX_Z = 100;
  const MIN_Z = 5;
  let targetZ = MAX_Z;
  let currentZ = MAX_Z;
  let currentStep = -1;
  let isInSection = false;

  // DOM refs
  const cards = document.querySelectorAll('.exp-card');
  const dots = document.querySelectorAll('.exp-dot');
  const header = document.querySelector('.exp-header');
  const zone = document.querySelector('.exp-zone');
  const zoneName = document.querySelector('.exp-zone-name');
  const depthEl = document.querySelector('.exp-depth');
  const depthLabel = document.querySelector('.exp-depth-label');
  const depthFill = document.getElementById('exp-depth-fill');
  const expNav = document.querySelector('.exp-nav');

  function getScrollState() {
    const rect = section.getBoundingClientRect();
    const sectionTop = window.scrollY + rect.top;
    const sectionHeight = section.offsetHeight;
    const scrollRange = sectionHeight - window.innerHeight;
    const scrollInSection = window.scrollY - sectionTop;
    const progress = Math.min(Math.max(scrollInSection / scrollRange, 0), 1);

    // Check if section is in viewport
    const inView = rect.top < window.innerHeight && rect.bottom > 0;
    const isActive = scrollInSection >= 0 && scrollInSection <= scrollRange;

    return { progress, inView, isActive };
  }

  function updateFromScroll() {
    const { progress, inView, isActive } = getScrollState();
    isInSection = isActive;

    // Show/hide overlays
    const overlayOpacity = isActive ? 1 : 0;
    if (header) header.style.opacity = overlayOpacity;
    if (expNav) expNav.style.opacity = overlayOpacity;
    if (zone) zone.style.opacity = overlayOpacity;
    if (depthEl) depthEl.style.opacity = overlayOpacity;

    if (!isActive) {
      // Hide all cards when not in section
      cards.forEach(c => c.classList.remove('active'));
      currentStep = -1;
      return;
    }

    // Map progress to camera Z
    targetZ = MAX_Z - progress * (MAX_Z - MIN_Z);

    // Determine which step we're on (3 equal segments)
    const numSteps = stationConfigs.length;
    const step = Math.min(Math.floor(progress * numSteps), numSteps - 1);

    // Card visibility — show current step's card with smooth transitions
    const segmentSize = 1 / numSteps;
    const segmentProgress = (progress - step * segmentSize) / segmentSize;

    cards.forEach((card, i) => {
      if (i === step) {
        card.classList.add('active');
        // Fade in at start, fade out at end of segment
        let cardOpacity = 1;
        if (segmentProgress < 0.15) cardOpacity = segmentProgress / 0.15;
        else if (segmentProgress > 0.85 && step < numSteps - 1) cardOpacity = (1 - segmentProgress) / 0.15;
        card.style.opacity = Math.max(0, Math.min(1, cardOpacity));
      } else {
        card.classList.remove('active');
        card.style.opacity = 0;
      }
    });

    // Update step dots
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === step);
    });

    // Zone name
    if (zoneName) {
      zoneName.textContent = stationConfigs[step].label;
      zoneName.classList.add('active');
    }

    // Depth HUD
    if (depthFill) {
      depthFill.style.width = (progress * 100) + '%';
    }
    if (depthLabel) {
      depthLabel.textContent = 'DEPTH ' + Math.round(currentZ) + ' AU';
    }

    currentStep = step;
  }

  window.addEventListener('scroll', updateFromScroll, { passive: true });
  updateFromScroll();

  // ============ MOUSE PARALLAX ============
  let mx = 0, my = 0;
  document.addEventListener('mousemove', e => {
    mx = (e.clientX / window.innerWidth) * 2 - 1;
    my = -(e.clientY / window.innerHeight) * 2 + 1;
  });

  // ============ RESIZE ============
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ============ ANIMATION LOOP ============
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);

    // Only render when section is near viewport
    const rect = section.getBoundingClientRect();
    if (rect.bottom < -200 || rect.top > window.innerHeight + 200) return;

    const dt = clock.getDelta();
    const t = clock.getElapsedTime();

    // Smooth camera Z
    currentZ += (targetZ - currentZ) * DAMPING;
    camera.position.z = currentZ;

    // Mouse parallax
    camera.position.x += (mx * 4 - camera.position.x) * 0.03;
    camera.position.y += (6 + my * 3 - camera.position.y) * 0.03;
    camera.lookAt(0, 0, Math.max(0, currentZ - 30));

    // Stars
    stars.rotation.y += 0.00005;

    // Station light follows camera target
    stationLight.position.z = currentZ - 15;
    stationLight.intensity = 2 + Math.sin(t * 2) * 0.5;

    // Animate stations
    stations.forEach((s, i) => {
      // Wireframe rotation
      s.wireShell.rotation.y += 0.005;
      s.wireShell.rotation.x += 0.003;

      // Ring rotation
      s.ring.rotation.z += 0.008;
      s.ring2.rotation.z -= 0.005;
      s.ring2.rotation.y += 0.003;

      // Core pulse
      const p = 1 + Math.sin(t * 2 + i * 2) * 0.1;
      s.core.scale.set(p, p, p);

      // Glow when camera is near
      const dist = Math.abs(currentZ - s.z);
      const nearFactor = Math.max(0, 1 - dist / 25);
      s.core.material.opacity = 0.5 + nearFactor * 0.5;
      s.wireShell.material.opacity = 0.08 + nearFactor * 0.15;
    });

    renderer.render(scene, camera);
  }

  animate();
})();
