import { requireAuth, setSecurityHeaders } from '../_auth.js';
import {
  fetchFolders,
  fetchMessages,
  fetchMessageDetail,
  updateMessageState,
  deleteMessage,
  sendEmail
} from './_service.js';

export default async function handler(req, res) {
  setSecurityHeaders(res);

  // Enforce session authentication
  const authPayload = requireAuth(req, res);
  if (!authPayload) return; // 401 already dispatched

  const action = req.query.action || (req.method === 'POST' ? 'send' : 'messages');

  try {
    // 1. Fetch Folders & Status
    if (req.method === 'GET' && action === 'folders') {
      const result = await fetchFolders();
      return res.status(200).json(result);
    }

    // 2. Fetch Email List (with folder, search, pagination)
    if (req.method === 'GET' && (action === 'messages' || action === 'list')) {
      const folder = req.query.folder || 'INBOX';
      const page = parseInt(req.query.page || '1', 10);
      const limit = parseInt(req.query.limit || '20', 10);
      const search = req.query.search || '';

      const result = await fetchMessages({ folder, page, limit, search });

      // Normalize: frontend expects { success, messages[], totalPages, unread }
      const messages = result.data || result.messages || [];
      const total = result.total || messages.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const unread = result.unreadCount || messages.filter(m => m.unread).length;

      return res.status(200).json({
        success: true,
        messages,
        total,
        totalPages,
        unread,
        page,
        folder,
        connection: result.connection || null
      });
    }

    // 3. Fetch Single Email Detail
    if (req.method === 'GET' && (action === 'message' || action === 'detail')) {
      const id = req.query.id || req.query.uid;
      const folder = req.query.folder || 'INBOX';
      if (!id) return res.status(400).json({ error: 'Message ID is required.' });

      const result = await fetchMessageDetail(id, folder);
      if (!result.success) {
        return res.status(404).json(result);
      }

      // Normalize: frontend expects { success, message: {...} }
      return res.status(200).json({
        success: true,
        message: result.data || result.message || result
      });
    }

    // 4. Send Email / Reply / Forward
    if (req.method === 'POST' && (action === 'send' || action === 'compose')) {
      const { to, cc, bcc, subject, html, text, inReplyTo, references } = req.body || {};
      if (!to) {
        return res.status(400).json({ error: 'Recipient "to" address is required.' });
      }

      const result = await sendEmail({ to, cc, bcc, subject, html, text, inReplyTo, references });
      return res.status(200).json(result);
    }

    // 5. Update Message State (Read, Star, Move)
    if (req.method === 'PATCH' || (req.method === 'POST' && action === 'update')) {
      const id = req.query.id || req.query.uid || req.body?.id;
      const folder = req.query.folder || req.body?.folder || 'INBOX';
      if (!id) return res.status(400).json({ error: 'Message ID is required.' });

      const { read, star, moveTo } = req.body || {};
      const result = await updateMessageState(id, { read, star, moveTo, folder });
      return res.status(200).json(result);
    }

    // 6. Delete Message / Move to Trash
    if (req.method === 'DELETE' || (req.method === 'POST' && action === 'delete')) {
      const id = req.query.id || req.query.uid || req.body?.id;
      const folder = req.query.folder || req.body?.folder || 'INBOX';
      if (!id) return res.status(400).json({ error: 'Message ID is required.' });

      const result = await deleteMessage(id, folder);
      return res.status(200).json(result);
    }

    return res.status(405).json({ error: `Action or method not supported: ${req.method} ${action}` });
  } catch (err) {
    console.error('Email API handler error:', err);
    return res.status(500).json({ error: 'Internal email service error.' });
  }
}
