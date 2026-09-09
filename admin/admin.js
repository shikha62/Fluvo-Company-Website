import Chart from 'chart.js/auto';
import Papa from 'papaparse';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================================================
  // 1. SECURE SERVERLESS AUTHENTICATION GATE
  // ==========================================================================
  const authOverlay = document.getElementById('authOverlay');
  const dashboardLayout = document.getElementById('dashboardLayout');
  const authErrorMsg = document.getElementById('authErrorMsg');
  const adminLoginForm = document.getElementById('adminLoginForm');
  const adminEmailInput = document.getElementById('adminEmailInput');
  const adminPasswordInput = document.getElementById('adminPasswordInput');
  const btnUnlock = document.getElementById('btnUnlock');
  const btnUnlockText = document.getElementById('btnUnlockText');
  const displayAdminEmail = document.getElementById('displayAdminEmail');

  let dashboardInitialized = false;
  let pollInterval = null;

  async function checkSession() {
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        onAuthenticated(data.user);
        return true;
      }
    } catch (err) {
      console.warn('Session verification check failed:', err);
    }
    showLogin();
    return false;
  }

  function showLogin() {
    if (authOverlay) authOverlay.style.display = 'flex';
    if (dashboardLayout) dashboardLayout.style.display = 'none';
    if (adminPasswordInput) adminPasswordInput.value = '';
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    setTimeout(() => adminEmailInput?.focus(), 150);
  }

  function onAuthenticated(user) {
    if (authOverlay) authOverlay.style.display = 'none';
    if (dashboardLayout) dashboardLayout.style.display = 'flex';
    if (authErrorMsg) authErrorMsg.style.display = 'none';

    if (user && user.email && displayAdminEmail) {
      displayAdminEmail.innerText = user.email;
    }

    if (!dashboardInitialized) {
      dashboardInitialized = true;
      initDashboard();
    } else {
      loadQueries();
    }

    // Start background sync polling every 30 seconds
    if (!pollInterval) {
      pollInterval = setInterval(loadQueries, 30_000);
    }
  }

  async function handleLoginSubmit(e) {
    if (e) e.preventDefault();
    const email = adminEmailInput?.value.trim();
    const password = adminPasswordInput?.value;

    if (!email || !password) {
      showAuthError('Please enter both email and password.');
      return;
    }

    if (btnUnlock) btnUnlock.disabled = true;
    if (btnUnlockText) btnUnlockText.innerText = 'Authenticating...';
    if (authErrorMsg) authErrorMsg.style.display = 'none';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        onAuthenticated(data.user);
      } else {
        showAuthError(data.error || 'Authentication failed. Please verify credentials.');
        if (adminPasswordInput) {
          adminPasswordInput.value = '';
          adminPasswordInput.style.borderColor = '#D95757';
          setTimeout(() => { if (adminPasswordInput) adminPasswordInput.style.borderColor = ''; }, 1200);
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      showAuthError('Unable to connect to authentication server. Please try again.');
    } finally {
      if (btnUnlock) btnUnlock.disabled = false;
      if (btnUnlockText) btnUnlockText.innerText = 'Sign In & Unlock Console';
    }
  }

  function showAuthError(msg) {
    if (!authErrorMsg) return;
    authErrorMsg.innerText = `❌ ${msg}`;
    authErrorMsg.style.display = 'block';
  }

  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', handleLoginSubmit);
  }
  if (btnUnlock) {
    btnUnlock.addEventListener('click', handleLoginSubmit);
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (err) {
      console.error('Logout error:', err);
    }
    showLogin();
  }

  document.getElementById('btnLogout')?.addEventListener('click', handleLogout);
  document.getElementById('btnDropdownLogout')?.addEventListener('click', handleLogout);

  // Initial session check on page load
  checkSession();

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
      subtitle: 'Configure Master Credentials, session duration, and workspace preferences.'
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
  }

  async function loadQueries() {
    try {
      const systemStatusText = document.getElementById('systemStatusText');
      if (systemStatusText) systemStatusText.innerText = 'Syncing...';

      const res = await fetch('/api/queries', { credentials: 'same-origin' });
      if (res.status === 401) {
        showLogin();
        return;
      }

      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        queriesData = json.data;
      }

      if (systemStatusText) systemStatusText.innerText = 'Database Connected';
      renderKPIs();
      renderTable();
      renderRecentActivity();
      updateCharts();
    } catch (err) {
      console.error('Failed to load queries via API:', err);
      const systemStatusText = document.getElementById('systemStatusText');
      if (systemStatusText) systemStatusText.innerText = 'Connection Error';
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
            <div style="font-weight: 600; color: var(--text-primary); font-size: 13.5px;">${escapeHtml(companyOrClient)}</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 1px;">${escapeHtml(clientName)}</div>
          </td>
          <td>
            <div><a href="mailto:${escapeHtml(row.workEmail)}" onclick="event.stopPropagation();" style="color: var(--text-primary); text-decoration: none; font-weight: 500;">${escapeHtml(row.workEmail)}</a></div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(row.phone || 'No phone')}</div>
          </td>
          <td>
            <span style="color: var(--brand-orange); font-weight: 600; font-size: 13px;">${escapeHtml(budgetDisplay)}</span>
            <div style="font-size: 11px; color: var(--text-muted); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px;">${escapeHtml(requirementSnippet)}</div>
          </td>
          <td>
            <span class="badge-date">${escapeHtml(dateFormatted)}</span>
          </td>
          <td onclick="event.stopPropagation();">
            <select class="status-select status-${row.status}" onchange="window.handleStatusChange('${row.id}', this.value)">
              <option value="new" ${row.status === 'new' ? 'selected' : ''}>New</option>
              <option value="contacted" ${row.status === 'contacted' ? 'selected' : ''}>Contacted</option>
              <option value="in-progress" ${row.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
              <option value="resolved" ${row.status === 'resolved' ? 'selected' : ''}>Resolved</option>
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
    return String(str).replace(/[&<>"']/g, m => ({
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
      await fetch(`/api/queries/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ starred: nextState })
      });
    } catch (e) {
      console.error('Failed to update star state via API:', e);
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
      await fetch(`/api/queries/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ status: newStatus })
      });
    } catch (e) {
      console.error('Failed to update status via API:', e);
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
      await fetch(`/api/queries/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin'
      });
    } catch (e) {
      console.error('Failed to delete query via API:', e);
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
      await fetch(`/api/queries/${encodeURIComponent(activeDrawerLead.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          status: newStatus,
          notes: newNotes
        })
      });
    } catch (e) {
      console.error('Failed to save drawer notes via API:', e);
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
  // 9. EXPORTS: CSV & EXECUTIVE PDF
  // ==========================================================================
  function exportCSV() {
    if (!queriesData || queriesData.length === 0) {
      alert('No queries available to export yet.');
      return;
    }

    // Direct download via serverless CSV endpoint
    window.location.href = '/api/export/csv';
  }

  function exportPDF() {
    const doc = new jsPDF();

    // Document Header
    doc.setFillColor(13, 13, 13);
    doc.rect(0, 0, 210, 36, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(245, 241, 234);
    doc.text('FLUVO — EXECUTIVE PERFORMANCE REPORT', 14, 18);

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
      (q.status || 'NEW').toUpperCase(),
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
});
