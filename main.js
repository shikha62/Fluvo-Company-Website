import Chart from 'chart.js/auto';
import confetti from 'canvas-confetti';
import { submitInquiry } from './src/supabase.js';

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
  const mobileMenu = document.getElementById('mobileMenu');

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
  const slides = document.querySelectorAll('.hero-slide');
  const bgSlides = document.querySelectorAll('.hero-bg-slide');
  const dots = document.querySelectorAll('.hero-dot');
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
  const timelineWrapper = document.getElementById('timelineWrapper');
  const timelineTrackFill = document.getElementById('timelineTrackFill');
  const timelineSteps = document.querySelectorAll('.timeline-step');

  if (timelineWrapper && timelineTrackFill && timelineSteps.length) {

    // How long the orange line takes to travel between nodes (ms)
    const LINE_TRAVEL_MS = 600;   // line draw per segment
    const CONTENT_DELAY_MS = 120;   // pause after line arrives before content fades in
    const STEP_GAP_MS = 900;   // total gap before next step starts (≥ LINE_TRAVEL_MS + CONTENT_DELAY_MS)

    let animationStarted = false;

    function runTimeline() {
      if (animationStarted) return;
      animationStarted = true;

      timelineSteps.forEach((step, idx) => {
        const delay = idx * STEP_GAP_MS;

        // 1) Grow the orange line to reach this step's node
        setTimeout(() => {
          // Target height = top-offset of step's .step-node circle relative to trackFill parent
          const stepNode = step.querySelector('.step-node');
          const wrapperRect = timelineWrapper.getBoundingClientRect();
          const nodeRect = stepNode.getBoundingClientRect();
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
  const tPrev = document.getElementById('tPrev');
  const tNext = document.getElementById('tNext');

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

    let saved = false;

    // 1. Try Direct Supabase Database Insert
    try {
      await submitInquiry(formData);
      saved = true;
    } catch (dbErr) {
      console.warn('Direct Supabase insert notice:', dbErr);
    }

    // 2. Also notify local Express server if running
    try {
      const res = await fetch('/api/queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const json = await res.json();
      if (json.success) saved = true;
    } catch (apiErr) {
      // Local server might not be active, which is fine since Supabase handles it
    }

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }

    // Celebration & Notification
    confetti({
      particleCount: 120,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#C4622D', '#D97B47', '#4A7C59', '#1A1A1A']
    });

    showToast('🎉 Strategy call request received! A Senior Growth Lead will reach out within 2 hours.', 'success');
    formElement.reset();
    if (isModal) closeSchedule();
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
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');

  const siteSearchIndex = [
    { title: 'Card 01: BUILD AUTHORITY (Technical SEO, Core Web Vitals & GEO)', section: 'Capabilities', href: '#services', icon: '📝' },
    { title: 'Card 02: EXPAND REACH (Performance Marketing & Meta CAPI)', section: 'Capabilities', href: '#services', icon: '📢' },
    { title: 'Card 03: CREATE DEMAND (Marketing Automation & Lifecycle CRM)', section: 'Capabilities', href: '#services', icon: '💡' },
    { title: 'Card 04: CONVERT TRAFFIC (High-Performance Web & CRO)', section: 'Capabilities', href: '#services', icon: '⚡' },
    { title: 'Stage 01: Technical SEO Audit & 1st-Party Attribution', section: 'Methodology', href: '#process', icon: '01' },
    { title: 'Stage 02: Performance Media Launch & CRM Automation', section: 'Methodology', href: '#process', icon: '02' },
    { title: 'Stage 03: Conversion Rate Optimization (CRO) & A/B Testing', section: 'Methodology', href: '#process', icon: '03' },
    { title: 'Stage 04: Channel Scaling & Generative Engine Optimization (GEO)', section: 'Methodology', href: '#process', icon: '04' },
    { title: 'Case Study: Scalable Digital Growth Engine (+133% Revenue)', section: 'Case Studies', href: '#case-study', icon: '📈' },
    { title: 'Why Us: Unified Growth Architecture vs Legacy Agencies', section: 'Operating Model', href: '#why-us', icon: '⚖️' },
    { title: 'About Fluvo.in: Growth Systems, Strategy & Performance', section: 'About Us', href: '#about', icon: '🎯' },
    { title: 'Our Approach: Diagnose, Engineer, Accelerate, Compound', section: 'About Us', href: '#about', icon: '🧭' },
    { title: 'Technical Growth Diagnostic Strategy Call', section: 'Schedule', href: '#schedule', icon: '📅' },
    { title: 'Frequently Asked Questions (Technical SEO, CAPI, GEO)', section: 'Support', href: '#faq', icon: '❓' },
    { title: 'Private Executive & Owner Dashboard Portal', section: 'Executive Portal', href: '/owner', icon: '👑' },
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
  const chatPanel = document.getElementById('chatPanel');
  const closeChat = document.getElementById('closeChatBtn');
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const chatBody = document.getElementById('chatBody');
  const chatUnread = document.getElementById('chatUnread');

  const botResponses = {
    'schedule': 'You can schedule a strategic growth diagnostic directly using the form on this page or via the "Schedule a Call" button in the header! Would you like me to open the booking dialog for you?',
    'roas': 'Our enterprise clients achieve an average blended ROAS of 4.8x across Meta CAPI, Google Ads, and LinkedIn by combining 1st-party attribution with high-velocity creative testing and CRO.',
    'sprint': 'Our 90-Day Scaling Sprint audits your unit economics & technical SEO in Stage 1, launches paid media & landing pages in Stage 2, executes CRO testing in Stage 3, and initiates automated budget scaling in Stage 4.',
    'geo': 'Generative Engine Optimization (GEO) ensures your brand is indexed and cited by modern AI search models (ChatGPT, Perplexity, Google AI Overviews) through structured schema entity graphs and semantic authority mapping.',
    'seo': 'Our SEO architecture combines technical crawlability audits, sub-second Core Web Vitals optimization, on-page schema graphing, and search intent alignment.',
    'attribution': 'We implement first-party server-side tracking (Meta CAPI via Cloudflare/AWS, Google Tag Manager Server, GA4 event models) to eliminate signal loss and measure true customer acquisition cost.',
    'default': 'Thank you for reaching out! A senior growth engineer is reviewing your query. Feel free to also schedule a direct technical diagnostic call.'
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
      else if (lower.includes('geo') || lower.includes('generative') || lower.includes('ai search') || lower.includes('chatgpt')) reply = botResponses.geo;
      else if (lower.includes('seo') || lower.includes('ranking') || lower.includes('vitals')) reply = botResponses.seo;
      else if (lower.includes('attribution') || lower.includes('capi') || lower.includes('tracking') || lower.includes('ga4')) reply = botResponses.attribution;

      appendChatMsg(reply, 'agent');
    }, 800);
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


  // ==========================================================================
  // 17. FULL-SCREEN CAPABILITY EXPERIENCE MODAL CONTROLLER
  // ==========================================================================
  const capabilityData = {
    1: {
      id: 1,
      badge: '01',
      category: 'TECHNICAL SEO & SEARCH VISIBILITY',
      title: 'BUILD AUTHORITY',
      tagline: 'Engineered for durable search dominance & Generative Engine Optimization (GEO)',
      overview: 'Transform search visibility into an enterprise moat. We deploy forensic crawlability audits, sub-second Core Web Vitals engineering, nested JSON-LD schema graphs, and intent clustering to capture high-intent commercial demand across Google and AI answer engines.',
      highlights: [
        '📈 +285% Organic Visibility Lift',
        '⚡ 99/100 Mobile PageSpeed Vitals',
        '🤖 Generative Engine Optimization (GEO)',
        '🔍 Zero-Latency Indexation Engine'
      ],
      deliverables: [
        {
          icon: '🔍',
          title: 'Forensic Crawlability & Server Log Audits',
          desc: 'Eliminate crawl budget waste, redirect chains, indexation bloat, and orphaned URLs. We optimize server response times and robots directives for optimal crawler efficiency.'
        },
        {
          icon: '⚡',
          title: 'Core Web Vitals & Frontend Hydration',
          desc: 'Sub-600ms First Contentful Paint (FCP) and zero Cumulative Layout Shift (CLS). We optimize critical rendering paths, image compression, and CSS delivery for mobile devices.'
        },
        {
          icon: '🏷️',
          title: 'Semantic Schema & Entity Graph Markup',
          desc: 'Deploy comprehensive JSON-LD nested schemas for Organization, Product, Article, FAQ, and Review data — establishing verified authority in Google Knowledge Graph.'
        },
        {
          icon: '🤖',
          title: 'Generative Engine Optimization (GEO)',
          desc: 'Structure long-form technical content and structured answers specifically engineered to be cited and surfaced by Perplexity, ChatGPT Search, and Google AI Overviews.'
        }
      ],
      tools: [
        'Ahrefs Enterprise',
        'Screaming Frog SEO Spider',
        'Google Search Console API',
        'Schema Pro Engine',
        'Cloudflare Workers',
        'PageSpeed Telemetry',
        'Semrush Guru'
      ],
      benchmarks: [
        { val: '+285%', label: 'Organic Search Traffic', sub: 'Average 6-month growth' },
        { val: '99/100', label: 'Core Web Vitals Score', sub: 'Mobile & Desktop audit' },
        { val: '+164%', label: 'Top-3 Keyword Rankings', sub: 'High commercial intent terms' },
        { val: '-45%', label: 'Time to First Byte (TTFB)', sub: 'Global edge distribution' }
      ],
      roadmap: [
        {
          badge: 'STAGE 01 · DAYS 1–30',
          title: 'Forensic Audit & Architecture Cleanup',
          desc: 'Complete crawl diagnostic, server error remediation, indexation pruning, and Core Web Vitals profiling.'
        },
        {
          badge: 'STAGE 02 · DAYS 31–60',
          title: 'Schema Graph & Intent Clustering',
          desc: 'Deploy nested JSON-LD schema across all pages, map commercial keyword intent clusters, and speed up critical rendering paths.'
        },
        {
          badge: 'STAGE 03 · DAYS 61–90',
          title: 'AI Search (GEO) & Authority Scaling',
          desc: 'Implement Generative Engine Optimization, scale high-authority digital PR backlinks, and establish compounding search ranking momentum.'
        }
      ]
    },

    2: {
      id: 2,
      badge: '02',
      category: 'PERFORMANCE MARKETING & PAID MEDIA',
      title: 'EXPAND REACH',
      tagline: 'Algorithmic Paid Search, Meta CAPI & Programmatic B2B Media',
      overview: 'Precision-targeted paid search and social campaigns engineered for unit-economic profitability. We combine server-side Conversions API (CAPI), high-velocity creative testing, and value-based algorithmic bidding to scale media investment with positive blended ROAS.',
      highlights: [
        '🎯 4.85x Blended ROAS Achieved',
        '📡 Server-Side Meta CAPI Tracking',
        '💼 High-Intent B2B ABM Media',
        '⚡ -36% Cost Per Acquisition (CPA)'
      ],
      deliverables: [
        {
          icon: '🎯',
          title: 'Full-Funnel Paid Search & Performance Max',
          desc: 'Intent-driven Google Ads architecture with negative keyword filters, asset group customization, and value-based smart bidding calibrated to gross profit margin.'
        },
        {
          icon: '📡',
          title: 'Server-Side Meta CAPI & First-Party Attribution',
          desc: 'Direct server-to-server Conversions API integration bypassing browser ad blockers and iOS signal loss, ensuring 100% accurate conversion telemetry.'
        },
        {
          icon: '💼',
          title: 'High-Intent LinkedIn B2B & ABM Targeting',
          desc: 'Target enterprise decision-makers by exact job title, company size, tech stack, and buying intent signals with matched audience retargeting.'
        },
        {
          icon: '🚀',
          title: 'High-Velocity Creative Testing Pipeline',
          desc: 'Deploy 20+ fresh creative hooks, UGC video variations, and visual formats bi-weekly to prevent ad fatigue and identify breakout winners.'
        }
      ],
      tools: [
        'Google Ads Smart AI',
        'Meta Ads Manager & CAPI',
        'LinkedIn Campaign Manager',
        'Triple Whale Attribution',
        'Supermetrics Data Studio',
        'TikTok Ads Manager',
        'PostHog Analytics'
      ],
      benchmarks: [
        { val: '4.85x', label: 'Average Blended ROAS', sub: 'Calculated on net revenue' },
        { val: '-36%', label: 'CPA Reduction', sub: 'Through server-side CAPI' },
        { val: '+320%', label: 'Qualified Pipeline Growth', sub: 'High-intent commercial leads' },
        { val: '$2.4M+', label: 'Ad Spend Managed', sub: 'Across B2B & D2C brands' }
      ],
      roadmap: [
        {
          badge: 'STAGE 01 · DAYS 1–30',
          title: 'CAPI Tracking & Account Restructuring',
          desc: 'Server-side CAPI integration, offline conversion uploads, audience cohort mapping, and baseline creative hook launches.'
        },
        {
          badge: 'STAGE 02 · DAYS 31–60',
          title: 'Smart Bidding & Creative Testing',
          desc: 'Deploy value-based bidding, scale winning creative angles across Google & Meta, and launch LinkedIn ABM campaigns.'
        },
        {
          badge: 'STAGE 03 · DAYS 61–90',
          title: 'Budget Scaling & Retargeting Loops',
          desc: 'Scale daily budget on top-performing campaigns, activate multi-touch retargeting loops, and lock in compounding ROAS.'
        }
      ]
    },

    3: {
      id: 3,
      badge: '03',
      category: 'MARKETING AUTOMATION & LIFECYCLE CRM',
      title: 'CREATE DEMAND',
      tagline: 'CRM Orchestration, Lead Routing & Automated Lifecycle Buyer Journeys',
      overview: 'Bridge marketing acquisition and sales execution with automated CRM revenue operations. We engineer multi-touch lead scoring, automated nurture sequences, zero-latency webhook pipelines, and dynamic audience synchronization across the buyer lifecycle.',
      highlights: [
        '⚡ +140% Lead Velocity Increase',
        '🔄 Multi-Branch Automated Nurture',
        '📧 42% Average Email Open Rate',
        '⏱️ <12 Min Speed-to-Lead SLA'
      ],
      deliverables: [
        {
          icon: '🔄',
          title: 'Dynamic Lead Scoring & Instant SLA Routing',
          desc: 'Instantly evaluate inbound inquiries using firmographic data, budget size, and behavioral engagement before notifying sales reps in real time.'
        },
        {
          icon: '📧',
          title: 'Multi-Branch Nurture & Lifecycle Email Flows',
          desc: 'Behavioral email sequences triggered by form submissions, content downloads, and pricing calculator interactions that guide prospects to booking.'
        },
        {
          icon: '⚡',
          title: 'API Webhooks & Real-Time Data Synchronization',
          desc: 'Connect CRM, website forms, billing systems, and messaging tools with custom API endpoints and zero-latency webhook automation.'
        },
        {
          icon: '👥',
          title: 'Audience Cohort Retargeting Sync',
          desc: 'Sync CRM deal stages directly to Meta and Google Ads for automatic audience exclusion and high-value customer expansion campaigns.'
        }
      ],
      tools: [
        'HubSpot Enterprise CRM',
        'Make.com / Integromat',
        'ActiveCampaign Enterprise',
        'Segment Customer Data Platform',
        'PostgreSQL Webhooks',
        'Zapier Developer',
        'Slack Workflow Builder'
      ],
      benchmarks: [
        { val: '+140%', label: 'Lead Velocity Growth', sub: 'Faster stage progression' },
        { val: '42%', label: 'Average Email Open Rate', sub: 'Across automated flows' },
        { val: '3.2x', label: 'MQL-to-SQL Conversion', sub: 'Through automated qualification' },
        { val: '<12m', label: 'Speed-to-Lead Time', sub: 'Instant webhook notification' }
      ],
      roadmap: [
        {
          badge: 'STAGE 01 · DAYS 1–30',
          title: 'CRM Audit & Lead Scoring Architecture',
          desc: 'Clean CRM contact database, establish custom property taxonomy, and build automated lead scoring criteria.'
        },
        {
          badge: 'STAGE 02 · DAYS 31–60',
          title: 'Lifecycle Journeys & Webhook Integration',
          desc: 'Deploy welcome, nurture, re-engagement, and demo-booking workflows with instant webhook alerting.'
        },
        {
          badge: 'STAGE 03 · DAYS 61–90',
          title: 'Revenue Operations & Audience Sync',
          desc: 'Sync lifecycle stages with ad platforms for suppression, optimize sales SLA handoff, and monitor closed-loop revenue.'
        }
      ]
    },

    4: {
      id: 4,
      badge: '04',
      category: 'HIGH-PERFORMANCE WEB & CRO',
      title: 'CONVERT TRAFFIC',
      tagline: 'Edge Jamstack Web Architecture, Sub-Second Speeds & Funnel Optimization',
      overview: 'Turn qualified traffic into pipeline with frictionless high-converting web engineering. We build lightning-fast web experiences with sub-second page loads, micro-interactions, continuous A/B funnel experimentation, and GA4 user telemetry.',
      highlights: [
        '⚡ <650ms First Contentful Paint',
        '🧪 Continuous A/B Funnel Testing',
        '📈 +82% Form Completion Rate',
        '📊 100% Verified GA4 Telemetry'
      ],
      deliverables: [
        {
          icon: '⚡',
          title: 'Sub-Second Edge & Jamstack Web Architecture',
          desc: 'Built with modern Vite / Next.js architecture hosted on Cloudflare Edge with global CDN caching for instant, layout-shift-free rendering.'
        },
        {
          icon: '🧪',
          title: 'Multi-Variant Landing Page (A/B) Experimentation',
          desc: 'Systematically test hero headlines, CTA placements, form lengths, and social proof elements to maximize visitor-to-lead conversion.'
        },
        {
          icon: '📋',
          title: 'Frictionless Multi-Step Form Design',
          desc: 'Interactive step-by-step forms with live field validation, phone formatting, and auto-complete to eliminate submission drop-off.'
        },
        {
          icon: '📊',
          title: 'GA4 Telemetry, Heatmaps & User Session Recording',
          desc: 'Deep funnel visibility into drop-off points, click heatmaps, scroll depth, and micro-conversions for data-backed UX refinements.'
        }
      ],
      tools: [
        'Vite & Next.js Framework',
        'Cloudflare Edge & CDN',
        'Tailwind CSS Design System',
        'Google Analytics 4 (GA4)',
        'Hotjar Heatmaps',
        'VWO A/B Testing',
        'PurifyCSS Optimization'
      ],
      benchmarks: [
        { val: '+82%', label: 'Form Completion Lift', sub: 'Frictionless multi-step UX' },
        { val: '<650ms', label: 'First Contentful Paint', sub: 'Global Cloudflare CDN' },
        { val: '3.9%', label: 'Average Conversion Rate', sub: 'Visitor-to-qualified-lead' },
        { val: '100%', label: 'Mobile Responsiveness', sub: 'Verified cross-browser' }
      ],
      roadmap: [
        {
          badge: 'STAGE 01 · DAYS 1–30',
          title: 'UX Audit & Performance Benchmarking',
          desc: 'Analyze heatmaps, identify form drop-off points, optimize asset bundle size, and set up GA4 event tracking.'
        },
        {
          badge: 'STAGE 02 · DAYS 31–60',
          title: 'High-Speed Landing Page Engineering',
          desc: 'Deploy sub-second landing page variations, test friction-free form steps, and launch multi-variant headline tests.'
        },
        {
          badge: 'STAGE 03 · DAYS 61–90',
          title: 'Compounding CRO & Funnel Personalization',
          desc: 'Implement dynamic URL keyword matching, refine CTA micro-copy, and scale winning funnel experiments across all traffic.'
        }
      ]
    }
  };

  let currentCapabilityId = 1;

  const pillarModal = document.getElementById('pillarModal');
  const closePillarModal = document.getElementById('closePillarModal');
  const pmPrevBtn = document.getElementById('pmPrevBtn');
  const pmNextBtn = document.getElementById('pmNextBtn');
  const pmTabsPills = document.getElementById('pmTabsPills');
  const pmScrollBody = document.getElementById('pmScrollBody');

  const pmBadge = document.getElementById('pmBadge');
  const pmCategory = document.getElementById('pmCategory');
  const pmTitle = document.getElementById('pmTitle');
  const pmTagline = document.getElementById('pmTagline');
  const pmOverview = document.getElementById('pmOverview');
  const pmHighlights = document.getElementById('pmHighlights');
  const pmDeliverables = document.getElementById('pmDeliverables');
  const pmToolStack = document.getElementById('pmToolStack');
  const pmBenchmarks = document.getElementById('pmBenchmarks');
  const pmRoadmap = document.getElementById('pmRoadmap');
  const pmFooterPillarName = document.getElementById('pmFooterPillarName');
  const pmBtnSchedule = document.getElementById('pmBtnSchedule');
  const pmBtnCaseStudy = document.getElementById('pmBtnCaseStudy');

  function renderCapability(id) {
    const data = capabilityData[id];
    if (!data) return;
    currentCapabilityId = id;

    // Top Bar & Hero
    if (pmBadge) pmBadge.innerText = data.badge;
    if (pmCategory) pmCategory.innerText = data.category;
    if (pmTitle) pmTitle.innerText = data.title;
    if (pmTagline) pmTagline.innerText = data.tagline;
    if (pmOverview) pmOverview.innerText = data.overview;
    if (pmFooterPillarName) pmFooterPillarName.innerText = `${data.badge}: ${data.title}`;

    // Highlights
    if (pmHighlights) {
      pmHighlights.innerHTML = data.highlights.map(h => `
        <div class="pm-highlight-chip">${h}</div>
      `).join('');
    }

    // Deliverables List
    if (pmDeliverables) {
      pmDeliverables.innerHTML = data.deliverables.map(d => `
        <div class="pm-deliverable-item">
          <div class="pm-deliv-title">
            <span>${d.icon}</span>
            <span>${d.title}</span>
          </div>
          <p class="pm-deliv-desc">${d.desc}</p>
        </div>
      `).join('');
    }

    // Tool Stack Chips
    if (pmToolStack) {
      pmToolStack.innerHTML = data.tools.map(t => `
        <div class="pm-tool-chip">
          <span style="color: var(--amber);">✦</span>
          <span>${t}</span>
        </div>
      `).join('');
    }

    // Benchmarks Grid
    if (pmBenchmarks) {
      pmBenchmarks.innerHTML = data.benchmarks.map(b => `
        <div class="pm-benchmark-box">
          <div class="pm-bench-val">${b.val}</div>
          <div class="pm-bench-label">${b.label}</div>
          <div class="pm-bench-sub">${b.sub}</div>
        </div>
      `).join('');
    }

    // Sprint Implementation Roadmap
    if (pmRoadmap) {
      pmRoadmap.innerHTML = data.roadmap.map(r => `
        <div class="pm-sprint-step">
          <span class="pm-sprint-badge">${r.badge}</span>
          <h4 class="pm-sprint-title">${r.title}</h4>
          <p class="pm-sprint-desc">${r.desc}</p>
        </div>
      `).join('');
    }

    // Update Tab Dots Active State
    if (pmTabsPills) {
      pmTabsPills.querySelectorAll('.pillar-dot-btn').forEach(btn => {
        const switchId = parseInt(btn.dataset.pillarSwitch || '1', 10);
        btn.classList.toggle('active', switchId === id);
      });
    }

    // Scroll to top of content
    if (pmScrollBody) pmScrollBody.scrollTop = 0;
  }

  function openCapability(id) {
    renderCapability(id);
    pillarModal?.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeCapability() {
    pillarModal?.classList.remove('open');
    document.body.style.overflow = '';
  }

  // Attach click events to Capability Cards (.stat-card)
  document.querySelectorAll('.stat-card[data-pillar-id]').forEach(card => {
    card.addEventListener('click', () => {
      const pid = parseInt(card.getAttribute('data-pillar-id') || '1', 10);
      openCapability(pid);
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const pid = parseInt(card.getAttribute('data-pillar-id') || '1', 10);
        openCapability(pid);
      }
    });
  });

  // Attach click events to Service Cards (.service-card)
  document.querySelectorAll('.service-card').forEach((card, idx) => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      const pid = (idx % 4) + 1;
      openCapability(pid);
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const pid = (idx % 4) + 1;
        openCapability(pid);
      }
    });
  });

  // Modal Controls
  closePillarModal?.addEventListener('click', closeCapability);

  pillarModal?.addEventListener('click', (e) => {
    if (e.target === pillarModal) closeCapability();
  });

  pmPrevBtn?.addEventListener('click', () => {
    const prevId = currentCapabilityId === 1 ? 4 : currentCapabilityId - 1;
    renderCapability(prevId);
  });

  pmNextBtn?.addEventListener('click', () => {
    const nextId = currentCapabilityId === 4 ? 1 : currentCapabilityId + 1;
    renderCapability(nextId);
  });

  if (pmTabsPills) {
    pmTabsPills.querySelectorAll('.pillar-dot-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = parseInt(btn.dataset.pillarSwitch || '1', 10);
        renderCapability(pid);
      });
    });
  }

  // Keyboard navigation for full-screen modal
  document.addEventListener('keydown', (e) => {
    if (!pillarModal?.classList.contains('open')) return;

    if (e.key === 'Escape') {
      closeCapability();
    } else if (e.key === 'ArrowLeft') {
      const prevId = currentCapabilityId === 1 ? 4 : currentCapabilityId - 1;
      renderCapability(prevId);
    } else if (e.key === 'ArrowRight') {
      const nextId = currentCapabilityId === 4 ? 1 : currentCapabilityId + 1;
      renderCapability(nextId);
    }
  });

  // Footer Actions inside Modal
  pmBtnSchedule?.addEventListener('click', () => {
    const currentCap = capabilityData[currentCapabilityId];
    closeCapability();
    openSchedule();

    // Prefill schedule modal message
    const pMessage = document.getElementById('pMessage');
    if (pMessage && currentCap) {
      pMessage.value = `Interested in Capability ${currentCap.badge}: ${currentCap.title} (${currentCap.category}).`;
    }
  });

  pmBtnCaseStudy?.addEventListener('click', () => {
    closeCapability();
  });

});

// ==========================================================================
// 18. FULL-SCREEN SERVICE EXPERTISE MODAL CONTROLLER
// ==========================================================================
(function () {
  const serviceData = {
    1: {
      id: 1,
      badge: '01',
      category: 'SEARCH INTENT & AUDIENCE SEGMENTATION',
      title: 'AUDIENCE INTELLIGENCE',
      tagline: 'Deep first-party data analysis to map buyer journeys before deploying any spend',
      overview: 'We analyze your first-party customer data, behavioral signals, and search intent patterns to build high-fidelity audience cohorts. Every campaign begins with a forensic understanding of who your buyers are, what drives them, and which acquisition channels deliver the highest lifetime value — eliminating wasted spend before it starts.',
      highlights: [
        '🔍 First-Party Data Cohort Mapping',
        '📊 Intent-Cluster Keyword Research',
        '🎯 ICP Definition & Firmographic Profiling',
        '💡 Unit-Economic Viability Assessment'
      ],
      deliverables: [
        {
          icon: '🔍',
          title: 'First-Party Customer Data Audit',
          desc: 'Forensic analysis of CRM records, web analytics, and transactional data to identify highest-LTV customer segments and purchase-trigger patterns.'
        },
        {
          icon: '📊',
          title: 'Search Intent Cluster Mapping',
          desc: 'Group commercial, informational, and navigational queries into intent clusters to identify the exact moments when target buyers enter the market.'
        },
        {
          icon: '🎯',
          title: 'ICP & Buyer Persona Profiling',
          desc: 'Build data-driven Ideal Customer Profiles using firmographic enrichment, behavioral attributes, and channel-level CAC-to-LTV ratio analysis.'
        },
        {
          icon: '💡',
          title: 'Unit-Economic Viability Assessment',
          desc: 'Stress-test media investment assumptions by modeling target CAC, LTV payback window, and blended ROAS thresholds before budget is committed.'
        }
      ],
      tools: [
        'Google Analytics 4',
        'Segment CDP',
        'Clearbit Enrichment',
        'Ahrefs Keywords Explorer',
        'Semrush Traffic Analytics',
        'HubSpot CRM',
        'Looker Studio'
      ],
      benchmarks: [
        { val: '+48%', label: 'ICP Match Rate Lift', sub: 'CRM enrichment & scoring' },
        { val: '-31%', label: 'CAC Reduction', sub: 'Through audience pre-qualification' },
        { val: '3.2x', label: 'LTV/CAC Ratio Achieved', sub: 'Average across engagements' },
        { val: '94%', label: 'Audience Accuracy Score', sub: 'Intent cluster validation' }
      ],
      roadmap: [
        {
          badge: 'STAGE 01 · DAYS 1–21',
          title: 'Data Audit & CRM Enrichment',
          desc: 'Pull all CRM and analytics data, identify top 20% customer segments by LTV, and run firmographic enrichment on existing contacts.'
        },
        {
          badge: 'STAGE 02 · DAYS 22–45',
          title: 'Intent Mapping & Persona Build',
          desc: 'Conduct search intent cluster research, build validated buyer personas, and identify primary acquisition channels by segment efficiency.'
        },
        {
          badge: 'STAGE 03 · DAYS 46–90',
          title: 'Targeting Framework & Activation Brief',
          desc: 'Deliver a full audience targeting playbook, channel strategy, and unit-economic model to brief paid media and SEO execution teams.'
        }
      ]
    },

    2: {
      id: 2,
      badge: '02',
      category: 'MULTI-TOUCH PAID & ORGANIC INBOUND',
      title: 'DEMAND ARCHITECTURE',
      tagline: 'Unified paid + organic demand engine engineered for compounding pipeline growth',
      overview: 'Demand Architecture is the strategic unification of brand positioning, technical SEO, Generative Engine Optimization (GEO), and programmatic performance media. We build a demand engine that captures high-intent buyers across every touchpoint — from first Google search to retargeting sequence — engineered for maximum pipeline efficiency.',
      highlights: [
        '⚡ Unified Paid + Organic Demand Engine',
        '🤖 Generative Engine Optimization (GEO)',
        '📡 Cross-Channel Attribution Architecture',
        '🎯 High-Intent Commercial Keyword Domination'
      ],
      deliverables: [
        {
          icon: '⚡',
          title: 'Integrated Paid + Organic Strategy',
          desc: 'Align Google Ads, Meta performance media, and SEO content in a coordinated calendar that captures demand across all funnel stages simultaneously.'
        },
        {
          icon: '🤖',
          title: 'Generative Engine Optimization (GEO)',
          desc: 'Engineer long-form expert content and structured answer pages designed to be cited and surfaced by Perplexity, ChatGPT Search, and Google AI Overviews.'
        },
        {
          icon: '📡',
          title: 'Multi-Touch Attribution Architecture',
          desc: 'Deploy server-side GA4 + Google Tag Manager with cross-channel data-driven attribution models that expose the true ROAS contribution of every channel.'
        },
        {
          icon: '🎯',
          title: 'Commercial Keyword Dominance Program',
          desc: 'Identify and systematically capture the top 50 highest-commercial-intent keyword clusters through content engineering, technical on-page SEO, and link acquisition.'
        }
      ],
      tools: [
        'Google Ads',
        'Meta Ads Manager',
        'Ahrefs Enterprise',
        'Screaming Frog',
        'Google Tag Manager',
        'GA4 Server-Side',
        'Surfer SEO'
      ],
      benchmarks: [
        { val: '+220%', label: 'Organic Traffic Growth', sub: '6-month average across clients' },
        { val: '3.9x', label: 'Blended ROAS', sub: 'Paid + organic channel combined' },
        { val: '-28%', label: 'Cost Per Qualified Lead', sub: 'Through demand consolidation' },
        { val: '+67%', label: 'Share of Voice Lift', sub: 'Target commercial keyword set' }
      ],
      roadmap: [
        {
          badge: 'STAGE 01 · DAYS 1–30',
          title: 'Demand Landscape Audit & Architecture',
          desc: 'Map competitive demand landscape, audit existing channel efficiency, and design unified demand architecture across paid and organic channels.'
        },
        {
          badge: 'STAGE 02 · DAYS 31–60',
          title: 'Channel Activation & GEO Content Engine',
          desc: 'Launch coordinated paid campaigns, activate top-priority keyword content, and deploy GEO-structured answer pages targeting AI search engines.'
        },
        {
          badge: 'STAGE 03 · DAYS 61–90',
          title: 'Attribution Calibration & Scale',
          desc: 'Validate attribution model accuracy, scale winning demand channels, and establish a compounding organic authority moat.'
        }
      ]
    },

    3: {
      id: 3,
      badge: '03',
      category: 'WEB ENGINEERING & MARKETING AUTOMATION',
      title: 'JOURNEY ORCHESTRATION',
      tagline: 'Frictionless buyer experiences from first click through confirmed booking or purchase',
      overview: 'Journey Orchestration eliminates every friction point between a qualified prospect and a conversion. We engineer high-performance web architecture, automated CRM lead routing, webhook API integrations, and dynamic retargeting sequences — ensuring no buyer falls through the cracks from awareness to closed revenue.',
      highlights: [
        '⚡ Sub-Second Web Performance Engineering',
        '🔄 Zero-Latency CRM Webhook Automation',
        '🛒 High-Converting Landing Page Systems',
        '📧 Multi-Branch Automated Nurture Flows'
      ],
      deliverables: [
        {
          icon: '⚡',
          title: 'High-Performance Web Architecture',
          desc: 'Build or optimize web infrastructure for sub-second load times, mobile-first responsiveness, and Core Web Vitals compliance across all key conversion pages.'
        },
        {
          icon: '🔄',
          title: 'API Webhook & CRM Lead Routing',
          desc: 'Connect form submissions, e-commerce events, and booking systems to CRM, Slack, and email platforms via custom webhook API automations with zero-latency SLAs.'
        },
        {
          icon: '🛒',
          title: 'Conversion-Optimized Landing Pages',
          desc: 'Design and build modular landing page systems with persuasive hierarchy, social proof, and friction-reduction patterns that convert at 2–4x industry benchmarks.'
        },
        {
          icon: '📧',
          title: 'Multi-Branch CRM Nurture Sequences',
          desc: 'Deploy behavioral email automation triggered by form fills, page visits, and pricing calculator interactions — guiding prospects through every micro-decision to booking.'
        }
      ],
      tools: [
        'Webflow / Next.js',
        'HubSpot CRM',
        'Zapier & Make',
        'Klaviyo Automation',
        'Hotjar Heatmaps',
        'Cloudflare CDN',
        'Stripe API'
      ],
      benchmarks: [
        { val: '+185%', label: 'Landing Page CVR Lift', sub: 'Vs pre-optimization baseline' },
        { val: '<12 min', label: 'Speed-to-Lead SLA', sub: 'Via real-time webhook routing' },
        { val: '99.9%', label: 'Form Submission Capture Rate', sub: 'Zero data loss guarantee' },
        { val: '-42%', label: 'Funnel Drop-Off Rate', sub: 'Through friction elimination' }
      ],
      roadmap: [
        {
          badge: 'STAGE 01 · DAYS 1–21',
          title: 'Funnel Audit & Tech Stack Integration',
          desc: 'Audit entire conversion journey, identify drop-off points, and connect all web, CRM, and email systems with webhook integrations.'
        },
        {
          badge: 'STAGE 02 · DAYS 22–55',
          title: 'Landing Page Build & Automation Launch',
          desc: 'Deploy new conversion-optimized landing pages, activate CRM lead routing automations, and launch multi-branch nurture email sequences.'
        },
        {
          badge: 'STAGE 03 · DAYS 56–90',
          title: 'CRO Testing & Journey Optimization',
          desc: 'Run A/B tests on headlines, CTAs, and form layouts; iterate nurture sequences based on open and click data; and lock in compounding CVR gains.'
        }
      ]
    },

    4: {
      id: 4,
      badge: '04',
      category: 'GA4 ATTRIBUTION & FUNNEL OPTIMIZATION',
      title: 'MEASUREMENT & CRO',
      tagline: 'Full-funnel analytics telemetry and conversion rate experimentation for maximum ROI clarity',
      overview: 'Measurement & CRO transforms your analytics stack into a decision engine. We deploy server-side GA4 event tracking, cross-channel CAPI attribution, and systematic A/B funnel experimentation — giving you verified, bias-free performance data to confidently scale budget behind what actually drives revenue growth.',
      highlights: [
        '📊 Server-Side GA4 & CAPI Attribution',
        '🧪 A/B Funnel Experimentation Engine',
        '💰 CAC & LTV Unit-Economic Modeling',
        '🔮 Real-Time Performance Intelligence Dashboards'
      ],
      deliverables: [
        {
          icon: '📊',
          title: 'Server-Side GA4 & Attribution Setup',
          desc: 'Implement server-side Google Tag Manager and GA4 with custom event schemas, cross-channel attribution models, and offline conversion import pipelines.'
        },
        {
          icon: '🧪',
          title: 'A/B Funnel Experimentation Program',
          desc: 'Run statistically significant split tests on landing pages, CTAs, email subject lines, ad creatives, and pricing pages to systematically lift conversion at every stage.'
        },
        {
          icon: '💰',
          title: 'CAC & LTV Performance Modeling',
          desc: 'Build real-time financial models that track blended CAC, channel-level ROAS, LTV payback periods, and contribution margin to guide confident budget allocation.'
        },
        {
          icon: '🔮',
          title: 'Executive Performance Intelligence Dashboards',
          desc: 'Design bespoke Looker Studio dashboards with live data feeds — giving leadership instant visibility into pipeline velocity, media efficiency, and revenue attribution.'
        }
      ],
      tools: [
        'Google Analytics 4',
        'Google Tag Manager Server',
        'Meta CAPI',
        'Looker Studio',
        'VWO / Optimizely',
        'Triple Whale',
        'BigQuery Analytics'
      ],
      benchmarks: [
        { val: '100%', label: 'Conversion Data Accuracy', sub: 'Server-side CAPI capture rate' },
        { val: '+68%', label: 'A/B Test Win Rate', sub: 'Experiments hitting significance' },
        { val: '-34%', label: 'Wasted Media Spend', sub: 'Eliminated via attribution clarity' },
        { val: '2.8x', label: 'Reported ROAS Improvement', sub: 'With accurate attribution model' }
      ],
      roadmap: [
        {
          badge: 'STAGE 01 · DAYS 1–21',
          title: 'Tracking Audit & Server-Side GA4 Setup',
          desc: 'Audit existing tracking gaps, implement server-side GTM + GA4, configure cross-channel attribution, and upload offline conversion data.'
        },
        {
          badge: 'STAGE 02 · DAYS 22–55',
          title: 'Experiment Launch & Dashboard Build',
          desc: 'Launch first-wave A/B experiments on highest-traffic pages, build executive Looker Studio dashboards, and activate real-time CAC/LTV alerts.'
        },
        {
          badge: 'STAGE 03 · DAYS 56–90',
          title: 'Optimization Loops & Scale Intelligence',
          desc: 'Iterate winning experiments, refine attribution models with 90 days of data, and deliver a compounding optimization roadmap for the next quarter.'
        }
      ]
    }
  };

  const serviceModal = document.getElementById('serviceModal');
  const closeServiceModal = document.getElementById('closeServiceModal');
  const smPrevBtn = document.getElementById('smPrevBtn');
  const smNextBtn = document.getElementById('smNextBtn');
  const smTabsPills = document.getElementById('smTabsPills');
  const smBtnSchedule = document.getElementById('smBtnSchedule');
  const smBtnCaseStudy = document.getElementById('smBtnCaseStudy');

  let currentServiceId = 1;

  function renderService(id) {
    const svc = serviceData[id];
    if (!svc || !serviceModal) return;
    currentServiceId = id;

    // Update topbar
    const smBadge = document.getElementById('smBadge');
    const smCategory = document.getElementById('smCategory');
    const smTagline = document.getElementById('smTagline');
    const smTitle = document.getElementById('smTitle');
    const smOverview = document.getElementById('smOverview');
    const smHighlights = document.getElementById('smHighlights');
    const smDeliverables = document.getElementById('smDeliverables');
    const smToolStack = document.getElementById('smToolStack');
    const smBenchmarks = document.getElementById('smBenchmarks');
    const smRoadmap = document.getElementById('smRoadmap');
    const smFooterServiceName = document.getElementById('smFooterServiceName');

    if (smBadge) smBadge.textContent = svc.badge;
    if (smCategory) smCategory.textContent = svc.category;
    if (smTagline) smTagline.textContent = svc.tagline;
    if (smTitle) smTitle.textContent = svc.title;
    if (smOverview) smOverview.textContent = svc.overview;
    if (smFooterServiceName) smFooterServiceName.textContent = `${svc.badge}: ${svc.title.charAt(0) + svc.title.slice(1).toLowerCase()}`;

    // Highlights
    if (smHighlights) {
      smHighlights.innerHTML = svc.highlights.map(h =>
        `<span class="pm-highlight-chip">${h}</span>`
      ).join('');
    }

    // Deliverables
    if (smDeliverables) {
      smDeliverables.innerHTML = svc.deliverables.map(d => `
        <div class="pm-deliverable-item">
          <div class="pm-deliv-title"><span>${d.icon}</span> ${d.title}</div>
          <p class="pm-deliv-desc">${d.desc}</p>
        </div>
      `).join('');
    }

    // Tools
    if (smToolStack) {
      smToolStack.innerHTML = svc.tools.map(t =>
        `<span class="pm-tool-chip">⚙ ${t}</span>`
      ).join('');
    }

    // Benchmarks
    if (smBenchmarks) {
      smBenchmarks.innerHTML = svc.benchmarks.map(b => `
        <div class="pm-benchmark-box">
          <div class="pm-bench-val">${b.val}</div>
          <div class="pm-bench-label">${b.label}</div>
          <div class="pm-bench-sub">${b.sub}</div>
        </div>
      `).join('');
    }

    // Roadmap
    if (smRoadmap) {
      smRoadmap.innerHTML = svc.roadmap.map(r => `
        <div class="pm-sprint-step">
          <div class="pm-sprint-badge">${r.badge}</div>
          <div class="pm-sprint-title">${r.title}</div>
          <p class="pm-sprint-desc">${r.desc}</p>
        </div>
      `).join('');
    }

    // Dot nav active state
    if (smTabsPills) {
      smTabsPills.querySelectorAll('.pillar-dot-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.serviceSwitch, 10) === id);
      });
    }

    // Scroll body back to top
    const smScrollBody = document.getElementById('smScrollBody');
    if (smScrollBody) smScrollBody.scrollTop = 0;
  }

  function openService(id) {
    if (!serviceModal) return;
    renderService(id);
    serviceModal.setAttribute('aria-hidden', 'false');
    serviceModal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeService() {
    if (!serviceModal) return;
    serviceModal.classList.remove('open');
    serviceModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // Attach click handlers to service cards
  document.querySelectorAll('.service-card[data-service-id]').forEach(card => {
    card.addEventListener('click', () => {
      const sid = parseInt(card.dataset.serviceId, 10);
      openService(sid);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const sid = parseInt(card.dataset.serviceId, 10);
        openService(sid);
      }
    });
  });

  // Modal controls
  closeServiceModal?.addEventListener('click', closeService);

  serviceModal?.addEventListener('click', (e) => {
    if (e.target === serviceModal) closeService();
  });

  smPrevBtn?.addEventListener('click', () => {
    const prevId = currentServiceId === 1 ? 4 : currentServiceId - 1;
    renderService(prevId);
  });

  smNextBtn?.addEventListener('click', () => {
    const nextId = currentServiceId === 4 ? 1 : currentServiceId + 1;
    renderService(nextId);
  });

  if (smTabsPills) {
    smTabsPills.querySelectorAll('.pillar-dot-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sid = parseInt(btn.dataset.serviceSwitch, 10);
        renderService(sid);
      });
    });
  }

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (!serviceModal?.classList.contains('open')) return;
    if (e.key === 'Escape') {
      closeService();
    } else if (e.key === 'ArrowLeft') {
      const prevId = currentServiceId === 1 ? 4 : currentServiceId - 1;
      renderService(prevId);
    } else if (e.key === 'ArrowRight') {
      const nextId = currentServiceId === 4 ? 1 : currentServiceId + 1;
      renderService(nextId);
    }
  });

  // Footer actions
  smBtnSchedule?.addEventListener('click', () => {
    const currentSvc = serviceData[currentServiceId];
    closeService();
    const openScheduleFn = window.__fluvoOpenSchedule;
    if (typeof openScheduleFn === 'function') openScheduleFn();
    const pMessage = document.getElementById('pMessage');
    if (pMessage && currentSvc) {
      pMessage.value = `Interested in Service ${currentSvc.badge}: ${currentSvc.title}.`;
    }
  });

  smBtnCaseStudy?.addEventListener('click', () => {
    closeService();
  });
})();
