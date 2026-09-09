import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://tafwdnswcrjfaxhbdnlb.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_P8A-ht36tSNNi82E4W7mug_qszJUxl1';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const LOCAL_STORAGE_KEY = 'fluvo_inquiries';

function getLocalQueries() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalQueries(list) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {}
}

/**
 * Inserts a new inquiry or scheduled call into Supabase & Local Cache
 */
export async function submitInquiry(data) {
  const localId = 'qry_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const row = {
    type: data.type || 'schedule',
    full_name: data.fullName || data.full_name || '',
    work_email: data.workEmail || data.work_email || '',
    company: data.company || '',
    phone: data.phone || '',
    ad_spend: data.adSpend || data.ad_spend || 'N/A',
    preferred_date: data.preferredDate || data.preferred_date || '',
    preferred_time: data.preferredTime || data.preferred_time || '',
    message: data.message || '',
    status: data.status || 'new',
    starred: Boolean(data.starred),
    notes: data.notes || ''
  };

  // 1. Instantly save to local storage
  const localEntry = {
    id: localId,
    type: row.type,
    fullName: row.full_name,
    workEmail: row.work_email,
    company: row.company,
    phone: row.phone,
    adSpend: row.ad_spend,
    preferredDate: row.preferred_date,
    preferredTime: row.preferred_time,
    message: row.message,
    status: row.status,
    starred: row.starred,
    notes: row.notes,
    createdAt: new Date().toISOString()
  };

  const localList = getLocalQueries();
  localList.unshift(localEntry);
  saveLocalQueries(localList);

  // 2. Insert into Supabase
  try {
    const { data: result, error } = await supabase
      .from('queries')
      .insert([row])
      .select();

    if (error) {
      console.warn('Supabase insert warning:', error);
    } else if (result && result[0]) {
      // Update local item with real Supabase ID
      localEntry.id = result[0].id.toString();
      localEntry.createdAt = result[0].created_at || localEntry.createdAt;
      saveLocalQueries(localList);
      return result;
    }
  } catch (dbErr) {
    console.warn('Supabase network error (saved locally):', dbErr);
  }

  return [localEntry];
}

/**
 * Fetches all inquiries/scheduled calls from Supabase with Local Cache synchronization
 */
export async function fetchAllQueries() {
  let remoteList = [];
  let fetchError = null;

  try {
    const { data, error } = await supabase
      .from('queries')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      fetchError = error;
      console.warn('Supabase fetch query notice:', error);
    } else if (data) {
      remoteList = data.map(row => ({
        id: row.id.toString(),
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
    }
  } catch (err) {
    fetchError = err;
    console.warn('Supabase offline or unreachable:', err);
  }

  const localList = getLocalQueries();

  // Merge and deduplicate by ID and email
  const mergedMap = new Map();

  // Add remote records first
  remoteList.forEach(item => {
    mergedMap.set(item.id, item);
  });

  // Add any local items not yet in remote
  localList.forEach(item => {
    if (!mergedMap.has(item.id)) {
      // Check if email and approximate timestamp already exist
      const exists = remoteList.some(r => r.workEmail === item.workEmail && r.message === item.message);
      if (!exists) {
        mergedMap.set(item.id, item);
      }
    }
  });

  const finalQueries = Array.from(mergedMap.values()).sort((a, b) => {
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  // Update local storage with full merged state
  saveLocalQueries(finalQueries);

  return finalQueries;
}

/**
 * Updates a query row in Supabase and Local Cache
 */
export async function updateQueryRecord(id, updates) {
  // 1. Update local cache
  const localList = getLocalQueries();
  const idx = localList.findIndex(q => q.id === id);
  if (idx !== -1) {
    localList[idx] = { ...localList[idx], ...updates };
    saveLocalQueries(localList);
  }

  // 2. Update Supabase
  const payload = {};
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.starred !== undefined) payload.starred = updates.starred;
  if (updates.notes !== undefined) payload.notes = updates.notes;

  try {
    const { data, error } = await supabase
      .from('queries')
      .update(payload)
      .eq('id', id)
      .select();

    if (error) {
      console.warn('Supabase update notice:', error);
    }
    return data;
  } catch (e) {
    console.warn('Supabase update network error:', e);
  }
  return null;
}

/**
 * Deletes a query row in Supabase and Local Cache
 */
export async function deleteQueryRecord(id) {
  // 1. Delete from local cache
  const localList = getLocalQueries().filter(q => q.id !== id);
  saveLocalQueries(localList);

  // 2. Delete from Supabase
  try {
    const { data, error } = await supabase
      .from('queries')
      .delete()
      .eq('id', id);

    if (error) {
      console.warn('Supabase delete notice:', error);
    }
    return data;
  } catch (e) {
    console.warn('Supabase delete network error:', e);
  }
  return null;
}
