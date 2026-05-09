import { Router, Request, Response } from 'express';
import { appDb } from '../db';
import { requireAuth } from '../middleware/auth';
import crypto from 'crypto';
import { z } from 'zod';

export const statusRouter = Router();
export const notesRouter = Router();
export const notificationsRouter = Router();

statusRouter.use(requireAuth);
notesRouter.use(requireAuth);
notificationsRouter.use(requireAuth);

const statusSchema = z.enum([
  'not_applied',
  'saved',
  'bookmarked',
  'applied',
  'under_review',
  'in_progress',
  'approved',
  'rejected',
  'withdrawn',
]);

// ═══════════ STATUS ROUTES ═══════════

statusRouter.post('/:schemeId', async (req: Request, res: Response) => {
  try {
    const auth_id = res.locals.user.id;
    const { data: user } = await appDb.from('users').select('id').eq('auth_id', auth_id).single();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const requestedStatus = statusSchema.parse(req.body.status);
    const status = requestedStatus === 'saved' ? 'bookmarked' : requestedStatus;
    const now = new Date().toISOString();
    const statusData = {
      user_id: user.id,
      scheme_id: req.params.schemeId,
      status,
      saved_at: status === 'bookmarked' ? now : null,
      applied_at: ['applied', 'under_review', 'in_progress', 'approved', 'rejected'].includes(status) ? now : null,
      decision_at: ['approved', 'rejected', 'withdrawn'].includes(status) ? now : null,
      updated_at: now
    };

    const { data, error } = await appDb
      .from('user_scheme_status')
      .upsert(statusData, { onConflict: 'user_id,scheme_id' })
      .select()
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return res.status(400).json({ error: err.errors?.[0]?.message || 'Invalid status' });
    }
    return res.status(500).json({ error: err.message });
  }
});

statusRouter.get('/', async (req: Request, res: Response) => {
  try {
    const auth_id = res.locals.user.id;
    const { data: user } = await appDb.from('users').select('id').eq('auth_id', auth_id).single();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { data, error } = await appDb
      .from('user_scheme_status')
      .select('*, schemes(*)')
      .eq('user_id', user.id);

    if (error) throw error;
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ═══════════ NOTES ROUTES (AES-256-GCM ENCRYPTED) ═══════════

const NOTES_SECRET = process.env.NOTES_KEY || 'namma_thittam_notes_secret_32ch';
const NOTES_KEY = crypto.createHash('sha256').update(NOTES_SECRET).digest();
const GCM_IV_LENGTH = 12;
const LEGACY_IV_LENGTH = 16;

function encrypt(text: string): string {
  const iv = crypto.randomBytes(GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', NOTES_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v2', iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}

function decrypt(text: string): string {
  const parts = text.split(':');
  if (parts[0] === 'v2') {
    const iv = Buffer.from(parts[1], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const encrypted = Buffer.from(parts[3], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', NOTES_KEY, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }

  const iv = Buffer.from(parts.shift()!, 'hex');
  const encrypted = Buffer.from(parts.join(':'), 'hex');
  const legacyKey = Buffer.from(NOTES_SECRET, 'utf8').subarray(0, 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', legacyKey, iv.subarray(0, LEGACY_IV_LENGTH));
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}

notesRouter.post('/:schemeId', async (req: Request, res: Response) => {
  try {
    const auth_id = res.locals.user.id;
    const { data: user } = await appDb.from('users').select('id').eq('auth_id', auth_id).single();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const encryptedNote = encrypt(String(req.body.note || ''));

    const { data: existing, error: existingError } = await appDb
      .from('user_scheme_status')
      .select('id')
      .eq('user_id', user.id)
      .eq('scheme_id', req.params.schemeId)
      .single();

    if (existingError && existingError.code !== 'PGRST116') throw existingError;

    const { error } = existing
      ? await appDb
        .from('user_scheme_status')
        .update({ notes_encrypted: encryptedNote })
        .eq('id', existing.id)
        .select()
        .single()
      : await appDb
        .from('user_scheme_status')
        .insert({
          user_id: user.id,
          scheme_id: req.params.schemeId,
          status: 'not_applied',
          notes_encrypted: encryptedNote
        })
        .select()
        .single();

    if (error) throw error;
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

notesRouter.get('/:schemeId', async (req: Request, res: Response) => {
  try {
    const auth_id = res.locals.user.id;
    const { data: user } = await appDb.from('users').select('id').eq('auth_id', auth_id).single();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { data, error } = await appDb
      .from('user_scheme_status')
      .select('notes_encrypted')
      .eq('user_id', user.id)
      .eq('scheme_id', req.params.schemeId)
      .single();

    if (error || !data?.notes_encrypted) {
      return res.json({ note: '' });
    }

    const decrypted = decrypt(data.notes_encrypted);
    return res.json({ note: decrypted });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ═══════════ NOTIFICATIONS ROUTES ═══════════

notificationsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const auth_id = res.locals.user.id;
    const { data: user } = await appDb.from('users').select('id').eq('auth_id', auth_id).single();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { data: notifications, error } = await appDb
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const normalized = (notifications || []).map(notification => ({
      ...notification,
      is_read: !!notification.read_at
    }));
    const unread_count = normalized.filter(n => !n.is_read).length;

    return res.json({ notifications: normalized, unread_count });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

notificationsRouter.patch('/:id/read', async (req: Request, res: Response) => {
  try {
    const auth_id = res.locals.user.id;
    const { data: user } = await appDb.from('users').select('id').eq('auth_id', auth_id).single();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { error } = await appDb
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', user.id);

    if (error) throw error;
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

notificationsRouter.patch('/read-all', async (req: Request, res: Response) => {
  try {
    const auth_id = res.locals.user.id;
    const { data: user } = await appDb.from('users').select('id').eq('auth_id', auth_id).single();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { error } = await appDb
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null);

    if (error) throw error;
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
