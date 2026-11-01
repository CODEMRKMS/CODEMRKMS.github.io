/* ============================================
   HERO — Auto-orbiting Solar System Background
   ============================================ */

(function () {
  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    const fallback = document.getElementById('hero-stars-fallback');
    if (fallback) {
      fallback.style.display = 'block';
      const cvs = document.createElement('canvas');
      cvs.style.width = '100%'; cvs.style.height = '100%';
      fallback.appendChild(cvs);
      const ctx = cvs.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      cvs.width = fallback.offsetWidth * dpr;
      cvs.height = fallback.offsetHeight * dpr;
      ctx.scale(dpr, dpr);
      const mStars = [];
      for (let i = 0; i < 200; i++) {
        mStars.push({ x: Math.random() * fallback.offsetWidth, y: Math.random() * fallback.offsetHeight, r: Math.random() * 1.5, a: Math.random(), s: 0.005 + Math.random() * 0.01 });
      }
      (function draw() {
        ctx.clearRect(0, 0, fallback.offsetWidth, fallback.offsetHeight);
        mStars.forEach(s => { s.a += s.s; if (s.a > 1 || s.a < 0) s.s *= -1; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fillStyle = `rgba(240,240,255,${Math.abs(s.a)})`; ctx.fill(); });
        requestAnimationFrame(draw);
      })();
    }
    initHeroText();
    return;
  }

  const canvas = document.getElementById('hero-canvas');
  if (!canvas || typeof THREE === 'undefined') { initHeroText(); return; }

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x020208, 0.004);
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.set(0, 22, 55);
  camera.lookAt(0, 0, 0);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  // Stars
  const sGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array(2000 * 3);
  for (let i = 0; i < 2000; i++) { const r = 120 + Math.random() * 180, t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1); sPos[i*3] = r*Math.sin(p)*Math.cos(t); sPos[i*3+1] = r*Math.sin(p)*Math.sin(t); sPos[i*3+2] = r*Math.cos(p); }
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  const stars = new THREE.Points(sGeo, new THREE.PointsMaterial({ color: 0xeeeeff, size: 0.35, transparent: true, opacity: 0.7, sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(stars);

  // Lighting
  const sunLight = new THREE.PointLight(0xffcc44, 3, 200); scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x111133, 0.4));

  // Sun
  const sun = new THREE.Mesh(new THREE.SphereGeometry(3, 64, 64), new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
  scene.add(sun);
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(3.6, 32, 32), new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.2, side: THREE.BackSide })));
  const cCvs = document.createElement('canvas'); cCvs.width = cCvs.height = 256;
  const cCtx = cCvs.getContext('2d'); const g = cCtx.createRadialGradient(128,128,0,128,128,128);
  g.addColorStop(0,'rgba(255,200,50,0.5)'); g.addColorStop(0.2,'rgba(255,150,30,0.25)'); g.addColorStop(0.5,'rgba(255,100,0,0.06)'); g.addColorStop(1,'rgba(255,50,0,0)');
  cCtx.fillStyle = g; cCtx.fillRect(0,0,256,256);
  const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cCvs), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  corona.scale.set(22, 22, 1); scene.add(corona);

  // Planet factory
  const planets = [];
  function mkPlanet(c) {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(c.size, 48, 48), new THREE.MeshStandardMaterial({ color: c.color, roughness: c.rough || 0.7, metalness: 0.2, emissive: c.em || 0, emissiveIntensity: c.emI || 0 }));
    if (c.tilt) body.rotation.z = c.tilt;
    grp.add(body);
    const wire = new THREE.Mesh(new THREE.SphereGeometry(c.size * 1.015, 14, 10), new THREE.MeshBasicMaterial({ color: c.wc || 0xffffff, wireframe: true, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
    grp.add(wire);
    grp.add(new THREE.Mesh(new THREE.SphereGeometry(c.size * 1.12, 32, 32), new THREE.MeshBasicMaterial({ color: c.ac || c.color, transparent: true, opacity: 0.07, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false })));
    scene.add(grp);
    const curve = new THREE.EllipseCurve(0, 0, c.orbit, c.orbit, 0, Math.PI * 2, false, 0);
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(128).map(p => new THREE.Vector3(p.x, 0, p.y))), new THREE.LineBasicMaterial({ color: c.oc || 0x222244, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false })));
    planets.push({ grp, body, wire, orbit: c.orbit, speed: c.spd, angle: c.sa || Math.random() * Math.PI * 2, spin: c.spin || 0.01, wobble: c.wb || 0.5 });
    return grp;
  }

  mkPlanet({ size: 0.35, color: 0x8c7e6d, wc: 0xaaa, orbit: 7, spd: 0.5, spin: 0.003, sa: 1.2 });
  mkPlanet({ size: 0.7, color: 0xe8cda0, wc: 0xffeebb, orbit: 11, spd: 0.35, spin: 0.002, sa: 3.8 });
  const earthG = mkPlanet({ size: 0.75, color: 0x2266aa, wc: 0x44ccff, orbit: 16, spd: 0.25, spin: 0.015, sa: 5, tilt: 0.41 });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), new THREE.MeshStandardMaterial({ color: 0xaaa, roughness: 0.9 }));
  earthG.add(moon);
  mkPlanet({ size: 0.5, color: 0xc1440e, wc: 0xff6633, orbit: 22, spd: 0.18, spin: 0.014, sa: 0.5 });
  mkPlanet({ size: 2.2, color: 0xc88b3a, wc: 0xddaa55, orbit: 33, spd: 0.08, spin: 0.025, sa: 2.2, wb: 1.2 });
  const satG = mkPlanet({ size: 1.8, color: 0xdaa520, wc: 0xffdd55, orbit: 44, spd: 0.06, spin: 0.02, sa: 4.5, tilt: 0.47 });
  [{ i: 2.3, o: 3, c: 0xddcc88, op: 0.25 }, { i: 3.1, o: 3.8, c: 0xccbb77, op: 0.18 }, { i: 3.9, o: 4.3, c: 0xbbaa66, op: 0.1 }].forEach(r => {
    const rm = new THREE.Mesh(new THREE.RingGeometry(r.i, r.o, 96), new THREE.MeshBasicMaterial({ color: r.c, side: THREE.DoubleSide, transparent: true, opacity: r.op, blending: THREE.AdditiveBlending, depthWrite: false }));
    rm.rotation.x = Math.PI * 0.47; satG.add(rm);
  });

  let mx = 0, my = 0;
  document.addEventListener('mousemove', e => { mx = (e.clientX / window.innerWidth) * 2 - 1; my = -(e.clientY / window.innerHeight) * 2 + 1; });
  window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta(), t = clock.getElapsedTime();
    camera.position.x += (mx * 6 - camera.position.x) * 0.02;
    camera.position.y += (22 + my * 4 - camera.position.y) * 0.02;
    camera.lookAt(0, 0, 0);
    stars.rotation.y += 0.00006;
    const pulse = 1 + Math.sin(t * 1.5) * 0.04;
    sun.scale.set(pulse, pulse, pulse); corona.scale.set(22 * pulse, 22 * pulse, 1);
    sunLight.intensity = 3 + Math.sin(t * 2) * 0.4;
    planets.forEach((p, i) => { p.angle += p.speed * dt; p.grp.position.x = Math.cos(p.angle) * p.orbit; p.grp.position.z = Math.sin(p.angle) * p.orbit; p.grp.position.y = Math.sin(p.angle * 0.7 + i) * p.wobble; p.body.rotation.y += p.spin; p.wire.rotation.y -= p.spin * 0.6; p.wire.rotation.x += p.spin * 0.2; });
    const ma = t * 1.8; moon.position.set(Math.cos(ma) * 1.5, 0.1, Math.sin(ma) * 1.5);
    renderer.render(scene, camera);
  }
  animate();
  initHeroText();

  function initHeroText() {
    const nameEl = document.querySelector('.hero-name');
    if (nameEl) {
      nameEl.querySelectorAll('.letter').forEach((l, i) => {
        const rx = (Math.random() - 0.5) * 400, ry = (Math.random() - 0.5) * 300, rr = (Math.random() - 0.5) * 90;
        l.style.transform = `translate(${rx}px,${ry}px) rotate(${rr}deg)`; l.style.opacity = '0';
        setTimeout(() => { l.style.transition = `all 0.8s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.05}s`; l.style.transform = 'translate(0,0) rotate(0deg)'; l.style.opacity = '1'; l.classList.add('landed'); }, 800 + i * 50);
      });
      if (window.innerWidth > 768) {
        nameEl.addEventListener('mousemove', e => { const r = nameEl.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; nameEl.style.transform = `rotateY(${x*12}deg) rotateX(${-y*8}deg)`; });
        nameEl.addEventListener('mouseleave', () => { nameEl.style.transform = 'rotateY(0) rotateX(0)'; });
      }
    }
    const tw = document.querySelector('.typewriter-text');
    if (tw) {
      const titles = ['Software Engineer','AI/ML Builder','Full-Stack Developer','Hackathon Finalist'];
      let ti=0,ci=0,del=false,spd=80;
      (function type(){const c=titles[ti];if(del){tw.textContent=c.substring(0,ci-1);ci--;spd=40}else{tw.textContent=c.substring(0,ci+1);ci++;spd=80}if(!del&&ci===c.length){spd=2000;del=true}else if(del&&ci===0){del=false;ti=(ti+1)%titles.length;spd=400}setTimeout(type,spd)})();
    }
  }

  const cta = document.querySelector('.hero-cta');
  if (cta && typeof ParticleSystem !== 'undefined') {
    const pc = document.createElement('canvas'); pc.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99998;'; document.body.appendChild(pc);
    const ps = new ParticleSystem(pc);
    cta.addEventListener('mouseenter', () => { const r = cta.getBoundingClientRect(); ps.rocketBurst(r.left + r.width / 2, r.top); });
  }
})();
