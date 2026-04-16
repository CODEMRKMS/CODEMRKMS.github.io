/* ============================================
   PROJECTS — 3D Cards, Shimmer, Modal Expansion
   ============================================ */

(function() {
  const cards = document.querySelectorAll('.project-card');
  const modalOverlay = document.getElementById('project-modal-overlay');
  const modal = document.querySelector('.project-modal');
  const modalClose = document.querySelector('.modal-close');

  // Project data for modals
  const projectData = {
    insaaf: {
      title: 'INSAAF',
      color: '#8B5CF6',
      description: 'A multilingual AI chatbot that delivers legal assistance using Indian laws.',
      bullets: [
        'Built with Python, LangChain, OpenAI API, MongoDB, and React',
        'Designed a multilingual AI chatbot that delivers legal assistance using Indian laws',
        'Integrated OpenAI and LangChain for context-aware legal responses through a React interface',
        'Supports multiple Indian languages for accessible legal guidance',
        'Runner-up at Gen AI Hackathon by Google-backed Slang Labs'
      ],
      tech: ['Python', 'LangChain', 'OpenAI API', 'MongoDB', 'React']
    },
    voicepay: {
      title: 'VOICEPAY',
      color: '#FFB830',
      description: 'Voice-first UPI payment SDK for mobile and IVR systems — Amazon HackOn Season 5 Finalist.',
      bullets: [
        'Built with TypeScript, Node.js, Firebase, and GitHub Actions',
        'Engineered a multilingual, voice-first UPI payment SDK for mobile and IVR systems',
        'Improves accessibility for visually impaired and non-technical users',
        'Configured automated CI/CD workflows with GitHub Actions for testing, linting, and Firebase deployment',
        'Shortlisted from 60,000+ participants for the prototype round'
      ],
      tech: ['TypeScript', 'Node.js', 'Firebase', 'GitHub Actions']
    },
    trading: {
      title: 'ALGORITHMIC TRADING BOT',
      color: '#00FF88',
      description: 'Intraday trading system leveraging RSI and MA crossover strategies.',
      bullets: [
        'Built with Python, Shoonya API, and Pandas',
        'Developed an intraday trading system leveraging RSI and MA crossover via Shoonya API',
        'Enabled computerized backtesting and performance evaluation using Pandas',
        'Structured trade logic and signal modules for scalable strategy simulations',
        'Work in progress — expanding to multi-strategy support'
      ],
      tech: ['Python', 'Shoonya API', 'Pandas']
    },
    kanoon: {
      title: 'KANOON',
      color: '#00F5FF',
      description: 'A responsive web portal emulating a law firm with lawyer listings and client intake.',
      bullets: [
        'Built with React, Supabase, SQL, HTML, CSS, and JavaScript',
        'Created a responsive web portal emulating a law firm with lawyer listings and client intake forms',
        'Implemented authentication, data management, and CRUD operations using Supabase and SQL',
        'Clean law firm aesthetic with professional client-facing interface',
        'Secure role-based access control for different user types'
      ],
      tech: ['React', 'Supabase', 'SQL', 'HTML/CSS', 'JavaScript']
    }
  };

  // ---- Holographic Shimmer (mouse tracking) ----
  cards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      card.style.setProperty('--mouse-x', x + '%');
      card.style.setProperty('--mouse-y', y + '%');
    });
  });

  // ---- 3D Tilt Effect ----
  if (window.innerWidth > 768 && typeof VanillaTilt !== 'undefined') {
    VanillaTilt.init(document.querySelectorAll('.project-card'), {
      max: 8,
      speed: 400,
      glare: true,
      'max-glare': 0.1,
      scale: 1.02,
      perspective: 1000
    });
  }

  // ---- Modal Open/Close ----
  cards.forEach(card => {
    const expandBtn = card.querySelector('.card-expand');
    const projectKey = card.getAttribute('data-project');

    function openModal() {
      if (!projectKey || !projectData[projectKey]) return;
      const data = projectData[projectKey];

      const modalTitle = modal.querySelector('.modal-title');
      const modalBody = modal.querySelector('.modal-body');
      const modalTech = modal.querySelector('.modal-tech');

      modalTitle.textContent = data.title;
      modalTitle.style.color = data.color;

      let bulletsHtml = '<p style="margin-bottom: 16px; color: var(--ghost-dim);">' + data.description + '</p><ul>';
      data.bullets.forEach(b => bulletsHtml += `<li>${b}</li>`);
      bulletsHtml += '</ul>';
      modalBody.innerHTML = bulletsHtml;

      modalTech.innerHTML = '';
      data.tech.forEach(t => {
        const tag = document.createElement('span');
        tag.className = 'tech-tag';
        tag.textContent = t;
        tag.style.color = data.color;
        tag.style.borderColor = data.color;
        modalTech.appendChild(tag);
      });

      modal.style.setProperty('--card-color', data.color);
      modal.style.borderColor = data.color;
      modal.style.boxShadow = `0 0 60px ${data.color}33`;

      modalOverlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    if (expandBtn) expandBtn.addEventListener('click', openModal);
    card.addEventListener('dblclick', openModal);
  });

  if (modalClose) {
    modalClose.addEventListener('click', closeModal);
  }

  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  function closeModal() {
    if (modalOverlay) {
      modalOverlay.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  // ---- Scroll-triggered card reveal ----
  const cardObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.1 });

  cards.forEach((card, i) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(40px)';
    card.style.transition = `all 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.15}s`;
    cardObserver.observe(card);
  });

  // ---- Candlestick Animation (Trading Bot card) ----
  const candlestickContainers = document.querySelectorAll('.candlestick-chart');
  candlestickContainers.forEach(container => {
    const candles = container.querySelectorAll('.candle');
    candles.forEach((candle, i) => {
      candle.style.setProperty('--candle-delay', `${i * 0.3}s`);
      candle.style.setProperty('--candle-h', `${12 + Math.random() * 24}px`);
    });
  });
})();
