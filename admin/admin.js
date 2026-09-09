import Chart from 'chart.js/auto';
import Papa from 'papaparse';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tafwdnswcrjfaxhbdnlb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_P8A-ht36tSNNi82E4W7mug_qszJUxl1';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================================================
  // 1. TOAST NOTIFICATION UTILITY
  // ==========================================================================
  const toastContainer = document.getElementById('toastContainer');

  function showToast(message, type = 'info') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = '⚡';
    if (type === 'success') icon = '✓';
    if (type === 'error') icon = '✕';

    toast.innerHTML = `
      <span style="font-weight: 700; color: ${type === 'success' ? 'var(--color-success)' : (type === 'error' ? 'var(--color-danger)' : 'var(--amber)')};">${icon}</span>
      <span>${escapeHtml(message)}</span>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }

  // ==========================================================================
  // 2. SECURE SERVERLESS AUTHENTICATION GATE
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
  const dropdownUserEmail = document.getElementById('dropdownUserEmail');

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
      console.warn('Session check notice:', err);
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

    const email = user?.email || 'connect@fluvo.in';
    if (displayAdminEmail) displayAdminEmail.innerText = email;
    if (dropdownUserEmail) dropdownUserEmail.innerText = email;

    if (!dashboardInitialized) {
      dashboardInitialized = true;
      initDashboard();
    } else {
      loadQueries();
    }

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
        showToast('Welcome back. Console authenticated successfully.', 'success');
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
      showAuthError('Unable to connect to authentication service.');
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

  if (adminLoginForm) adminLoginForm.addEventListener('submit', handleLoginSubmit);
  if (btnUnlock) btnUnlock.addEventListener('click', handleLoginSubmit);

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (err) {
      console.error('Logout error:', err);
    }
    showToast('Session locked. Console access closed.', 'info');
    showLogin();
  }

  document.getElementById('btnDropdownLogout')?.addEventListener('click', handleLogout);

  // Initial session verification
  checkSession();

  // ==========================================================================
  // 3. NAVIGATION, TAB SWITCHING & MOBILE DRAWER
  // ==========================================================================
  const sidebar = document.getElementById('sidebar');
  const mobileNavToggle = document.getElementById('mobileNavToggle');
  const sidebarLinks = document.querySelectorAll('.sidebar-link');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const tabTitle = document.getElementById('tabTitle');
  const tabSubtitle = document.getElementById('tabSubtitle');
  const sidebarQueryCount = document.getElementById('sidebarQueryCount');

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

    // Close mobile sidebar if open
    sidebar?.classList.remove('open');
  }

  sidebarLinks.forEach(link => {
    link.addEventListener('click', () => {
      const tab = link.dataset.tab;
      if (tab) switchTab(tab);
    });
  });

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

  if (mobileNavToggle) {
    mobileNavToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar?.classList.toggle('open');
    });
  }

  document.addEventListener('click', (e) => {
    if (sidebar?.classList.contains('open') && !sidebar.contains(e.target) && e.target !== mobileNavToggle) {
      sidebar.classList.remove('open');
    }
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
  // 4. DATA ENGINE & METRICS
  // ==========================================================================
  let queriesData = [];
  let currentFilter = 'all';
  let searchQuery = '';
  let activeDrawerLead = null;

  // Chart instances
  let overviewChartInstance = null;
  let revenueDetailChartInstance = null;
  let growthFunnelChartInstance = null;

  let realtimeSubscribed = false;

  async function initDashboard() {
    initCharts();
    await loadQueries();

    if (!realtimeSubscribed) {
      realtimeSubscribed = true;
      try {
        supabase
          .channel('queries-realtime-admin')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'queries' }, (payload) => {
            console.log('Realtime query change received:', payload);
            loadQueries();
          })
          .subscribe((status) => {
            console.log('Supabase Realtime status:', status);
          });
      } catch (realtimeErr) {
        console.warn('Realtime subscription unavailable:', realtimeErr);
      }
    }
  }

  async function loadQueries() {
    const systemStatusText = document.getElementById('systemStatusText');
    if (systemStatusText) systemStatusText.innerText = 'Syncing...';

    let loaded = false;

    // 1. Try serverless dev/production API
    try {
      const res = await fetch('/api/queries', { credentials: 'same-origin' });
      if (res.status === 401) {
        showLogin();
        return;
      }
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          queriesData = json.data;
          loaded = true;
        }
      }
    } catch (apiErr) {
      console.warn('API /api/queries fetch error, falling back to direct Supabase:', apiErr);
    }

    // 2. Direct Supabase fallback if API yielded no records or failed
    if (!loaded) {
      try {
        const { data, error } = await supabase
          .from('queries')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          queriesData = data.map(row => ({
            id: row.id?.toString(),
            type: row.type || 'schedule',
            fullName: row.full_name || row.fullName || 'Prospective Client',
            workEmail: row.work_email || row.workEmail || '',
            company: row.company || '',
            phone: row.phone || '',
            adSpend: row.ad_spend || row.adSpend || '—',
            preferredDate: row.preferred_date || row.preferredDate || '',
            preferredTime: row.preferred_time || row.preferredTime || '',
            message: row.message || '',
            status: row.status || 'new',
            starred: Boolean(row.starred),
            notes: row.notes || '',
            createdAt: row.created_at || row.createdAt || new Date().toISOString()
          }));
          loaded = true;
        }
      } catch (dbErr) {
        console.error('Supabase direct query fetch error:', dbErr);
      }
    }

    if (systemStatusText) {
      systemStatusText.innerText = loaded ? 'Database Connected' : 'Database Offline';
    }

    renderKPIs();
    renderPipelineBars();
    renderTable();
    renderRecentActivity();
    updateCharts();
  }

  // ==========================================================================
  // 5. DATA-DRIVEN KPI COMPUTATION
  // ==========================================================================
  function renderKPIs() {
    const kpiTotalQueries = document.getElementById('kpiTotalQueries');
    const kpiTotalQueriesSupport = document.getElementById('kpiTotalQueriesSupport');
    const kpiNewToday = document.getElementById('kpiNewToday');
    const kpiNewTodaySupport = document.getElementById('kpiNewTodaySupport');

    const total = queriesData.length;
    if (sidebarQueryCount) sidebarQueryCount.innerText = total.toString();

    if (!queriesData || total === 0) {
      if (kpiTotalQueries) kpiTotalQueries.innerText = '0';
      if (kpiTotalQueriesSupport) kpiTotalQueriesSupport.innerText = 'Across 0 total recorded inquiries';
      if (kpiNewToday) kpiNewToday.innerText = '0';
      if (kpiNewTodaySupport) kpiNewTodaySupport.innerText = 'No new activity today';
      return;
    }

    const activeCount = queriesData.filter(q => q.status !== 'resolved').length;
    if (kpiTotalQueries) kpiTotalQueries.innerText = activeCount < 10 ? `0${activeCount}` : activeCount.toString();
    if (kpiTotalQueriesSupport) {
      kpiTotalQueriesSupport.innerText = `Across ${total} total recorded inquir${total === 1 ? 'y' : 'ies'}`;
    }

    const newCount = queriesData.filter(q => q.status === 'new').length;
    if (kpiNewToday) kpiNewToday.innerText = newCount < 10 ? `0${newCount}` : newCount.toString();
    if (kpiNewTodaySupport) {
      kpiNewTodaySupport.innerText = newCount > 0 
        ? '⚡ Requires executive follow-up' 
        : 'All new inquiries contacted';
    }
  }

  // ==========================================================================
  // 6. REFINED HORIZONTAL PIPELINE DISTRIBUTION
  // ==========================================================================
  function renderPipelineBars() {
    const total = queriesData.length;
    const pipelineCountBadge = document.getElementById('pipelineCountBadge');
    if (pipelineCountBadge) {
      pipelineCountBadge.innerText = `${total} Total Lead${total === 1 ? '' : 's'}`;
    }

    const newCount = queriesData.filter(q => q.status === 'new').length;
    const contactedCount = queriesData.filter(q => q.status === 'contacted').length;
    const inProgressCount = queriesData.filter(q => q.status === 'in-progress').length;
    const resolvedCount = queriesData.filter(q => q.status === 'resolved').length;

    const calcPct = (cnt) => total === 0 ? 0 : Math.round((cnt / total) * 100);

    const barFillNew = document.getElementById('barFillNew');
    const barCountNew = document.getElementById('barCountNew');
    if (barFillNew) barFillNew.style.width = `${calcPct(newCount)}%`;
    if (barCountNew) barCountNew.innerText = `${newCount} leads (${calcPct(newCount)}%)`;

    const barFillContacted = document.getElementById('barFillContacted');
    const barCountContacted = document.getElementById('barCountContacted');
    if (barFillContacted) barFillContacted.style.width = `${calcPct(contactedCount)}%`;
    if (barCountContacted) barCountContacted.innerText = `${contactedCount} leads (${calcPct(contactedCount)}%)`;

    const barFillInProgress = document.getElementById('barFillInProgress');
    const barCountInProgress = document.getElementById('barCountInProgress');
    if (barFillInProgress) barFillInProgress.style.width = `${calcPct(inProgressCount)}%`;
    if (barCountInProgress) barCountInProgress.innerText = `${inProgressCount} leads (${calcPct(inProgressCount)}%)`;

    const barFillResolved = document.getElementById('barFillResolved');
    const barCountResolved = document.getElementById('barCountResolved');
    if (barFillResolved) barFillResolved.style.width = `${calcPct(resolvedCount)}%`;
    if (barCountResolved) barCountResolved.innerText = `${resolvedCount} leads (${calcPct(resolvedCount)}%)`;
  }

  // ==========================================================================
  // 7. RECENT ACTIVITY STREAM
  // ==========================================================================
  function renderRecentActivity() {
    const activityStream = document.getElementById('activityStream');
    if (!activityStream) return;

    if (!queriesData || queriesData.length === 0) {
      activityStream.innerHTML = `
        <div class="empty-state-box">
          <div class="empty-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div class="empty-title">No recent activity</div>
          <p class="empty-desc">Inbound consultations and strategy call requests will stream here automatically.</p>
        </div>
      `;
      return;
    }

    const recent = queriesData.slice(0, 4);
    activityStream.innerHTML = recent.map(q => {
      const timeFormatted = formatTimeAgo(q.createdAt);
      const companyOrClient = q.company ? `${q.fullName} (${q.company})` : (q.fullName || 'Prospective Client');
      const budgetDisplay = (q.adSpend && q.adSpend !== 'N/A') ? q.adSpend : 'Strategy Call Requested';

      return `
        <div class="activity-item-card" onclick="window.openLeadDrawer('${q.id}')">
          <div class="activity-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <div class="activity-content">
            <div class="activity-top-row">
              <span class="activity-client">${escapeHtml(companyOrClient)}</span>
              <span class="activity-time">${timeFormatted}</span>
            </div>
            <p class="activity-details">
              ${escapeHtml(q.workEmail || q.phone)} · <span style="color: var(--amber-light); font-weight: 500;">${escapeHtml(budgetDisplay)}</span>
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
  // 8. QUERIES TABLE RENDERER
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
    queryFilterGroup.querySelectorAll('.status-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        queryFilterGroup.querySelectorAll('.status-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter || 'all';
        renderTable();
      });
    });
  }

  function renderTable() {
    if (!queriesTableBody) return;

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
              <div class="empty-icon">📋</div>
              <strong style="font-size: 15px; color: var(--text-primary);">No inquiries found</strong>
              <p style="font-size: 13px; color: var(--text-muted); max-width: 380px; margin: 0;">
                ${queriesData.length === 0 
                  ? 'Your first enquiry will appear here when a visitor submits a consultation request on the public site.' 
                  : 'No client records match your current filter or search criteria.'}
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
      const budgetDisplay = (row.adSpend && row.adSpend !== 'N/A') ? row.adSpend : 'Growth Diagnostic';

      return `
        <tr class="clickable-row" data-id="${row.id}">
          <td style="text-align: center;" onclick="event.stopPropagation(); window.toggleStar('${row.id}')">
            <button class="star-btn ${isStarred ? 'starred' : ''}" title="${isStarred ? 'Unstar lead' : 'Star lead'}">
              ${isStarred ? '★' : '☆'}
            </button>
          </td>
          <td>
            <div style="font-weight: 600; color: var(--text-primary); font-size: 13.5px;">${escapeHtml(companyOrClient)}</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 1px;">${escapeHtml(clientName)}</div>
          </td>
          <td>
            <div><a href="mailto:${escapeHtml(row.workEmail)}" onclick="event.stopPropagation();" style="color: var(--text-primary); text-decoration: none; font-weight: 500;">${escapeHtml(row.workEmail)}</a></div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(row.phone || 'No phone provided')}</div>
          </td>
          <td>
            <span style="color: var(--amber-light); font-weight: 600; font-size: 13px;">${escapeHtml(budgetDisplay)}</span>
          </td>
          <td>
            <span style="font-family: var(--font-mono); font-size: 11.5px; color: var(--text-muted);">${escapeHtml(dateFormatted)}</span>
          </td>
          <td onclick="event.stopPropagation();">
            <span class="status-pill-badge ${row.status}">
              <select class="status-select-inline" onchange="window.handleStatusChange('${row.id}', this.value)">
                <option value="new" ${row.status === 'new' ? 'selected' : ''}>New</option>
                <option value="contacted" ${row.status === 'contacted' ? 'selected' : ''}>Contacted</option>
                <option value="in-progress" ${row.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
                <option value="resolved" ${row.status === 'resolved' ? 'selected' : ''}>Resolved</option>
              </select>
            </span>
          </td>
          <td style="text-align: right;" onclick="event.stopPropagation();">
            <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px;">
              <button class="btn-action" style="padding: 5px 8px;" title="Inspect Lead" onclick="window.openLeadDrawer('${row.id}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
              <button class="btn-action" style="padding: 5px 8px; color: var(--color-danger);" title="Delete" onclick="window.handleDeleteQuery('${row.id}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

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
      console.warn('API update failed, trying direct Supabase:', e);
    }

    try {
      await supabase.from('queries').update({ starred: nextState }).eq('id', id);
    } catch (dbErr) {
      console.warn('Direct Supabase star update failed:', dbErr);
    }

    showToast(nextState ? 'Lead starred for priority follow-up.' : 'Lead unstarred.', 'info');
  };

  window.handleStatusChange = async function(id, newStatus) {
    const item = queriesData.find(q => q.id === id);
    if (!item) return;
    item.status = newStatus;
    renderKPIs();
    renderPipelineBars();
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
      console.warn('API status update failed, trying direct Supabase:', e);
    }

    try {
      await supabase.from('queries').update({ status: newStatus }).eq('id', id);
    } catch (dbErr) {
      console.warn('Direct Supabase status update failed:', dbErr);
    }

    showToast(`Status updated to ${newStatus.toUpperCase()}.`, 'success');
  };

  window.handleDeleteQuery = async function(id) {
    if (!confirm('Are you sure you want to delete this client inquiry permanently?')) return;
    queriesData = queriesData.filter(q => q.id !== id);
    renderKPIs();
    renderPipelineBars();
    renderTable();
    renderRecentActivity();
    updateCharts();

    try {
      await fetch(`/api/queries/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin'
      });
    } catch (e) {
      console.warn('API delete failed, trying direct Supabase:', e);
    }

    try {
      await supabase.from('queries').delete().eq('id', id);
    } catch (dbErr) {
      console.warn('Direct Supabase delete failed:', dbErr);
    }

    showToast('Inquiry deleted successfully.', 'info');
  };

  // ==========================================================================
  // 9. LEAD DETAIL SLIDE-OVER DRAWER
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

  const drawerActionMailto = document.getElementById('drawerActionMailto');
  const drawerActionCopyEmail = document.getElementById('drawerActionCopyEmail');
  const drawerActionCopyPhone = document.getElementById('drawerActionCopyPhone');

  window.openLeadDrawer = function(id) {
    const lead = queriesData.find(q => q.id === id);
    if (!lead) return;
    activeDrawerLead = lead;

    if (drawerLeadName) drawerLeadName.innerText = lead.fullName || 'Prospective Client';
    if (drawerLeadCompany) drawerLeadCompany.innerText = lead.company || 'Enterprise Executive';
    
    if (drawerContactInfo) {
      drawerContactInfo.innerHTML = `
        <div style="margin-bottom: 4px;">📧 <a href="mailto:${escapeHtml(lead.workEmail)}" style="color: var(--amber-light); text-decoration: none; font-weight: 500;">${escapeHtml(lead.workEmail || 'No email provided')}</a></div>
        <div style="color: var(--text-secondary);">📞 ${escapeHtml(lead.phone || 'No phone number provided')}</div>
      `;
    }

    if (drawerActionMailto) {
      drawerActionMailto.href = lead.workEmail ? `mailto:${encodeURIComponent(lead.workEmail)}?subject=Fluvo%20Growth%20Diagnostic` : '#';
    }

    if (drawerBudget) drawerBudget.innerText = (lead.adSpend && lead.adSpend !== 'N/A') ? lead.adSpend : 'Strategy Call Requested';
    if (drawerDate) drawerDate.innerText = `${lead.preferredDate || 'Flexible Schedule'} ${lead.preferredTime ? '· ' + lead.preferredTime : ''}`;
    if (drawerMessage) drawerMessage.innerText = lead.message || 'No specific growth objectives entered.';
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

  drawerActionCopyEmail?.addEventListener('click', () => {
    if (activeDrawerLead?.workEmail) {
      navigator.clipboard.writeText(activeDrawerLead.workEmail);
      showToast('Client email copied to clipboard.', 'success');
    }
  });

  drawerActionCopyPhone?.addEventListener('click', () => {
    if (activeDrawerLead?.phone) {
      navigator.clipboard.writeText(activeDrawerLead.phone);
      showToast('Client phone number copied to clipboard.', 'success');
    }
  });

  btnDrawerSave?.addEventListener('click', async () => {
    if (!activeDrawerLead) return;
    const newStatus = drawerStatusSelect?.value || activeDrawerLead.status;
    const newNotes = drawerNotesText?.value.trim() || '';

    activeDrawerLead.status = newStatus;
    activeDrawerLead.notes = newNotes;

    renderKPIs();
    renderPipelineBars();
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
      console.warn('API update failed, trying direct Supabase:', e);
    }

    try {
      await supabase.from('queries').update({ status: newStatus, notes: newNotes }).eq('id', activeDrawerLead.id);
    } catch (dbErr) {
      console.warn('Direct Supabase lead update failed:', dbErr);
    }

    showToast('Lead details and notes saved.', 'success');
  });

  btnDrawerDelete?.addEventListener('click', () => {
    if (!activeDrawerLead) return;
    const id = activeDrawerLead.id;
    closeDrawer();
    window.handleDeleteQuery(id);
  });

  // ==========================================================================
  // 10. EDITORIAL CHARTS ENGINE (Fluvo Visual Language)
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
              borderColor: '#C4622D',
              backgroundColor: 'rgba(196, 98, 45, 0.08)',
              fill: true,
              tension: 0.38,
              borderWidth: 2.5,
              pointBackgroundColor: '#C4622D',
              pointBorderColor: '#171717',
              pointBorderWidth: 2,
              pointRadius: 4,
              pointHoverRadius: 6
            },
            {
              label: 'Ad Capital Deployed ($)',
              data: [0, 0, 0, 0, 0, 0],
              borderColor: '#8A8A8A',
              borderDash: [5, 5],
              tension: 0.38,
              borderWidth: 1.5,
              pointRadius: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              position: 'top',
              align: 'end',
              labels: { color: '#9E9B95', font: { family: 'DM Sans', size: 11.5 }, boxWidth: 12, padding: 16 }
            },
            tooltip: {
              backgroundColor: '#1C1C1C',
              titleColor: '#F5F2EC',
              bodyColor: '#9E9B95',
              borderColor: 'rgba(196, 98, 45, 0.35)',
              borderWidth: 1,
              padding: 12,
              cornerRadius: 6,
              bodyFont: { family: 'DM Sans', size: 12 },
              titleFont: { family: 'DM Serif Display', size: 14 }
            }
          },
          scales: {
            x: {
              grid: { color: 'rgba(255, 255, 255, 0.04)' },
              ticks: { color: '#66635E', font: { family: 'DM Sans', size: 11 } }
            },
            y: {
              grid: { color: 'rgba(255, 255, 255, 0.04)' },
              ticks: {
                color: '#66635E',
                font: { family: 'JetBrains Mono', size: 10.5 },
                callback: v => `$${v >= 1000 ? (v / 1000) + 'k' : v}`
              }
            }
          }
        }
      });
    }

    // 2. Revenue Deep Dive Chart
    const revCanvas = document.getElementById('revenueDetailChart');
    if (revCanvas) {
      revenueDetailChartInstance = new Chart(revCanvas, {
        type: 'bar',
        data: {
          labels: ['Sprint 1', 'Sprint 2', 'Sprint 3', 'Sprint 4', 'Sprint 5', 'Sprint 6'],
          datasets: [
            {
              label: 'Gross Client Revenue ($)',
              data: [0, 0, 0, 0, 0, 0],
              backgroundColor: '#C4622D',
              borderRadius: 4
            },
            {
              label: 'Ad Spend Capital ($)',
              data: [0, 0, 0, 0, 0, 0],
              backgroundColor: 'rgba(255, 255, 255, 0.12)',
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#9E9B95', font: { family: 'DM Sans', size: 11.5 } } }
          },
          scales: {
            x: { grid: { color: 'rgba(255, 255, 255, 0.04)' }, ticks: { color: '#66635E' } },
            y: {
              grid: { color: 'rgba(255, 255, 255, 0.04)' },
              ticks: { color: '#66635E', callback: v => `$${v >= 1000 ? (v / 1000) + 'k' : v}` }
            }
          }
        }
      });
    }

    // 3. Growth Funnel Chart
    const growthCanvas = document.getElementById('growthFunnelChart');
    if (growthCanvas) {
      growthFunnelChartInstance = new Chart(growthCanvas, {
        type: 'line',
        data: {
          labels: ['Brand Discovery', 'Landing Engagement', 'Consultation Form', 'Executive Review', 'Sprint Agreement'],
          datasets: [{
            label: 'Conversion Velocity',
            data: [0, 0, 0, 0, 0],
            borderColor: '#4A7C59',
            backgroundColor: 'rgba(74, 124, 89, 0.08)',
            fill: true,
            tension: 0.35,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            x: { grid: { color: 'rgba(255, 255, 255, 0.04)' }, ticks: { color: '#66635E' } },
            y: {
              grid: { color: 'rgba(255, 255, 255, 0.04)' },
              ticks: { color: '#66635E', callback: v => `${v}%` }
            }
          }
        }
      });
    }
  }

  function updateCharts() {
    // If overview chart exists, refresh layout
    overviewChartInstance?.update();
  }

  // ==========================================================================
  // 11. EXPORTS: CSV & EXECUTIVE PDF DOSSIER
  // ==========================================================================
  function exportCSV() {
    if (!queriesData || queriesData.length === 0) {
      showToast('No queries recorded to export.', 'info');
      return;
    }
    showToast('Generating queries CSV download...', 'info');
    window.location.href = '/api/export/csv';
  }

  function exportPDF() {
    if (!queriesData || queriesData.length === 0) {
      showToast('No data available to compile report.', 'info');
      return;
    }

    showToast('Compiling executive leadership report...', 'info');
    const doc = new jsPDF();

    // Document Header Banner
    doc.setFillColor(11, 11, 11);
    doc.rect(0, 0, 210, 38, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.setTextColor(245, 242, 236);
    doc.text('FLUVO — EXECUTIVE PERFORMANCE REPORT', 14, 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(158, 155, 149);
    doc.text(`Generated on ${new Date().toLocaleString()} · Private Executive Command Console`, 14, 28);

    // KPI Summary
    doc.setFontSize(10.5);
    doc.setTextColor(196, 98, 45);
    const activeCnt = queriesData.filter(q => q.status !== 'resolved').length;
    const resolvedCnt = queriesData.filter(q => q.status === 'resolved').length;
    doc.text(`Total Recorded Inquiries: ${queriesData.length}   |   Active Pipeline: ${activeCnt}   |   Resolved: ${resolvedCnt}`, 14, 48);

    const tableBody = queriesData.map(q => [
      q.fullName || 'Prospective Client',
      q.company || '—',
      q.workEmail || '—',
      q.adSpend || '—',
      (q.status || 'NEW').toUpperCase(),
      q.createdAt ? q.createdAt.slice(0, 10) : '—'
    ]);

    autoTable(doc, {
      startY: 54,
      head: [['Client Contact', 'Company', 'Email Address', 'Budget / Spend', 'Status', 'Date']],
      body: tableBody.length > 0 ? tableBody : [['No client records found', '—', '—', '—', '—', '—']],
      theme: 'grid',
      headStyles: { fillColor: [23, 23, 23], textColor: [245, 242, 236], fontStyle: 'bold' },
      styles: { fontSize: 8.5, cellPadding: 4.5, textColor: [40, 40, 40] }
    });

    doc.save(`Fluvo_Executive_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
    showToast('Executive PDF generated and downloaded.', 'success');
  }

  document.getElementById('btnExportCSV')?.addEventListener('click', exportCSV);
  document.getElementById('qaExportCsv')?.addEventListener('click', exportCSV);
  document.getElementById('btnExportPDF')?.addEventListener('click', exportPDF);
  document.getElementById('qaExportPdf')?.addEventListener('click', exportPDF);
});
