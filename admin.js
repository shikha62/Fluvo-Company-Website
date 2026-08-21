import Chart from 'chart.js/auto';
import Papa from 'papaparse';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

document.addEventListener('DOMContentLoaded', () => {

  // ==========================================================================
  // 1. PIN AUTHENTICATION GATE
  // ==========================================================================
  let MASTER_PIN = localStorage.getItem('fluvo_owner_pin') || '1234';
  const authOverlay = document.getElementById('authOverlay');
  const dashboardLayout = document.getElementById('dashboardLayout');
  const pinInputs = [
    document.getElementById('p1'),
    document.getElementById('p2'),
    document.getElementById('p3'),
    document.getElementById('p4')
  ];
  const btnUnlock = document.getElementById('btnUnlock');

  // Handle digit auto-advance
  pinInputs.forEach((input, idx) => {
    input?.addEventListener('input', (e) => {
      if (e.target.value.length === 1 && idx < 3) {
        pinInputs[idx + 1].focus();
      }
    });

    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && idx > 0) {
        pinInputs[idx - 1].focus();
      }
      if (e.key === 'Enter') {
        attemptAuth();
      }
    });
  });

  function attemptAuth() {
    const entered = pinInputs.map(i => i.value).join('');
    if (entered === MASTER_PIN) {
      authOverlay.style.display = 'none';
      dashboardLayout.style.display = 'flex';
      initDashboard();
    } else {
      pinInputs.forEach(i => {
        i.style.borderColor = '#EF4444';
        i.value = '';
      });
      pinInputs[0].focus();
      setTimeout(() => {
        pinInputs.forEach(i => i.style.borderColor = '');
      }, 1000);
    }
  }

  btnUnlock?.addEventListener('click', attemptAuth);

  // Settings PIN update
  document.getElementById('btnUpdatePin')?.addEventListener('click', () => {
    const newPin = document.getElementById('newPinInput')?.value.trim();
    if (newPin && newPin.length === 4) {
      MASTER_PIN = newPin;
      localStorage.setItem('fluvo_owner_pin', newPin);
      alert('Master PIN updated successfully!');
      document.getElementById('newPinInput').value = '';
    } else {
      alert('Please enter a valid 4-digit PIN.');
    }
  });

  // ==========================================================================
  // 2. TAB SWITCHING
  // ==========================================================================
  const sidebarLinks = document.querySelectorAll('.sidebar-link');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const tabTitle = document.getElementById('tabTitle');

  const tabTitles = {
    overview: 'Executive Overview',
    queries: 'Queries & Strategy Leads',
    revenue: 'Revenue & Profit Analytics',
    growth: 'Growth & Attribution Funnels',
    settings: 'Security & Settings'
  };

  sidebarLinks.forEach(link => {
    link.addEventListener('click', () => {
      const tab = link.dataset.tab;
      sidebarLinks.forEach(l => l.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      link.classList.add('active');
      document.getElementById(`tab-${tab}`)?.classList.add('active');
      if (tabTitle) tabTitle.innerText = tabTitles[tab] || 'Dashboard';
    });
  });

  // ==========================================================================
  // 3. DASHBOARD INITIALIZATION & DATA FETCHING
  // ==========================================================================
  let queriesData = [];
  let currentFilter = 'all';
  let searchQuery = '';

  async function initDashboard() {
    await fetchQueries();
    await fetchStats();
    initCharts();
  }

  async function fetchQueries() {
    try {
      const res = await fetch('http://localhost:3001/api/queries');
      const json = await res.json();
      if (json.success) {
        queriesData = json.data;
        renderQueriesTable();
      }
    } catch (e) {
      console.warn('Backend offline, using fallback queries', e);
      queriesData = [
        {
          id: 'qry_1',
          fullName: 'Eleanor Vance',
          workEmail: 'eleanor@luminahealth.io',
          company: 'Lumina Health',
          phone: '+1 (555) 234-8901',
          adSpend: '$150k–$500k/mo',
          preferredDate: '2026-08-22',
          message: 'Looking to reduce CAC across Meta & Google Ads.',
          status: 'new',
          starred: true,
          notes: 'High priority lead. Morning calls preferred.'
        },
        {
          id: 'qry_2',
          fullName: 'Marcus Sterling',
          workEmail: 'm.sterling@apexapparel.co',
          company: 'Apex Apparel',
          phone: '+1 (555) 876-5432',
          adSpend: '$50k–$150k/mo',
          preferredDate: '2026-08-25',
          message: 'Want to test high-volume UGC video ads.',
          status: 'contacted',
          starred: false,
          notes: 'Sent portfolio PDF.'
        },
        {
          id: 'qry_3',
          fullName: 'David Thorne',
          workEmail: 'dthorne@fintechflow.com',
          company: 'FinTech Flow',
          phone: '+1 (555) 345-6789',
          adSpend: '$500k+/mo',
          preferredDate: '2026-08-21',
          message: 'Need help resolving iOS 14.5+ signal loss and setting up CAPI.',
          status: 'in-progress',
          starred: true,
          notes: 'Call scheduled Thursday.'
        }
      ];
      renderQueriesTable();
    }
  }

  async function fetchStats() {
    try {
      const res = await fetch('http://localhost:3001/api/queries/stats');
      const json = await res.json();
      if (json.success) {
        document.getElementById('kpiTotalQueries').innerText = json.data.total;
        document.getElementById('kpiNewToday').innerText = json.data.newToday;
      }
    } catch (e) {
      document.getElementById('kpiTotalQueries').innerText = queriesData.length;
      document.getElementById('kpiNewToday').innerText = '2';
    }
  }

  // ==========================================================================
  // 4. RENDER QUERIES TABLE WITH SEARCH & FILTER
  // ==========================================================================
  function renderQueriesTable() {
    const tbody = document.getElementById('queriesTableBody');
    if (!tbody) return;

    let filtered = queriesData;

    if (currentFilter !== 'all') {
      filtered = filtered.filter(q => q.status === currentFilter);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.fullName?.toLowerCase().includes(q) ||
        item.workEmail?.toLowerCase().includes(q) ||
        item.company?.toLowerCase().includes(q)
      );
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 32px;">No matching records found.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(item => `
      <tr>
        <td>
          <button class="star-btn ${item.starred ? 'starred' : ''}" data-id="${item.id}">
            ${item.starred ? '★' : '☆'}
          </button>
        </td>
        <td>
          <strong>${item.fullName || 'Anonymous'}</strong><br>
          <span style="font-size: 12px; color: var(--text-muted);">${item.workEmail || ''}</span>
        </td>
        <td>${item.company || '—'}</td>
        <td><span style="color: var(--amber); font-weight: 500;">${item.adSpend || '—'}</span></td>
        <td>${item.preferredDate || 'Flexible'}</td>
        <td>
          <select class="status-badge badge-${item.status}" data-id="${item.id}" style="border: none; cursor: pointer; outline: none;">
            <option value="new" ${item.status === 'new' ? 'selected' : ''}>New</option>
            <option value="contacted" ${item.status === 'contacted' ? 'selected' : ''}>Contacted</option>
            <option value="in-progress" ${item.status === 'in-progress' ? 'selected' : ''}>In-Progress</option>
            <option value="resolved" ${item.status === 'resolved' ? 'selected' : ''}>Resolved</option>
          </select>
        </td>
        <td style="text-align: right;">
          <div class="row-actions" style="justify-content: flex-end;">
            <button class="action-icon-btn btn-view-notes" data-id="${item.id}" title="View Details & Notes">📝</button>
            <button class="action-icon-btn btn-delete-lead" data-id="${item.id}" title="Delete Lead" style="color: #EF4444;">✕</button>
          </div>
        </td>
      </tr>
    `).join('');

    attachTableEvents();
  }

  function attachTableEvents() {
    // Star toggle
    document.querySelectorAll('.star-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const target = queriesData.find(q => q.id === id);
        if (target) {
          target.starred = !target.starred;
          try {
            await fetch(`http://localhost:3001/api/queries/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ starred: target.starred })
            });
          } catch (e) { }
          renderQueriesTable();
        }
      });
    });

    // Status change
    document.querySelectorAll('select.status-badge').forEach(select => {
      select.addEventListener('change', async (e) => {
        const id = select.dataset.id;
        const newStatus = e.target.value;
        const target = queriesData.find(q => q.id === id);
        if (target) {
          target.status = newStatus;
          try {
            await fetch(`http://localhost:3001/api/queries/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: newStatus })
            });
          } catch (e) { }
          renderQueriesTable();
        }
      });
    });

    // Notes modal
    document.querySelectorAll('.btn-view-notes').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const item = queriesData.find(q => q.id === id);
        if (item) openNotesModal(item);
      });
    });

    // Delete lead
    document.querySelectorAll('.btn-delete-lead').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (confirm('Are you sure you want to delete this query record?')) {
          queriesData = queriesData.filter(q => q.id !== id);
          try {
            await fetch(`http://localhost:3001/api/queries/${id}`, { method: 'DELETE' });
          } catch (e) { }
          renderQueriesTable();
        }
      });
    });
  }

  // Filter group buttons
  document.querySelectorAll('#queryFilterGroup .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#queryFilterGroup .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderQueriesTable();
    });
  });

  // Search input
  document.getElementById('querySearchInput')?.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderQueriesTable();
  });

  // Notes Modal Logic
  let activeNotesId = null;
  const notesModal = document.getElementById('notesModal');
  function openNotesModal(item) {
    activeNotesId = item.id;
    document.getElementById('modalLeadName').innerText = `${item.fullName} (${item.company || 'Independent'})`;
    document.getElementById('modalLeadMessage').innerText = item.message || 'No initial message provided.';
    document.getElementById('modalNotesText').value = item.notes || '';
    notesModal?.classList.add('open');
  }

  document.getElementById('btnCloseNotes')?.addEventListener('click', () => {
    notesModal?.classList.remove('open');
  });

  document.getElementById('btnSaveNotes')?.addEventListener('click', async () => {
    const notes = document.getElementById('modalNotesText')?.value;
    const item = queriesData.find(q => q.id === activeNotesId);
    if (item) {
      item.notes = notes;
      try {
        await fetch(`http://localhost:3001/api/queries/${activeNotesId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes })
        });
      } catch (e) { }
      notesModal?.classList.remove('open');
      renderQueriesTable();
    }
  });

  // ==========================================================================
  // 5. EXPORTS (CSV & PDF)
  // ==========================================================================
  // Export CSV via PapaParse
  document.getElementById('btnExportCSV')?.addEventListener('click', () => {
    const csvData = queriesData.map(q => ({
      ID: q.id,
      FullName: q.fullName,
      WorkEmail: q.workEmail,
      Company: q.company,
      Phone: q.phone,
      AdSpend: q.adSpend,
      PreferredDate: q.preferredDate,
      Status: q.status,
      Notes: q.notes,
      CreatedAt: q.createdAt
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `Fluvo_In_Enterprise_Leads_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // Export Executive PDF via jsPDF & autoTable
  document.getElementById('btnExportPDF')?.addEventListener('click', () => {
    const doc = new jsPDF();

    // Title & Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(18, 18, 18);
    doc.text('Fluvo.in — Executive Growth & Leads Report', 14, 22);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${new Date().toLocaleDateString()} | Confidential Executive Document`, 14, 28);

    // KPI Summary Box
    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(245, 242, 236);
    doc.roundedRect(14, 34, 182, 24, 3, 3, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(196, 98, 45);
    doc.text(`Total Queries: ${queriesData.length}`, 20, 48);
    doc.text(`Avg Blended ROAS: 4.92x`, 80, 48);
    doc.text(`Tracked Pipeline: $2.45M`, 140, 48);

    // Table
    const tableRows = queriesData.map(q => [
      q.fullName || '—',
      q.workEmail || '—',
      q.company || '—',
      q.adSpend || '—',
      q.preferredDate || 'Flexible',
      q.status.toUpperCase()
    ]);

    autoTable(doc, {
      startY: 66,
      head: [['Client Name', 'Work Email', 'Company', 'Ad Spend', 'Target Date', 'Status']],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [26, 26, 26], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 248, 245] },
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 4 }
    });

    doc.save(`Fluvo_In_Executive_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
  });

  // ==========================================================================
  // 6. DASHBOARD CHARTS (CHART.JS)
  // ==========================================================================
  function initCharts() {
    // 1. Overview Bar Chart
    const ovCanvas = document.getElementById('overviewChart');
    if (ovCanvas) {
      new Chart(ovCanvas, {
        type: 'bar',
        data: {
          labels: ['Q1', 'Q2', 'Q3', 'Q4 (Proj)'],
          datasets: [
            {
              label: 'Attributed Client Revenue ($M)',
              data: [28.4, 34.2, 42.8, 55.0],
              backgroundColor: '#C4622D',
              borderRadius: 6
            },
            {
              label: 'Managed Ad Spend ($M)',
              data: [6.2, 7.5, 8.9, 11.2],
              backgroundColor: 'rgba(255,255,255,0.15)',
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#9A9A9A', font: { family: 'DM Sans', size: 11 } } }
          },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#9A9A9A' } },
            y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#9A9A9A', callback: v => `$${v}M` } }
          }
        }
      });
    }

    // 2. Query Status Pie Chart
    const pieCanvas = document.getElementById('statusPieChart');
    if (pieCanvas) {
      new Chart(pieCanvas, {
        type: 'doughnut',
        data: {
          labels: ['New', 'Contacted', 'In-Progress', 'Resolved'],
          datasets: [{
            data: [3, 4, 5, 8],
            backgroundColor: ['#EF4444', '#F59E0B', '#3B82F6', '#10B981'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: '#9A9A9A', font: { family: 'DM Sans', size: 11 } } }
          },
          cutout: '70%'
        }
      });
    }

    // 3. Revenue Breakdown Chart
    const revCanvas = document.getElementById('revenueBreakdownChart');
    if (revCanvas) {
      new Chart(revCanvas, {
        type: 'line',
        data: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
          datasets: [
            {
              label: 'Gross Agency Revenue ($)',
              data: [140000, 165000, 195000, 220000, 260000, 295000, 340000, 390000],
              borderColor: '#C4622D',
              backgroundColor: 'rgba(196,98,45,0.15)',
              fill: true,
              tension: 0.35
            },
            {
              label: 'Net Profit Margin ($)',
              data: [85000, 102000, 120000, 138000, 162000, 185000, 215000, 248000],
              borderColor: '#4A7C59',
              tension: 0.35
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#9A9A9A', font: { family: 'DM Sans', size: 11 } } }
          },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#9A9A9A' } },
            y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#9A9A9A', callback: v => `$${v / 1000}k` } }
          }
        }
      });
    }

    // 4. Growth Funnel Chart
    const funCanvas = document.getElementById('funnelChart');
    if (funCanvas) {
      new Chart(funCanvas, {
        type: 'bar',
        data: {
          labels: ['Website Visitors', 'Audit Requests', 'Strategy Calls', 'Active Sprint Clients'],
          datasets: [{
            label: 'Conversion Funnel (Monthly)',
            data: [42000, 380, 120, 18],
            backgroundColor: ['#C4622D', '#D97B47', '#4A7C59', '#10B981'],
            borderRadius: 6
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#9A9A9A' } },
            y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#9A9A9A' } }
          }
        }
      });
    }

    // 5. Inbound Channels Doughnut Chart
    const chanCanvas = document.getElementById('channelsChart');
    if (chanCanvas) {
      new Chart(chanCanvas, {
        type: 'doughnut',
        data: {
          labels: ['Executive Referrals', 'Organic Search / SEO', 'LinkedIn Direct', 'Podcast / PR'],
          datasets: [{
            data: [45, 25, 20, 10],
            backgroundColor: ['#C4622D', '#4A7C59', '#3B82F6', '#8B5CF6'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: '#9A9A9A', font: { family: 'DM Sans', size: 11 } } }
          }
        }
      });
    }
  }

});
