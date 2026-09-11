import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// ── Storage paths ─────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const QUERIES_FILE = path.join(DATA_DIR, 'queries.json');

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Storage helpers ────────────────────────────────────────────────────────────
function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(QUERIES_FILE)) {
    const seed = [
      {
        id: 'qry_' + Date.now() + '_1',
        type: 'schedule',
        fullName: 'Eleanor Vance',
        workEmail: 'eleanor@luminahealth.io',
        company: 'Lumina Health',
        phone: '+1 (555) 234-8901',
        adSpend: '$150k–$500k/mo',
        preferredDate: '2026-08-22',
        preferredTime: '10:00 AM',
        message: 'Looking to reduce CAC across Meta & Google Ads. Currently at ~$220k/mo with declining ROAS over Q2.',
        status: 'new',
        starred: true,
        notes: 'High priority enterprise lead. Prefers morning calls.',
        createdAt: new Date(Date.now() - 1000 * 60 * 35).toISOString()
      },
      {
        id: 'qry_' + Date.now() + '_2',
        type: 'contact',
        fullName: 'Marcus Sterling',
        workEmail: 'm.sterling@apexapparel.co',
        company: 'Apex Apparel',
        phone: '+1 (555) 876-5432',
        adSpend: '$50k–$150k/mo',
        preferredDate: '2026-08-25',
        preferredTime: '2:00 PM',
        message: 'Want to test high-volume UGC video ads for our fall footwear launch.',
        status: 'contacted',
        starred: false,
        notes: 'Sent UGC portfolio PDF.',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString()
      },
      {
        id: 'qry_' + Date.now() + '_3',
        type: 'schedule',
        fullName: 'David Thorne',
        workEmail: 'dthorne@fintechflow.com',
        company: 'FinTech Flow',
        phone: '+1 (555) 345-6789',
        adSpend: '$500k+/mo',
        preferredDate: '2026-08-21',
        preferredTime: '3:00 PM',
        message: 'Need help resolving iOS 14.5+ signal loss and setting up CAPI attribution.',
        status: 'in-progress',
        starred: true,
        notes: 'Technical discovery call scheduled Thursday 2 PM EST.',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()
      },
      {
        id: 'qry_' + Date.now() + '_4',
        type: 'schedule',
        fullName: 'Sophie Nakamura',
        workEmail: 'sophie@bloombeauty.io',
        company: 'Bloom Beauty',
        phone: '+1 (555) 901-2345',
        adSpend: '$30k–$50k/mo',
        preferredDate: '2026-08-28',
        preferredTime: '11:00 AM',
        message: 'Launching DTC skincare line, need full-funnel paid social strategy.',
        status: 'new',
        starred: false,
        notes: '',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString()
      },
      {
        id: 'qry_' + Date.now() + '_5',
        type: 'contact',
        fullName: 'James Okafor',
        workEmail: 'james@scalepulse.com',
        company: 'ScalePulse',
        phone: '+1 (555) 567-8901',
        adSpend: '$150k–$500k/mo',
        preferredDate: '',
        preferredTime: '',
        message: 'Interested in attribution stack + creative studio retainer.',
        status: 'resolved',
        starred: false,
        notes: 'Onboarded as client. Growth sprint started.',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString()
      }
    ];
    fs.writeFileSync(QUERIES_FILE, JSON.stringify(seed, null, 2));
  }
}

function readQueries() {
  ensureStorage();
  return JSON.parse(fs.readFileSync(QUERIES_FILE, 'utf8'));
}

function writeQueries(data) {
  fs.writeFileSync(QUERIES_FILE, JSON.stringify(data, null, 2));
}

// ── Health ─────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ── Queries: list with search / filter / sort ──────────────────────────────────
app.get('/api/queries', (req, res) => {
  try {
    let queries = readQueries();
    const { search, status, type, sort = 'createdAt', order = 'desc' } = req.query;

    if (search) {
      const q = search.toLowerCase();
      queries = queries.filter(r =>
        r.fullName.toLowerCase().includes(q) ||
        r.workEmail.toLowerCase().includes(q) ||
        r.company?.toLowerCase().includes(q) ||
        r.message?.toLowerCase().includes(q)
      );
    }
    if (status && status !== 'all') queries = queries.filter(r => r.status === status);
    if (type && type !== 'all') queries = queries.filter(r => r.type === type);

    queries.sort((a, b) => {
      const aVal = a[sort] ?? '';
      const bVal = b[sort] ?? '';
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return order === 'desc' ? -cmp : cmp;
    });

    res.json({ success: true, data: queries, total: queries.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Queries: stats aggregate ───────────────────────────────────────────────────
app.get('/api/queries/stats', (_req, res) => {
  try {
    const queries = readQueries();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const stats = {
      total: queries.length,
      newToday: queries.filter(q => new Date(q.createdAt) >= todayStart).length,
      byStatus: {
        new: queries.filter(q => q.status === 'new').length,
        contacted: queries.filter(q => q.status === 'contacted').length,
        inProgress: queries.filter(q => q.status === 'in-progress').length,
        resolved: queries.filter(q => q.status === 'resolved').length,
      },
      starred: queries.filter(q => q.starred).length,
    };

    res.json({ success: true, data: stats });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Queries: create ────────────────────────────────────────────────────────────
app.post('/api/queries', (req, res) => {
  try {
    const { fullName, workEmail, company, phone, adSpend, preferredDate, preferredTime, message, type = 'schedule' } = req.body;

    if (!fullName || !workEmail) {
      return res.status(400).json({ success: false, error: 'Name and email are required.' });
    }

    const queries = readQueries();
    const entry = {
      id: 'qry_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      type,
      fullName: fullName.trim(),
      workEmail: workEmail.trim().toLowerCase(),
      company: (company || '').trim(),
      phone: (phone || '').trim(),
      adSpend: (adSpend || '').trim(),
      preferredDate: (preferredDate || '').trim(),
      preferredTime: (preferredTime || '').trim(),
      message: (message || '').trim(),
      status: 'new',
      starred: false,
      notes: '',
      createdAt: new Date().toISOString()
    };

    queries.unshift(entry);
    writeQueries(queries);

    res.status(201).json({ success: true, data: entry });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Queries: update ────────────────────────────────────────────────────────────
app.patch('/api/queries/:id', (req, res) => {
  try {
    const queries = readQueries();
    const idx = queries.findIndex(q => q.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Not found.' });

    const allowed = ['status', 'starred', 'notes'];
    allowed.forEach(k => { if (req.body[k] !== undefined) queries[idx][k] = req.body[k]; });
    queries[idx].updatedAt = new Date().toISOString();
    writeQueries(queries);

    res.json({ success: true, data: queries[idx] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Queries: delete ────────────────────────────────────────────────────────────
app.delete('/api/queries/:id', (req, res) => {
  try {
    let queries = readQueries();
    const before = queries.length;
    queries = queries.filter(q => q.id !== req.params.id);
    if (queries.length === before) return res.status(404).json({ success: false, error: 'Not found.' });
    writeQueries(queries);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Serve frontend (production) ────────────────────────────────────────────────
const DIST_DIR = path.join(__dirname, 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  // Serve admin.html for /admin route
  app.get('/admin', (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'admin.html'));
  });
  // Fallback: serve index.html for all other non-API routes
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

// ── Start ──────────────────────────────────────────────────────────────────────
ensureStorage();
app.listen(PORT, () => {
  console.log(`✅  Fluvo API server running at http://localhost:${PORT}`);
});
