import Chart from 'chart.js/auto';
import confetti from 'canvas-confetti';

document.addEventListener('DOMContentLoaded', () => {

  // ==========================================================================
  // 1. TOAST NOTIFICATION UTILITY
  // ==========================================================================
  function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${type === 'success' ? '✓' : '⚠️'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(16px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ==========================================================================
  // 2. STICKY NAVBAR ON SCROLL
  // ==========================================================================
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      navbar?.classList.add('scrolled');
    } else {
      navbar?.classList.remove('scrolled');
    }
  }, { passive: true });

  // ==========================================================================
  // 3. MOBILE MENU TOGGLE
  // ==========================================================================
  const mobileToggle = document.getElementById('mobileMenuToggle');
  const mobileMenu   = document.getElementById('mobileMenu');

  if (mobileToggle && mobileMenu) {
    mobileToggle.addEventListener('click', () => {
      mobileToggle.classList.toggle('active');
      mobileMenu.classList.toggle('open');
      document.body.style.overflow = mobileMenu.classList.contains('open') ? 'hidden' : '';
    });

    mobileMenu.querySelectorAll('a, button').forEach(el => {
      el.addEventListener('click', () => {
        mobileToggle.classList.remove('active');
        mobileMenu.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }

  // ==========================================================================
  // 4. HERO BANNER & BACKGROUND AUTO-SLIDER
  // ==========================================================================
  const slides   = document.querySelectorAll('.hero-slide');
  const bgSlides = document.querySelectorAll('.hero-bg-slide');
  const dots     = document.querySelectorAll('.hero-dot');
  let currentSlide = 0;
  let slideInterval = null;

  function goToSlide(idx) {
    slides.forEach((s, i) => s.classList.toggle('active', i === idx));
    bgSlides.forEach((b, i) => b.classList.toggle('active', i === idx));
    dots.forEach((d, i) => d.classList.toggle('active', i === idx));
    currentSlide = idx;
  }

  function nextSlide() {
    goToSlide((currentSlide + 1) % slides.length);
  }

  function startSlideTimer() {
    if (slides.length > 1) {
      slideInterval = setInterval(nextSlide, 5000);
    }
  }

  function stopSlideTimer() {
    clearInterval(slideInterval);
  }

  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      stopSlideTimer();
      const idx = parseInt(dot.dataset.dot || '0', 10);
      goToSlide(idx);
      startSlideTimer();
    });
  });

  const sliderWrap = document.getElementById('heroSlider');
  if (sliderWrap) {
    sliderWrap.addEventListener('mouseenter', stopSlideTimer);
    sliderWrap.addEventListener('mouseleave', startSlideTimer);
  }

  startSlideTimer();

  // ==========================================================================
  // 5. SCROLL-TRIGGERED STAGGERED REVEALS (INTERSECTION OBSERVER)
  // ==========================================================================
  const revealElements = document.querySelectorAll('.reveal-up, .reveal-left, .reveal-right, .reveal-scale, .stat-card, .service-card');
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  revealElements.forEach(el => revealObserver.observe(el));

  // ==========================================================================
  // 6. ANIMATED COUNTUP COUNTERS (SYNCHRONIZED WITH STAGGERED CARDS)
  // ==========================================================================
  const counters = document.querySelectorAll('.countup-num');
  let counted = false;

  const countObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !counted) {
        counted = true;
        const delays = [50, 180, 310, 440];
        counters.forEach((counter, i) => {
          const target = parseInt(counter.dataset.target || '0', 10);
          const delay = delays[i] !== undefined ? delays[i] : (i * 130);
          const duration = 900;

          setTimeout(() => {
            let startTimestamp = null;
            const step = (timestamp) => {
              if (!startTimestamp) startTimestamp = timestamp;
              const progress = Math.min((timestamp - startTimestamp) / duration, 1);
              const easeProgress = 1 - Math.pow(1 - progress, 4);
              const currentVal = Math.floor(easeProgress * target);
              counter.innerText = currentVal.toLocaleString();
              if (progress < 1) {
                window.requestAnimationFrame(step);
              } else {
                counter.innerText = target.toLocaleString();
              }
            };
            window.requestAnimationFrame(step);
          }, delay);
        });
      }
    });
  }, { threshold: 0.3 });

  const statsSection = document.getElementById('stats');
  if (statsSection) countObserver.observe(statsSection);

  // ==========================================================================
  // 7. PROCESS TIMELINE — SEQUENTIAL ORANGE LINE + STEP REVEAL
  // ==========================================================================
  const timelineWrapper  = document.getElementById('timelineWrapper');
  const timelineTrackFill = document.getElementById('timelineTrackFill');
  const timelineSteps    = document.querySelectorAll('.timeline-step');

  if (timelineWrapper && timelineTrackFill && timelineSteps.length) {

    // How long the orange line takes to travel between nodes (ms)
    const LINE_TRAVEL_MS   = 600;   // line draw per segment
    const CONTENT_DELAY_MS = 120;   // pause after line arrives before content fades in
    const STEP_GAP_MS      = 900;   // total gap before next step starts (≥ LINE_TRAVEL_MS + CONTENT_DELAY_MS)

    let animationStarted = false;

    function runTimeline() {
      if (animationStarted) return;
      animationStarted = true;

      timelineSteps.forEach((step, idx) => {
        const delay = idx * STEP_GAP_MS;

        // 1) Grow the orange line to reach this step's node
        setTimeout(() => {
          // Target height = top-offset of step's .step-node circle relative to trackFill parent
          const stepNode    = step.querySelector('.step-node');
          const wrapperRect = timelineWrapper.getBoundingClientRect();
          const nodeRect    = stepNode.getBoundingClientRect();
          // Center of circle relative to wrapper top
          const targetH = nodeRect.top - wrapperRect.top + nodeRect.height / 2;
          timelineTrackFill.style.height = Math.max(targetH, 0) + 'px';
        }, delay);

        // 2) After line arrives (+ short pause), reveal the step content + circle
        setTimeout(() => {
          step.classList.add('step-visible');
          const circle = step.querySelector('.step-circle');
          if (circle) circle.classList.add('circle-active');
        }, delay + LINE_TRAVEL_MS + CONTENT_DELAY_MS);
      });

      // After all steps, extend line to full height
      const lastDelay = (timelineSteps.length - 1) * STEP_GAP_MS + LINE_TRAVEL_MS;
      setTimeout(() => {
        timelineTrackFill.style.height = timelineWrapper.offsetHeight + 'px';
      }, lastDelay + 300);
    }

    const tlObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          runTimeline();
          tlObserver.disconnect();
        }
      });
    }, { threshold: 0.15 });

    tlObserver.observe(timelineWrapper);
  }


  // ==========================================================================
  // 8. CASE STUDY CHART.JS INITIALIZATION
  // ==========================================================================
  const caseCanvas = document.getElementById('caseChart');
  if (caseCanvas) {
    new Chart(caseCanvas, {
      type: 'line',
      data: {
        labels: ['Month 1', 'Month 2', 'Month 3', 'Month 4', 'Month 5', 'Month 6', 'Month 7', 'Month 8', 'Month 9'],
        datasets: [{
          label: 'Monthly Revenue Run-Rate',
          data: [100000, 145000, 220000, 310000, 420000, 510000, 590000, 640000, 700000],
          borderColor: '#C4622D',
          backgroundColor: (ctx) => {
            const chart = ctx.chart;
            const { ctx: c, chartArea } = chart;
            if (!chartArea) return 'rgba(196, 98, 45, 0.1)';
            const grad = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            grad.addColorStop(0, 'rgba(196, 98, 45, 0.35)');
            grad.addColorStop(1, 'rgba(196, 98, 45, 0.0)');
            return grad;
          },
          borderWidth: 3,
          tension: 0.35,
          fill: true,
          pointBackgroundColor: '#C4622D',
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1A1A1A',
            titleColor: '#F0EDE7',
            bodyColor: '#C4622D',
            padding: 12,
            displayColors: false,
            callbacks: {
              label: (ctx) => `$${(ctx.raw).toLocaleString()}/mo Revenue`
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.06)' },
            ticks: { color: '#8A8A8A', font: { family: 'DM Sans', size: 11 } }
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.06)' },
            ticks: {
              color: '#8A8A8A',
              font: { family: 'DM Sans', size: 11 },
              callback: (v) => `$${v / 1000}k`
            }
          }
        }
      }
    });
  }

  // ==========================================================================
  // 9. TESTIMONIALS CAROUSEL SCROLL CONTROLS
  // ==========================================================================
  const tTrack = document.getElementById('testimonialTrack');
  const tPrev  = document.getElementById('tPrev');
  const tNext  = document.getElementById('tNext');

  if (tTrack && tPrev && tNext) {
    tNext.addEventListener('click', () => {
      tTrack.scrollBy({ left: 404, behavior: 'smooth' });
    });
    tPrev.addEventListener('click', () => {
      tTrack.scrollBy({ left: -404, behavior: 'smooth' });
    });
  }

  // ==========================================================================
  // 10. FAQ ACCORDION
  // ==========================================================================
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    question?.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      faqItems.forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });

  // ==========================================================================
  // 11. SCHEDULE A CALL MODAL (OPEN / CLOSE)
  // ==========================================================================
  const scheduleModal = document.getElementById('scheduleModal');
  const closeScheduleModal = document.getElementById('closeScheduleModal');

  const openScheduleTriggers = [
    document.getElementById('btnNavSchedule'),
    document.getElementById('btnHeroSchedule'),
    document.getElementById('btnMobileSchedule'),
    document.getElementById('btnFooterSchedule'),
  ];

  function openSchedule() {
    scheduleModal?.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeSchedule() {
    scheduleModal?.classList.remove('open');
    document.body.style.overflow = '';
  }

  openScheduleTriggers.forEach(btn => {
    btn?.addEventListener('click', openSchedule);
  });

  closeScheduleModal?.addEventListener('click', closeSchedule);

  scheduleModal?.addEventListener('click', (e) => {
    if (e.target === scheduleModal) closeSchedule();
  });

  // ==========================================================================
  // 12. VIDEO MODAL (OPEN / CLOSE)
  // ==========================================================================
  const videoModal = document.getElementById('videoModal');
  const btnOpenVideo = document.getElementById('btnOpenVideo');
  const closeVideoModal = document.getElementById('closeVideoModal');
  const videoIframe = document.getElementById('videoIframe');

  if (btnOpenVideo && videoModal) {
    btnOpenVideo.addEventListener('click', () => {
      videoModal.classList.add('open');
      document.body.style.overflow = 'hidden';
    });

    const closeVideo = () => {
      videoModal.classList.remove('open');
      document.body.style.overflow = '';
      if (videoIframe) {
        const src = videoIframe.src;
        videoIframe.src = src; // Stop video playback
      }
    };

    closeVideoModal?.addEventListener('click', closeVideo);
    videoModal.addEventListener('click', (e) => {
      if (e.target === videoModal) closeVideo();
    });
  }

  // ==========================================================================
  // 13. SCHEDULE A CALL FORM SUBMISSIONS (API POST)
  // ==========================================================================
  async function submitScheduleForm(formData, formElement, isModal = false) {
    const submitBtn = formElement.querySelector('button[type="submit"]');
    const originalText = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Submitting Request...</span>';
    }

    try {
      const res = await fetch('http://localhost:3001/api/queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const json = await res.json();

      if (json.success) {
        confetti({
          particleCount: 120,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#C4622D', '#D97B47', '#4A7C59', '#1A1A1A']
        });

        showToast('🎉 Strategy call request received! A Senior Growth Lead will reach out within 2 hours.', 'success');
        formElement.reset();
        if (isModal) closeSchedule();
      } else {
        showToast(json.error || 'Failed to submit. Please check your details.', 'error');
      }
    } catch (err) {
      console.warn('API submission fallback:', err);
      // Fallback optimistic success for offline demonstration
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
      showToast('🎉 Request submitted! Our team will contact you shortly.', 'success');
      formElement.reset();
      if (isModal) closeSchedule();
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    }
  }

  // Main Page Embedded Form
  const mainScheduleForm = document.getElementById('scheduleMainForm');
  if (mainScheduleForm) {
    mainScheduleForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = {
        fullName: document.getElementById('mFullName')?.value,
        workEmail: document.getElementById('mWorkEmail')?.value,
        company: document.getElementById('mCompany')?.value,
        phone: document.getElementById('mPhone')?.value,
        adSpend: document.getElementById('mAdSpend')?.value || 'N/A',
        preferredDate: document.getElementById('mPreferredDate')?.value,
        message: document.getElementById('mMessage')?.value,
        type: 'schedule'
      };
      submitScheduleForm(data, mainScheduleForm, false);
    });
  }

  // Modal Popup Form
  const popupScheduleForm = document.getElementById('schedulePopupForm');
  if (popupScheduleForm) {
    popupScheduleForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = {
        fullName: document.getElementById('pFullName')?.value,
        workEmail: document.getElementById('pWorkEmail')?.value,
        company: document.getElementById('pCompany')?.value,
        phone: document.getElementById('pPhone')?.value,
        adSpend: document.getElementById('pAdSpend')?.value || 'N/A',
        message: document.getElementById('pMessage')?.value,
        type: 'schedule'
      };
      submitScheduleForm(data, popupScheduleForm, true);
    });
  }

  // ==========================================================================
  // 14. COMMAND PALETTE SEARCH OVERLAY (⌘K / Ctrl+K)
  // ==========================================================================
  const searchOverlay = document.getElementById('searchOverlay');
  const openSearchBtn = document.getElementById('openSearchBtn');
  const closeSearchKbd = document.getElementById('closeSearchKbd');
  const searchInput    = document.getElementById('searchInput');
  const searchResults  = document.getElementById('searchResults');

  const siteSearchIndex = [
    { title: 'Card 01: BUILD AUTHORITY (Content & SEO)', section: 'Capabilities', href: '#services', icon: '📝' },
    { title: 'Card 02: EXPAND REACH (Paid Media & Advertising)', section: 'Capabilities', href: '#services', icon: '📢' },
    { title: 'Card 03: CREATE DEMAND (Social & Engagement)', section: 'Capabilities', href: '#services', icon: '💡' },
    { title: 'Card 04: CONVERT TRAFFIC (Web & Conversion)', section: 'Capabilities', href: '#services', icon: '⚡' },
    { title: 'Stage 01: Forensic Data & Unit Economics Audit', section: 'Methodology', href: '#process', icon: '01' },
    { title: 'Stage 02: Funnel Rebuild & Creative Lab', section: 'Methodology', href: '#process', icon: '02' },
    { title: 'Stage 03: Algorithmic Spend Scaling Sprints', section: 'Methodology', href: '#process', icon: '03' },
    { title: 'Stage 04: Omnichannel Dominance & LTV', section: 'Methodology', href: '#process', icon: '04' },
    { title: 'Nordic Lifestyle Case Study ($1.2M → $8.4M)', section: 'Case Studies', href: '#case-study', icon: '📈' },
    { title: 'Why Us vs Traditional Agencies', section: 'Operating Model', href: '#why-us', icon: '⚖️' },
    { title: 'About Fluvo.in: Growth Engineering & Philosophy', section: 'About Us', href: '#about', icon: '🎯' },
    { title: 'Our Approach: Diagnose, Engineer, Accelerate, Compound', section: 'About Us', href: '#about', icon: '🧭' },
    { title: 'Executive Diagnostic Strategy Call', section: 'Schedule', href: '#schedule', icon: '📅' },
    { title: 'Frequently Asked Questions & SLAs', section: 'Support', href: '#faq', icon: '❓' },
    { title: 'Private Owner Admin Dashboard', section: 'Executive Portal', href: '/admin.html', icon: '👑' },
  ];

  function openSearch() {
    searchOverlay?.classList.add('open');
    searchInput?.focus();
    renderSearchResults(siteSearchIndex);
  }

  function closeSearch() {
    searchOverlay?.classList.remove('open');
    if (searchInput) searchInput.value = '';
  }

  function renderSearchResults(items) {
    if (!searchResults) return;
    if (items.length === 0) {
      searchResults.innerHTML = '<div class="search-empty">No results found. Try searching "attribution", "creative", or "audit".</div>';
      return;
    }
    searchResults.innerHTML = items.map(item => `
      <a href="${item.href}" class="search-result-item">
        <div class="search-result-icon">${item.icon}</div>
        <div class="search-result-text">
          <span class="search-result-name">${item.title}</span>
          <span class="search-result-section">${item.section}</span>
        </div>
      </a>
    `).join('');

    searchResults.querySelectorAll('.search-result-item').forEach(el => {
      el.addEventListener('click', closeSearch);
    });
  }

  openSearchBtn?.addEventListener('click', openSearch);
  closeSearchKbd?.addEventListener('click', closeSearch);

  searchOverlay?.addEventListener('click', (e) => {
    if (e.target === searchOverlay) closeSearch();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      searchOverlay?.classList.contains('open') ? closeSearch() : openSearch();
    }
    if (e.key === 'Escape' && searchOverlay?.classList.contains('open')) {
      closeSearch();
    }
  });

  searchInput?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (!q) {
      renderSearchResults(siteSearchIndex);
      return;
    }
    const filtered = siteSearchIndex.filter(item =>
      item.title.toLowerCase().includes(q) || item.section.toLowerCase().includes(q)
    );
    renderSearchResults(filtered);
  });

  // ==========================================================================
  // 14.5. PILLAR & PERFORMANCE CARDS INTERACTION (SERVICES & DIGITAL CARDS)
  // ==========================================================================
  const interactiveCards = document.querySelectorAll('.service-card, .stat-card');
  interactiveCards.forEach(card => {
    const activateCard = (e) => {
      // Avoid duplicate triggers if triggered by child
      card.classList.add('card-active');
      
      const targetHref = card.dataset.href;
      setTimeout(() => {
        card.classList.remove('card-active');
        if (targetHref) {
          if (targetHref.startsWith('#')) {
            const targetEl = document.querySelector(targetHref);
            if (targetEl) {
              targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          } else {
            window.location.href = targetHref;
          }
        }
      }, 200);
    };

    card.addEventListener('click', activateCard);

    // Keyboard support (Enter / Space)
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateCard(e);
      }
    });

    // Touch feedback without sticky hover
    card.addEventListener('touchstart', () => {
      card.classList.add('card-active');
    }, { passive: true });

    card.addEventListener('touchend', () => {
      setTimeout(() => card.classList.remove('card-active'), 180);
    }, { passive: true });

    card.addEventListener('touchcancel', () => {
      card.classList.remove('card-active');
    }, { passive: true });
  });

  // ==========================================================================
  // 15. LIVE CHAT SUPPORT WIDGET (SESSION-PERSISTENT)
  // ==========================================================================
  const chatBubble = document.getElementById('chatBubble');
  const chatPanel  = document.getElementById('chatPanel');
  const closeChat  = document.getElementById('closeChatBtn');
  const chatForm   = document.getElementById('chatForm');
  const chatInput  = document.getElementById('chatInput');
  const chatBody   = document.getElementById('chatBody');
  const chatUnread = document.getElementById('chatUnread');

  const botResponses = {
    'schedule': 'You can schedule a call directly using the form on this page or via the "Schedule a Call" button in the header! Would you like me to open the booking dialog for you?',
    'roas': 'Our enterprise clients achieve an average blended ROAS of 4.8x across Meta, Google & TikTok by combining 1st-party attribution with high-velocity creative testing.',
    'sprint': 'Our 90-Day Scaling Sprint audits your unit economics in Stage 1, launches 20+ bespoke ad creatives in Stage 2, and initiates automated budget scaling in Stage 3.',
    'default': 'Thank you for reaching out! A senior growth engineer is reviewing your query and will reply in under 2 minutes. Feel free to also schedule a direct diagnostic call.'
  };

  function appendChatMsg(text, sender = 'user') {
    if (!chatBody) return;
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg ${sender}`;
    msgDiv.innerHTML = `
      <div class="chat-bubble-msg">${text}</div>
      <span class="chat-msg-time">${now}</span>
    `;
    chatBody.appendChild(msgDiv);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function handleUserMessage(text) {
    appendChatMsg(text, 'user');

    setTimeout(() => {
      const lower = text.toLowerCase();
      let reply = botResponses.default;
      if (lower.includes('schedule') || lower.includes('call') || lower.includes('book')) reply = botResponses.schedule;
      else if (lower.includes('roas') || lower.includes('return') || lower.includes('benchmark')) reply = botResponses.roas;
      else if (lower.includes('sprint') || lower.includes('process') || lower.includes('methodology')) reply = botResponses.sprint;

      appendChatMsg(reply, 'agent');
    }, 900);
  }

  chatBubble?.addEventListener('click', () => {
    chatPanel?.classList.toggle('open');
    if (chatUnread) chatUnread.style.display = 'none';
  });

  closeChat?.addEventListener('click', () => {
    chatPanel?.classList.remove('open');
  });

  chatForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput?.value.trim();
    if (!text) return;
    chatInput.value = '';
    handleUserMessage(text);
  });

  document.querySelectorAll('.chat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const msg = chip.dataset.msg;
      if (msg) handleUserMessage(msg);
    });
  });

  /* ─────────────────────────────────────────────────────────────────────────
     CASE STUDY — SVG Spline Chart Animation & Interactive Hover Tooltip
     ───────────────────────────────────────────────────────────────────────── */
  (function initCaseStudyAnimations() {
    const chartContainer = document.getElementById('caseChartContainer');
    if (!chartContainer) return;

    // 9-month progressive revenue values ($180K → $420K)
    const dataValues = [180, 195, 220, 255, 300, 330, 365, 395, 420];
    const minVal = 140;
    const maxVal = 450;

    // Map values to SVG coordinate system (viewBox 0 0 500 200)
    const yTop = 20;
    const yBottom = 180;
    function valueToY(v) {
      return yBottom - ((v - minVal) / (maxVal - minVal)) * (yBottom - yTop);
    }
    const targetYs = dataValues.map(valueToY);
    const xStep = 500 / (dataValues.length - 1);
    const xs = dataValues.map((_, i) => i * xStep);

    // Generate smooth cubic bezier spline path
    function getSmoothSplinePath(points) {
      if (points.length < 2) return '';
      let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = i > 0 ? points[i - 1] : points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = i < points.length - 2 ? points[i + 2] : p2;

        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
      }
      return d;
    }

    function getSmoothSplineArea(points) {
      const linePath = getSmoothSplinePath(points);
      const lastX = points[points.length - 1].x.toFixed(1);
      const firstX = points[0].x.toFixed(1);
      return `${linePath} L ${lastX} 200 L ${firstX} 200 Z`;
    }

    const chartLine = chartContainer.querySelector('.chart-line');
    const chartArea = chartContainer.querySelector('.chart-area');
    const dots = chartContainer.querySelectorAll('.chart-dots circle');
    const chartCrosshair = document.getElementById('chartCrosshair');
    const chartActiveDot = document.getElementById('chartActiveDot');
    const chartTooltip = document.getElementById('chartTooltip');
    const ttMonth = document.getElementById('ttMonth');
    const ttGrowth = document.getElementById('ttGrowth');
    const ttVal = document.getElementById('ttVal');

    let chartAnimated = false;

    // Bottom-to-Top Progressive Rising Animation
    function animateChart() {
      if (chartAnimated) return;
      chartAnimated = true;

      const flatYs = xs.map(() => yBottom);
      const duration = 1400;
      const startTime = performance.now();

      function easeOutBack(t) {
        const c1 = 0.5;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
      }

      function tick(now) {
        const elapsed = now - startTime;
        const rawProgress = Math.min(elapsed / duration, 1);
        const progress = easeOutBack(rawProgress);

        const currentPoints = xs.map((x, i) => {
          const clampedProg = Math.max(0, Math.min(1.05, progress));
          const y = flatYs[i] + (targetYs[i] - flatYs[i]) * clampedProg;
          return { x, y };
        });

        if (chartLine) chartLine.setAttribute('d', getSmoothSplinePath(currentPoints));
        if (chartArea) chartArea.setAttribute('d', getSmoothSplineArea(currentPoints));

        // Update dot positions with progressive staggered fade
        dots.forEach((dot, i) => {
          dot.setAttribute('cx', currentPoints[i].x);
          dot.setAttribute('cy', currentPoints[i].y);
          if (rawProgress >= 0.3 + (i / dataValues.length) * 0.6) {
            dot.style.opacity = '1';
          }
        });

        if (rawProgress < 1) {
          requestAnimationFrame(tick);
        } else {
          dots.forEach(dot => { dot.style.opacity = '1'; });
          setupInteractiveHover();
        }
      }
      requestAnimationFrame(tick);
    }

    // Interactive Hover Tracking & Floating Tooltip
    function setupInteractiveHover() {
      function handleMove(clientX) {
        const rect = chartContainer.getBoundingClientRect();
        const mouseX = clientX - rect.left;
        const clampedX = Math.max(0, Math.min(rect.width, mouseX));
        const svgX = (clampedX / rect.width) * 500;

        // Find closest month point (0 to 8)
        let closestIdx = 0;
        let minDiff = Infinity;
        xs.forEach((x, i) => {
          const diff = Math.abs(x - svgX);
          if (diff < minDiff) {
            minDiff = diff;
            closestIdx = i;
          }
        });

        const activeX = xs[closestIdx];
        const activeY = targetYs[closestIdx];
        const activeVal = dataValues[closestIdx];
        const baseline = dataValues[0];
        const growthPct = Math.round(((activeVal - baseline) / baseline) * 100);

        // Position vertical crosshair
        if (chartCrosshair) {
          chartCrosshair.setAttribute('x1', activeX);
          chartCrosshair.setAttribute('x2', activeX);
          chartCrosshair.setAttribute('y1', 20);
          chartCrosshair.setAttribute('y2', 180);
          chartCrosshair.style.opacity = '1';
        }

        // Position glowing active dot
        if (chartActiveDot) {
          chartActiveDot.setAttribute('cx', activeX);
          chartActiveDot.setAttribute('cy', activeY);
          chartActiveDot.style.opacity = '1';
        }

        // Highlight matching SVG data point
        dots.forEach((d, i) => {
          d.setAttribute('r', i === closestIdx ? '6.5' : '4.5');
        });

        // Update Tooltip Content
        if (ttMonth) ttMonth.textContent = `Month ${closestIdx + 1}`;
        if (ttGrowth) ttGrowth.textContent = growthPct > 0 ? `+${growthPct}% Growth` : 'Baseline ($180K)';
        if (ttVal) ttVal.innerHTML = `$${activeVal},000<span class="chart-tooltip-period">/mo</span>`;

        // Position tooltip accurately above active point
        if (chartTooltip) {
          const pixelX = (activeX / 500) * rect.width;
          const pixelY = (activeY / 200) * rect.height;
          chartTooltip.style.left = `${pixelX}px`;
          chartTooltip.style.top = `${pixelY}px`;
          chartTooltip.classList.add('visible');
        }
      }

      chartContainer.addEventListener('mousemove', (e) => {
        handleMove(e.clientX);
      });

      chartContainer.addEventListener('mouseleave', () => {
        if (chartCrosshair) chartCrosshair.style.opacity = '0';
        if (chartActiveDot) chartActiveDot.style.opacity = '0';
        if (chartTooltip) chartTooltip.classList.remove('visible');
        dots.forEach(d => d.setAttribute('r', '4.5'));
      });

      chartContainer.addEventListener('touchmove', (e) => {
        if (e.touches && e.touches[0]) {
          handleMove(e.touches[0].clientX);
        }
      }, { passive: true });

      chartContainer.addEventListener('touchend', () => {
        setTimeout(() => {
          if (chartCrosshair) chartCrosshair.style.opacity = '0';
          if (chartActiveDot) chartActiveDot.style.opacity = '0';
          if (chartTooltip) chartTooltip.classList.remove('visible');
        }, 1500);
      });
    }

    // Metric Number Counters
    const metricEls = document.querySelectorAll('[data-animate-metric]');
    let metricsAnimated = false;

    function animateMetrics() {
      if (metricsAnimated) return;
      metricsAnimated = true;

      metricEls.forEach(metric => {
        const afterEl = metric.querySelector('.case-metric-after');
        if (!afterEl) return;

        const from = parseFloat(afterEl.dataset.countFrom) || 0;
        const to = parseFloat(afterEl.dataset.countTo) || 0;
        const prefix = afterEl.dataset.countPrefix || '';
        const suffix = afterEl.dataset.countSuffix || '';
        const decimals = parseInt(afterEl.dataset.countDecimals) || 0;
        const duration = 1400;
        const startTime = performance.now();

        function tick(now) {
          const elapsed = now - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          const current = from + (to - from) * eased;
          afterEl.textContent = prefix + current.toFixed(decimals) + suffix;
          if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    }

    // IntersectionObserver to trigger on scroll into viewport
    const caseSection = document.getElementById('case-study');
    if (caseSection) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            animateChart();
            animateMetrics();
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.25 });
      observer.observe(caseSection);
    }
  })();

});
