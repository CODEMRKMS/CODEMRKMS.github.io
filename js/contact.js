/* ============================================
   CONTACT — Wireframe Globe + Form FX
   ============================================ */

(function() {
  const isMobile = window.innerWidth <= 768;

  // ---- Wireframe Globe (Three.js) ----
  const globeCanvas = document.getElementById('globe-canvas');
  if (globeCanvas && typeof THREE !== 'undefined' && !isMobile) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, globeCanvas.offsetWidth / globeCanvas.offsetHeight, 0.1, 1000);
    camera.position.z = 4;

    const renderer = new THREE.WebGLRenderer({ canvas: globeCanvas, alpha: true, antialias: true });
    renderer.setSize(globeCanvas.offsetWidth, globeCanvas.offsetHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Wireframe sphere
    const geometry = new THREE.SphereGeometry(1.5, 24, 24);
    const material = new THREE.MeshBasicMaterial({
      color: 0x6C63FF,
      wireframe: true,
      transparent: true,
      opacity: 0.3
    });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    // Inner sphere
    const innerGeo = new THREE.SphereGeometry(1.45, 16, 16);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x00F5FF,
      wireframe: true,
      transparent: true,
      opacity: 0.1
    });
    const innerSphere = new THREE.Mesh(innerGeo, innerMat);
    scene.add(innerSphere);

    // Points on globe
    const pointsGeo = new THREE.BufferGeometry();
    const pointPositions = [];
    for (let i = 0; i < 200; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 1.52;
      pointPositions.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );
    }
    pointsGeo.setAttribute('position', new THREE.Float32BufferAttribute(pointPositions, 3));
    const pointsMat = new THREE.PointsMaterial({
      color: 0x00F5FF,
      size: 0.02,
      transparent: true,
      opacity: 0.6
    });
    const points = new THREE.Points(pointsGeo, pointsMat);
    scene.add(points);

    function animateGlobe() {
      requestAnimationFrame(animateGlobe);
      sphere.rotation.y += 0.003;
      sphere.rotation.x += 0.001;
      innerSphere.rotation.y -= 0.002;
      innerSphere.rotation.x -= 0.001;
      points.rotation.y += 0.003;
      points.rotation.x += 0.001;
      renderer.render(scene, camera);
    }
    animateGlobe();

    window.addEventListener('resize', () => {
      const w = globeCanvas.offsetWidth;
      const h = globeCanvas.offsetHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
  }

  // ---- Contact Form Submit Handler ----
  const form = document.getElementById('contact-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = form.querySelector('.form-submit');
      const originalText = btn.innerHTML;
      btn.innerHTML = '<span>✓ TRANSMITTED</span>';
      btn.style.background = 'linear-gradient(135deg, #00FF88, #00CC66)';

      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.style.background = '';
        form.reset();
      }, 3000);
    });
  }

  // ---- Holo Chip Flip Animation ----
  const chips = document.querySelectorAll('.holo-chip');
  const chipObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateX(0)';
      }
    });
  }, { threshold: 0.2 });

  chips.forEach((chip, i) => {
    chip.style.opacity = '0';
    chip.style.transform = 'translateX(-30px)';
    chip.style.transition = `all 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.15}s`;
    chipObserver.observe(chip);
  });
})();
