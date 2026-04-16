/* ============================================
   ABOUT — Radar Chart, Orbiting Icons, Bio Reveal
   ============================================ */

(function() {
  // ---- Orbiting Skill Icons ----
  const hexContainer = document.querySelector('.hex-container');
  if (hexContainer) {
    const skills = [
      { label: 'PY', color: '#3776AB' },
      { label: 'JS', color: '#F7DF1E' },
      { label: 'TS', color: '#3178C6' },
      { label: 'R', color: '#61DAFB' },  // React
      { label: 'N', color: '#339933' },    // Node
      { label: 'M', color: '#47A248' }     // Mongo
    ];

    const ring = hexContainer.querySelector('.hex-ring');
    if (ring) {
      skills.forEach((skill, i) => {
        const icon = document.createElement('div');
        icon.className = 'orbit-icon';
        icon.textContent = skill.label;
        icon.style.color = skill.color;
        icon.style.borderColor = skill.color;

        // Position around the ring
        const angle = (i / skills.length) * Math.PI * 2;
        const radius = ring.offsetWidth / 2 || 140;
        const cx = radius;
        const cy = radius;
        icon.style.left = (cx + Math.cos(angle) * radius - 18) + 'px';
        icon.style.top = (cy + Math.sin(angle) * radius - 18) + 'px';

        ring.appendChild(icon);
      });
    }
  }

  // ---- Radar Chart ----
  const radarCanvas = document.getElementById('skill-radar');
  if (radarCanvas && typeof Chart !== 'undefined') {
    const ctx = radarCanvas.getContext('2d');

    const data = {
      labels: ['AI / ML', 'Frontend', 'Backend', 'Systems', 'Hackathons'],
      datasets: [{
        label: 'Skill Level',
        data: [85, 80, 75, 70, 90],
        backgroundColor: 'rgba(108, 99, 255, 0.15)',
        borderColor: 'rgba(108, 99, 255, 0.8)',
        borderWidth: 2,
        pointBackgroundColor: '#00F5FF',
        pointBorderColor: '#00F5FF',
        pointHoverBackgroundColor: '#FFB830',
        pointHoverBorderColor: '#FFB830',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    };

    const config = {
      type: 'radar',
      data: data,
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          r: {
            beginAtZero: true,
            max: 100,
            ticks: {
              display: false,
              stepSize: 20
            },
            grid: {
              color: 'rgba(108, 99, 255, 0.1)',
              lineWidth: 1
            },
            angleLines: {
              color: 'rgba(108, 99, 255, 0.15)',
              lineWidth: 1
            },
            pointLabels: {
              font: {
                family: "'Orbitron', sans-serif",
                size: 10,
                weight: '600'
              },
              color: 'rgba(240, 240, 255, 0.6)',
              padding: 15
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(5, 5, 8, 0.9)',
            titleFont: { family: "'Orbitron', sans-serif", size: 11 },
            bodyFont: { family: "'JetBrains Mono', monospace", size: 11 },
            borderColor: 'rgba(108, 99, 255, 0.3)',
            borderWidth: 1,
            cornerRadius: 8
          }
        },
        animation: {
          duration: 1500,
          easing: 'easeOutQuart'
        }
      }
    };

    // Animate on scroll into view
    let chartCreated = false;
    const observeRadar = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !chartCreated) {
          chartCreated = true;
          new Chart(ctx, config);
        }
      });
    }, { threshold: 0.5 });

    observeRadar.observe(radarCanvas);
  }

  // ---- Bio Line-by-Line Reveal ----
  const bioLines = document.querySelectorAll('.bio-line');
  if (bioLines.length > 0) {
    const bioObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -50px 0px' });

    bioLines.forEach((line, i) => {
      line.style.transitionDelay = `${i * 0.15}s`;
      bioObserver.observe(line);
    });
  }

  // ---- Skill Pills Staggered Animation ----
  const pills = document.querySelectorAll('.skill-pill');
  pills.forEach((pill, i) => {
    pill.style.setProperty('--bob-delay', `${i * 0.2}s`);
    pill.style.setProperty('--bob-duration', `${2.5 + Math.random() * 1.5}s`);
  });
})();
