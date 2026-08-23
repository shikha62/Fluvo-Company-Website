import Chart from 'chart.js/auto';
import Papa from 'papaparse';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fetchAllQueries, updateQueryRecord, deleteQueryRecord, supabase } from './src/supabase.js';

document.addEventListener('DOMContentLoaded', () => {

  // ==========================================================================
  // 1. OWNER PASSWORD & SESSION-TOKEN AUTHENTICATION GATE
  //    Default password is "1234". Can be updated anytime in Settings.
  // ==========================================================================

  const SESSION_KEY = 'fluvo_owner_session';
  const PASSWORD_STORAGE_KEY = 'fluvo_owner_password';
  const DEFAULT_PASSWORD = '1234';
  const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8-hour session window

  const authOverlay = document.getElementById('authOverlay');
  const dashboardLayout = document.getElementById('dashboardLayout');
  const authErrorMsg = document.getElementById('authErrorMsg');
  const btnUnlock = document.getElementById('btnUnlock');
  const p1 = document.getElementById('p1');
  const p2 = document.getElementById('p2');
  const p3 = document.getElementById('p3');
  const p4 = document.getElementById('p4');
  const fullPasswordInput = document.getElementById('fullPasswordInput');
  const btnToggleCustomPw = document.getElementById('btnToggleCustomPw');
  const pinDigitsWrap = document.getElementById('pinDigitsWrap');

  function getStoredPassword() {
    return localStorage.getItem(PASSWORD_STORAGE_KEY) || DEFAULT_PASSWORD;
  }

  function setStoredPassword(newPassword) {
    localStorage.setItem(PASSWORD_STORAGE_KEY, newPassword);
  }

  function isSessionValid() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return false;
      const { authenticated, expiresAt } = JSON.parse(raw);
      if (!authenticated || Date.now() > expiresAt) {
        sessionStorage.removeItem(SESSION_KEY);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  let dashboardInitialized = false;

  function grantAccess() {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      authenticated: true,
      expiresAt: Date.now() + TOKEN_TTL_MS,
      user: 'owner'
    }));

    if (authOverlay) authOverlay.style.display = 'none';
    if (dashboardLayout) dashboardLayout.style.display = 'flex';

    if (!dashboardInitialized) {
      dashboardInitialized = true;
      initDashboard();
    } else {
      loadQueries();
    }
  }

  function attemptUnlock() {
    const isCustomBoxVisible = fullPasswordInput && fullPasswordInput.style.display !== 'none';
    let entered = '';

    if (isCustomBoxVisible) {
      entered = fullPasswordInput.value.trim();
    } else {
      entered = (p1?.value || '') + (p2?.value || '') + (p3?.value || '') + (p4?.value || '');
    }

    const currentCorrectPassword = getStoredPassword();

    if (entered === currentCorrectPassword) {
      if (authErrorMsg) authErrorMsg.style.display = 'none';
      grantAccess();
    } else {
      if (authErrorMsg) {
        authErrorMsg.innerText = '❌ Incorrect password. Please try again.';
        authErrorMsg.style.display = 'block';
      }
      [p1, p2, p3, p4].forEach(p => {
        if (p) {
          p.value = '';
          p.style.borderColor = '#D95757';
          setTimeout(() => { p.style.borderColor = ''; }, 1000);
        }
      });
      if (fullPasswordInput) fullPasswordInput.value = '';
      if (!isCustomBoxVisible) p1?.focus();
    }
  }

  // Setup PIN digit inputs auto-advance
  [p1, p2, p3, p4].forEach((input, idx, arr) => {
    if (!input) return;
    input.addEventListener('input', () => {
      if (input.value.length === 1) {
        if (idx < arr.length - 1) {
          arr[idx + 1].focus();
        } else {
          attemptUnlock();
        }
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && idx > 0) {
        arr[idx - 1].focus();
      }
      if (e.key === 'Enter') {
        attemptUnlock();
      }
    });
  });

  // Toggle between PIN boxes and full text input
  if (btnToggleCustomPw && fullPasswordInput && pinDigitsWrap) {
    btnToggleCustomPw.addEventListener('click', () => {
      const isCustom = fullPasswordInput.style.display !== 'none';
      if (isCustom) {
        fullPasswordInput.style.display = 'none';
        pinDigitsWrap.style.display = 'flex';
        btnToggleCustomPw.innerText = 'Use standard password input';
        p1?.focus();
      } else {
        fullPasswordInput.style.display = 'block';
        pinDigitsWrap.style.display = 'none';
        btnToggleCustomPw.innerText = 'Use 4-digit PIN boxes';
        fullPasswordInput.focus();
      }
    });

    fullPasswordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') attemptUnlock();
    });
  }

  btnUnlock?.addEventListener('click', attemptUnlock);

  // Check initial session
  if (isSessionValid()) {
    if (authOverlay) authOverlay.style.display = 'none';
    if (dashboardLayout) dashboardLayout.style.display = 'flex';
    dashboardInitialized = true;
    initDashboard();
  } else {
    if (authOverlay) authOverlay.style.display = 'flex';
    if (dashboardLayout) dashboardLayout.style.display = 'none';
    setTimeout(() => p1?.focus(), 150);
  }

  // Auto-logout on session expiry (check every minute)
  setInterval(() => {
    if (!isSessionValid() && dashboardLayout?.style.display === 'flex') {
      alert('Your session has expired. Please authenticate again.');
      if (authOverlay) authOverlay.style.display = 'flex';
      if (dashboardLayout) dashboardLayout.style.display = 'none';
    }
  }, 60_000);

  function handleLockout() {
    sessionStorage.removeItem(SESSION_KEY);
    if (authOverlay) authOverlay.style.display = 'flex';
    if (dashboardLayout) dashboardLayout.style.display = 'none';
    [p1, p2, p3, p4].forEach(p => { if (p) p.value = ''; });
    if (fullPasswordInput) fullPasswordInput.value = '';
    if (authErrorMsg) authErrorMsg.style.display = 'none';
    setTimeout(() => p1?.focus(), 100);
  }

  document.getElementById('btnLogout')?.addEventListener('click', handleLockout);
  document.getElementById('btnDropdownLogout')?.addEventListener('click', handleLockout);


  // ==========================================================================
  // 2. TAB SWITCHING & OWNER DROPDOWN
  // ==========================================================================
  const sidebarLinks = document.querySelectorAll('.sidebar-link');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const tabTitle = document.getElementById('tabTitle');
  const tabSubtitle = document.getElementById('tabSubtitle');

  const tabMeta = {
    overview: {
      title: 'Executive Overview',
      subtitle: 'Performance command center for Fluvo executive operations.'
    },
    queries: {
      title: 'Enterprise Queries & Leads',
      subtitle: 'Manage incoming enterprise enquiries, consultation requests, and sprint pipeline.'
    },
    revenue: {
      title: 'Financial Performance & Revenue',
      subtitle: 'Track attributed revenue, ad spend investment, and client retainers.'
    },
    growth: {
      title: 'Growth & Attribution Funnels',
      subtitle: 'Monitor traffic channels, engagement events, conversion rates, and acquisition.'
    },
    settings: {
      title: 'Security & Workspace Settings',
      subtitle: 'Configure Master PIN / Password, session duration, and workspace preferences.'
    }
  };

  function switchTab(tabKey) {
    sidebarLinks.forEach(l => {
      if (l.dataset.tab === tabKey) l.classList.add('active');
      else l.classList.remove('active');
    });

    tabPanes.forEach(p => {
      if (p.id === `tab-${tabKey}`) p.classList.add('active');
      else p.classList.remove('active');
    });

    if (tabMeta[tabKey]) {
      if (tabTitle) tabTitle.innerText = tabMeta[tabKey].title;
      if (tabSubtitle) tabSubtitle.innerText = tabMeta[tabKey].subtitle;
    }
  }

  sidebarLinks.forEach(link => {
    link.addEventListener('click', () => {
      const tab = link.dataset.tab;
      if (tab) switchTab(tab);
    });
  });

  // Quick Action & Dropdown links that trigger tab switches
  document.querySelectorAll('[data-goto-tab]').forEach(elem => {
    elem.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = elem.getAttribute('data-goto-tab');
      if (tab) {
        switchTab(tab);
        if (profileDropdown) profileDropdown.classList.remove('open');
      }
    });
  });

  // Profile Menu Dropdown
  const btnProfileToggle = document.getElementById('btnProfileToggle');
  const profileDropdown = document.getElementById('profileDropdown');

  if (btnProfileToggle && profileDropdown) {
    btnProfileToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      profileDropdown.classList.toggle('open');
    });

    document.addEventListener('click', () => {
      profileDropdown.classList.remove('open');
    });
  }


  // ==========================================================================
  // 3. DATA ENGINE & METRICS
  // ==========================================================================
  let queriesData = [];
  let currentFilter = 'all';
  let searchQuery = '';
  let activeDrawerLead = null;

  // Chart instances
  let overviewChartInstance = null;
  let statusPieChartInstance = null;

  async function initDashboard() {
    initCharts();
    await loadQueries();
    setupRealtimeSubscription();
  }

  async function loadQueries() {
    try {
      const systemStatusText = document.getElementById('systemStatusText');
      if (systemStatusText) systemStatusText.innerText = 'Syncing...';

      queriesData = await fetchAllQueries();

      if (systemStatusText) systemStatusText.innerText = 'Database Connected';
      renderKPIs();
      renderTable();
      renderRecentActivity();
      updateCharts();
    } catch (err) {
      console.error('Failed to load queries:', err);
      const systemStatusText = document.getElementById('systemStatusText');
      if (systemStatusText) systemStatusText.innerText = 'Database Connected (Local)';
      
      renderKPIs();
      renderTable();
      renderRecentActivity();
      updateCharts();
    }
  }

  // ==========================================================================
  // 4. DATA-DRIVEN KPI COMPUTATION
  // ==========================================================================
  function renderKPIs() {
    const kpiTotalQueries = document.getElementById('kpiTotalQueries');
    const kpiTotalQueriesSupport = document.getElementById('kpiTotalQueriesSupport');
    const kpiNewToday = document.getElementById('kpiNewToday');
    const kpiNewTodaySupport = document.getElementById('kpiNewTodaySupport');

    if (!queriesData || queriesData.length === 0) {
      if (kpiTotalQueries) kpiTotalQueries.innerText = '0';
      if (kpiTotalQueriesSupport) kpiTotalQueriesSupport.innerText = 'No active queries yet';
      if (kpiNewToday) kpiNewToday.innerText = '0';
      if (kpiNewTodaySupport) kpiNewTodaySupport.innerText = 'No new activity today';
      return;
    }

    // Active Queries = Status not resolved
    const activeCount = queriesData.filter(q => q.status !== 'resolved').length;
    if (kpiTotalQueries) kpiTotalQueries.innerText = activeCount.toString();
    if (kpiTotalQueriesSupport) {
      kpiTotalQueriesSupport.innerText = `Across ${queriesData.length} total recorded inquiry${queriesData.length === 1 ? '' : 's'}`;
    }

    // New Today = Created today or marked 'new'
    const newCount = queriesData.filter(q => q.status === 'new').length;
    if (kpiNewToday) kpiNewToday.innerText = newCount.toString();
    if (kpiNewTodaySupport) {
      kpiNewTodaySupport.innerText = newCount > 0 
        ? '⚡ Requires review & follow up' 
        : 'All new inquiries contacted';
    }
  }

  // ==========================================================================
  // 5. RECENT ACTIVITY STREAM
  // ==========================================================================
  function renderRecentActivity() {
    const activityStream = document.getElementById('activityStream');
    if (!activityStream) return;

    if (!queriesData || queriesData.length === 0) {
      activityStream.innerHTML = `
        <div class="empty-state-box">
          <div class="empty-icon">⚡</div>
          <div class="empty-title">No recent activity</div>
          <p class="empty-desc">Activity will appear here as visitors, inquiries and growth events are recorded.</p>
        </div>
      `;
      return;
    }

    // Sort by recent and take top 4
    const recent = queriesData.slice(0, 4);
    activityStream.innerHTML = recent.map(q => {
      const timeFormatted = formatTimeAgo(q.createdAt);
      const companyOrClient = q.company ? `${q.fullName} (${q.company})` : (q.fullName || 'Prospective Client');
      const budgetDisplay = (q.adSpend && q.adSpend !== 'N/A') ? q.adSpend : 'Schedule Strategy Call';

      return `
        <div class="activity-item-card" onclick="window.openLeadDrawer('${q.id}')">
          <div style="font-size: 16px; margin-top: 1px; color: var(--brand-orange);">⚡</div>
          <div style="flex: 1;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
              <strong style="font-size: 13px; color: var(--text-primary);">${escapeHtml(companyOrClient)}</strong>
              <span style="font-size: 11px; color: var(--text-muted);">${timeFormatted}</span>
            </div>
            <p style="font-size: 12px; color: var(--text-secondary); line-height: 1.4;">
              ${escapeHtml(q.workEmail || q.phone)} · <span style="color: var(--brand-orange); font-weight: 500;">${escapeHtml(budgetDisplay)}</span>
            </p>
          </div>
        </div>
      `;
    }).join('');
  }

  function formatTimeAgo(isoString) {
    if (!isoString) return 'Just now';
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  // ==========================================================================
  // 6. QUERIES TABLE RENDERER
  // ==========================================================================
  const querySearchInput = document.getElementById('querySearchInput');
  const queryFilterGroup = document.getElementById('queryFilterGroup');
  const queriesTableBody = document.getElementById('queriesTableBody');

  if (querySearchInput) {
    querySearchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderTable();
    });
  }

  if (queryFilterGroup) {
    queryFilterGroup.querySelectorAll('.status-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        queryFilterGroup.querySelectorAll('.status-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter || 'all';
        renderTable();
      });
    });
  }

  function renderTable() {
    if (!queriesTableBody) return;

    // Filter by tab status and search keyword
    const filtered = queriesData.filter(q => {
      const matchFilter = (currentFilter === 'all') || (q.status === currentFilter);
      if (!matchFilter) return false;

      if (!searchQuery) return true;
      const haystack = [
        q.fullName,
        q.workEmail,
        q.company,
        q.phone,
        q.message,
        q.adSpend,
        q.notes
      ].join(' ').toLowerCase();

      return haystack.includes(searchQuery);
    });

    if (filtered.length === 0) {
      queriesTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="padding: 48px 24px; text-align: center;">
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;">
              <div style="font-size: 28px;">📋</div>
              <strong style="font-size: 15px; color: var(--text-primary);">No client inquiries found</strong>
              <p style="font-size: 13px; color: var(--text-muted); max-width: 380px; margin: 0;">
                ${queriesData.length === 0 
                  ? 'Your first enquiry will appear here when a visitor submits a schedule request.' 
                  : 'No queries match your current filter or search terms.'}
              </p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    queriesTableBody.innerHTML = filtered.map(row => {
      const isStarred = row.starred;
      const dateFormatted = row.preferredDate || (row.createdAt ? row.createdAt.slice(0, 10) : '—');
      const companyOrClient = row.company || 'Enterprise Brand';
      const clientName = row.fullName || 'Executive Contact';
      const requirementSnippet = row.message ? row.message.slice(0, 55) + (row.message.length > 55 ? '…' : '') : 'Technical Growth Diagnostic';
      const budgetDisplay = (row.adSpend && row.adSpend !== 'N/A') ? row.adSpend : 'Consultation';

      return `
        <tr class="clickable-row" data-id="${row.id}">
          <td style="text-align: center;" onclick="event.stopPropagation(); window.toggleStar('${row.id}')">
            <button class="star-btn ${isStarred ? 'starred' : ''}" title="${isStarred ? 'Unstar' : 'Star lead'}">
              ${isStarred ? '★' : '☆'}
            </button>
          </td>
          <td>
            <div style="font-weight: 600; color: var(--text-primary); font-size: 13.5px;">${escapeHtml(clientName)}</div>
            <div style="font-size: 11.5px; color: var(--text-secondary); margin-top: 2px;">🏢 ${escapeHtml(companyOrClient)} · <span style="color: var(--text-muted);">${escapeHtml(row.workEmail || row.phone)}</span></div>
          </td>
          <td>
            <span style="color: var(--text-secondary); font-size: 12.5px;">${escapeHtml(requirementSnippet)}</span>
          </td>
          <td>
            <span style="color: var(--brand-orange); font-weight: 600; font-size: 12px; background: var(--brand-orange-subtle); padding: 3px 8px; border-radius: 4px; border: 1px solid rgba(216,107,47,0.2);">${escapeHtml(budgetDisplay)}</span>
          </td>
          <td>
            <span style="font-size: 12px; color: var(--text-secondary); font-family: var(--font-mono);">${escapeHtml(dateFormatted)}</span>
          </td>
          <td onclick="event.stopPropagation();">
            <select class="status-badge badge-${row.status}" onchange="window.handleStatusChange('${row.id}', this.value)" style="outline: none; cursor: pointer; border-radius: 9999px;">
              <option value="new" ${row.status === 'new' ? 'selected' : ''}>● New</option>
              <option value="contacted" ${row.status === 'contacted' ? 'selected' : ''}>● Contacted</option>
              <option value="in-progress" ${row.status === 'in-progress' ? 'selected' : ''}>● In Progress</option>
              <option value="resolved" ${row.status === 'resolved' ? 'selected' : ''}>● Resolved</option>
            </select>
          </td>
          <td onclick="event.stopPropagation();">
            <div class="table-actions">
              <button class="icon-action-btn" title="Inspect & Edit Lead" onclick="window.openLeadDrawer('${row.id}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
              <button class="icon-action-btn btn-del" title="Delete Inquiry" onclick="window.handleDeleteQuery('${row.id}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach row click to open drawer
    queriesTableBody.querySelectorAll('tr.clickable-row').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.dataset.id;
        if (id) window.openLeadDrawer(id);
      });
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m]);
  }

  // Global window functions for table item interactions
  window.toggleStar = async function(id) {
    const item = queriesData.find(q => q.id === id);
    if (!item) return;
    const nextState = !item.starred;
    item.starred = nextState;
    renderTable();

    try {
      await updateQueryRecord(id, { starred: nextState });
    } catch (e) {
      console.error('Failed to update star state:', e);
    }
  };

  window.handleStatusChange = async function(id, newStatus) {
    const item = queriesData.find(q => q.id === id);
    if (!item) return;
    item.status = newStatus;
    renderKPIs();
    renderTable();
    updateCharts();

    try {
      await updateQueryRecord(id, { status: newStatus });
    } catch (e) {
      console.error('Failed to update status:', e);
    }
  };

  window.handleDeleteQuery = async function(id) {
    if (!confirm('Are you sure you want to delete this client inquiry permanently?')) return;
    queriesData = queriesData.filter(q => q.id !== id);
    renderKPIs();
    renderTable();
    renderRecentActivity();
    updateCharts();

    try {
      await deleteQueryRecord(id);
    } catch (e) {
      console.error('Failed to delete query:', e);
    }
  };


  // ==========================================================================
  // 7. LEAD DETAIL SLIDE-IN DRAWER
  // ==========================================================================
  const leadDrawerOverlay = document.getElementById('leadDrawerOverlay');
  const leadDrawer = document.getElementById('leadDrawer');
  const btnCloseDrawer = document.getElementById('btnCloseDrawer');
  const btnDrawerSave = document.getElementById('btnDrawerSave');
  const btnDrawerDelete = document.getElementById('btnDrawerDelete');

  const drawerLeadName = document.getElementById('drawerLeadName');
  const drawerLeadCompany = document.getElementById('drawerLeadCompany');
  const drawerContactInfo = document.getElementById('drawerContactInfo');
  const drawerBudget = document.getElementById('drawerBudget');
  const drawerDate = document.getElementById('drawerDate');
  const drawerMessage = document.getElementById('drawerMessage');
  const drawerStatusSelect = document.getElementById('drawerStatusSelect');
  const drawerNotesText = document.getElementById('drawerNotesText');

  window.openLeadDrawer = function(id) {
    const lead = queriesData.find(q => q.id === id);
    if (!lead) return;
    activeDrawerLead = lead;

    if (drawerLeadName) drawerLeadName.innerText = lead.fullName || 'Prospective Client';
    if (drawerLeadCompany) drawerLeadCompany.innerText = lead.company || 'Enterprise Executive';
    if (drawerContactInfo) {
      drawerContactInfo.innerHTML = `
        <div>📧 <a href="mailto:${escapeHtml(lead.workEmail)}" style="color: var(--brand-orange); text-decoration: none; font-weight: 500;">${escapeHtml(lead.workEmail || 'No email provided')}</a></div>
        <div style="margin-top: 4px; color: var(--text-secondary);">📞 ${escapeHtml(lead.phone || 'No phone number provided')}</div>
      `;
    }
    if (drawerBudget) drawerBudget.innerText = (lead.adSpend && lead.adSpend !== 'N/A') ? lead.adSpend : 'Growth Diagnostic Request';
    if (drawerDate) drawerDate.innerText = `${lead.preferredDate || 'Flexible Schedule'} ${lead.preferredTime ? '· ' + lead.preferredTime : ''}`;
    if (drawerMessage) drawerMessage.innerText = lead.message || 'No specific objective details entered.';
    if (drawerStatusSelect) drawerStatusSelect.value = lead.status || 'new';
    if (drawerNotesText) drawerNotesText.value = lead.notes || '';

    leadDrawerOverlay?.classList.add('open');
    leadDrawer?.classList.add('open');
  };

  function closeDrawer() {
    leadDrawerOverlay?.classList.remove('open');
    leadDrawer?.classList.remove('open');
    activeDrawerLead = null;
  }

  btnCloseDrawer?.addEventListener('click', closeDrawer);
  leadDrawerOverlay?.addEventListener('click', closeDrawer);

  btnDrawerSave?.addEventListener('click', async () => {
    if (!activeDrawerLead) return;
    const newStatus = drawerStatusSelect?.value || activeDrawerLead.status;
    const newNotes = drawerNotesText?.value.trim() || '';

    activeDrawerLead.status = newStatus;
    activeDrawerLead.notes = newNotes;

    renderKPIs();
    renderTable();
    updateCharts();
    closeDrawer();

    try {
      await updateQueryRecord(activeDrawerLead.id, {
        status: newStatus,
        notes: newNotes
      });
    } catch (e) {
      console.error('Failed to save drawer notes:', e);
    }
  });

  btnDrawerDelete?.addEventListener('click', () => {
    if (!activeDrawerLead) return;
    const id = activeDrawerLead.id;
    closeDrawer();
    window.handleDeleteQuery(id);
  });


  // ==========================================================================
  // 8. CHARTS ENGINE
  // ==========================================================================
  function initCharts() {
    // 1. Overview Revenue Line Chart
    const ovCanvas = document.getElementById('overviewChart');
    if (ovCanvas) {
      overviewChartInstance = new Chart(ovCanvas, {
        type: 'line',
        data: {
          labels: ['Sprint 1', 'Sprint 2', 'Sprint 3', 'Sprint 4', 'Sprint 5', 'Sprint 6'],
          datasets: [
            {
              label: 'Attributed Revenue ($)',
              data: [0, 0, 0, 0, 0, 0],
              borderColor: '#D86B2F',
              backgroundColor: 'rgba(216,107,47,0.1)',
              fill: true,
              tension: 0.35,
              borderWidth: 2
            },
            {
              label: 'Ad Capital Deployed ($)',
              data: [0, 0, 0, 0, 0, 0],
              borderColor: '#A0A0A0',
              borderDash: [4, 4],
              tension: 0.35,
              borderWidth: 1.5
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#A0A0A0', font: { family: 'Plus Jakarta Sans', size: 11 } } }
          },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#6F6F6F' } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#6F6F6F', callback: v => `$${v}` } }
          }
        }
      });
    }

    // 2. Query Pipeline Donut Chart
    const pieCanvas = document.getElementById('statusPieChart');
    if (pieCanvas) {
      statusPieChartInstance = new Chart(pieCanvas, {
        type: 'doughnut',
        data: {
          labels: ['New', 'Contacted', 'In Progress', 'Resolved'],
          datasets: [{
            data: [0, 0, 0, 0],
            backgroundColor: ['#D95757', '#D9A441', '#5B8DEF', '#3FB27F'],
            borderWidth: 0,
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '65%',
          plugins: {
            legend: { position: 'bottom', labels: { color: '#A0A0A0', font: { family: 'Plus Jakarta Sans', size: 11 }, padding: 10 } }
          }
        }
      });
    }
  }

  function updateCharts() {
    const total = queriesData.length;
    const statusEmpty = document.getElementById('statusChartEmpty');
    const statusChartCanvas = document.getElementById('statusPieChart');
    const pipelineCountBadge = document.getElementById('pipelineCountBadge');

    if (pipelineCountBadge) {
      pipelineCountBadge.innerText = `${total} Total Lead${total === 1 ? '' : 's'}`;
    }

    if (total === 0) {
      if (statusEmpty) statusEmpty.style.display = 'flex';
      if (statusChartCanvas) statusChartCanvas.style.display = 'none';
      return;
    }

    // If queries exist:
    if (statusEmpty) statusEmpty.style.display = 'none';
    if (statusChartCanvas) statusChartCanvas.style.display = 'block';

    // Calculate real status counts
    const newCount = queriesData.filter(q => q.status === 'new').length;
    const contactedCount = queriesData.filter(q => q.status === 'contacted').length;
    const inProgressCount = queriesData.filter(q => q.status === 'in-progress').length;
    const resolvedCount = queriesData.filter(q => q.status === 'resolved').length;

    if (statusPieChartInstance) {
      statusPieChartInstance.data.datasets[0].data = [
        newCount,
        contactedCount,
        inProgressCount,
        resolvedCount
      ];
      statusPieChartInstance.update();
    }
  }


  // ==========================================================================
  // 9. REAL-TIME POSTGRESQL SUBSCRIPTION
  // ==========================================================================
  function setupRealtimeSubscription() {
    try {
      supabase
        .channel('public:queries')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'queries' },
          async (payload) => {
            console.log('Realtime DB update received:', payload);
            await loadQueries();
          }
        )
        .subscribe();
    } catch (e) {
      console.warn('Realtime channel subscription error:', e);
    }
  }


  // ==========================================================================
  // 10. EXPORTS: CSV & EXECUTIVE PDF
  // ==========================================================================
  function exportCSV() {
    if (!queriesData || queriesData.length === 0) {
      alert('No queries available to export yet.');
      return;
    }

    const csvRows = queriesData.map(q => ({
      ID: q.id,
      FullName: q.fullName,
      WorkEmail: q.workEmail,
      Company: q.company,
      Phone: q.phone,
      AdSpend: q.adSpend,
      PreferredDate: q.preferredDate,
      PreferredTime: q.preferredTime,
      Status: q.status,
      Notes: q.notes,
      SubmittedAt: q.createdAt
    }));

    const csvString = Papa.unparse(csvRows);
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Fluvo_Executive_Queries_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function exportPDF() {
    const doc = new jsPDF();

    // Document Header
    doc.setFillColor(13, 13, 13);
    doc.rect(0, 0, 210, 36, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(245, 241, 234);
    doc.text('FLUVO.IN — EXECUTIVE PERFORMANCE REPORT', 14, 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(160, 160, 160);
    doc.text(`Generated on ${new Date().toLocaleString()} · Private Owner Console`, 14, 28);

    // KPI Summary
    doc.setFontSize(11);
    doc.setTextColor(216, 107, 47);
    doc.text(`Total Inquiries: ${queriesData.length}   |   Active: ${queriesData.filter(q=>q.status!=='resolved').length}   |   Resolved: ${queriesData.filter(q=>q.status==='resolved').length}`, 14, 46);

    // Table Data
    const tableBody = queriesData.map(q => [
      q.fullName || 'Prospective Client',
      q.company || '—',
      q.workEmail || '—',
      q.adSpend || '—',
      q.status.toUpperCase(),
      q.createdAt ? q.createdAt.slice(0,10) : '—'
    ]);

    autoTable(doc, {
      startY: 52,
      head: [['Client / Name', 'Company', 'Email', 'Budget', 'Status', 'Date']],
      body: tableBody.length > 0 ? tableBody : [['No client records recorded in Supabase yet', '—', '—', '—', '—', '—']],
      theme: 'grid',
      headStyles: { fillColor: [21, 21, 21], textColor: [245, 241, 234], fontStyle: 'bold' },
      styles: { fontSize: 8.5, cellPadding: 4, textColor: [30, 30, 30] }
    });

    doc.save(`Fluvo_Executive_Report_${new Date().toISOString().slice(0,10)}.pdf`);
  }

  document.getElementById('btnExportCSV')?.addEventListener('click', exportCSV);
  document.getElementById('qaExportCsv')?.addEventListener('click', exportCSV);
  document.getElementById('btnExportPDF')?.addEventListener('click', exportPDF);
  document.getElementById('qaExportPdf')?.addEventListener('click', exportPDF);


  // ==========================================================================
  // 11. SETTINGS: CHANGE OWNER PASSWORD
  // ==========================================================================
  const formChangePassword = document.getElementById('formChangePassword');
  const currentPasswordInput = document.getElementById('currentPasswordInput');
  const newPasswordInput = document.getElementById('newPasswordInput');
  const confirmPasswordInput = document.getElementById('confirmPasswordInput');
  const passwordChangeStatus = document.getElementById('passwordChangeStatus');
  const btnResetDefaultPassword = document.getElementById('btnResetDefaultPassword');

  if (formChangePassword) {
    formChangePassword.addEventListener('submit', (e) => {
      e.preventDefault();

      const currentPass = currentPasswordInput?.value.trim();
      const newPass = newPasswordInput?.value.trim();
      const confirmPass = confirmPasswordInput?.value.trim();
      const actualCurrentPass = getStoredPassword();

      if (currentPass !== actualCurrentPass) {
        showPasswordStatus('❌ Current password does not match.', 'error');
        return;
      }

      if (!newPass) {
        showPasswordStatus('❌ Please enter a valid new password.', 'error');
        return;
      }

      if (newPass !== confirmPass) {
        showPasswordStatus('❌ New password and confirmation do not match.', 'error');
        return;
      }

      // Save new password in localStorage
      setStoredPassword(newPass);
      showPasswordStatus(`✅ Master Password successfully updated!`, 'success');

      // Clear fields
      if (currentPasswordInput) currentPasswordInput.value = '';
      if (newPasswordInput) newPasswordInput.value = '';
      if (confirmPasswordInput) confirmPasswordInput.value = '';
    });
  }

  if (btnResetDefaultPassword) {
    btnResetDefaultPassword.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset the owner password back to default "1234"?')) {
        setStoredPassword(DEFAULT_PASSWORD);
        showPasswordStatus('✅ Password has been reset to default "1234".', 'success');
        if (currentPasswordInput) currentPasswordInput.value = '';
        if (newPasswordInput) newPasswordInput.value = '';
        if (confirmPasswordInput) confirmPasswordInput.value = '';
      }
    });
  }

  function showPasswordStatus(msg, type) {
    if (!passwordChangeStatus) return;
    passwordChangeStatus.innerText = msg;
    passwordChangeStatus.style.display = 'block';
    if (type === 'success') {
      passwordChangeStatus.style.background = 'rgba(63, 178, 127, 0.15)';
      passwordChangeStatus.style.border = '1px solid var(--color-success)';
      passwordChangeStatus.style.color = '#A7F3D0';
    } else {
      passwordChangeStatus.style.background = 'rgba(217, 87, 87, 0.15)';
      passwordChangeStatus.style.border = '1px solid var(--color-danger)';
      passwordChangeStatus.style.color = '#FCA5A5';
    }
  }

});
