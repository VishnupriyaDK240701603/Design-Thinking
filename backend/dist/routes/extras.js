"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationsRouter = exports.notesRouter = exports.statusRouter = void 0;
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const crypto_1 = __importDefault(require("crypto"));
const zod_1 = require("zod");
exports.statusRouter = (0, express_1.Router)();
exports.notesRouter = (0, express_1.Router)();
exports.notificationsRouter = (0, express_1.Router)();
exports.statusRouter.use(auth_1.requireAuth);
exports.notesRouter.use(auth_1.requireAuth);
exports.notificationsRouter.use(auth_1.requireAuth);
const statusSchema = zod_1.z.enum([
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
exports.statusRouter.post('/:schemeId', async (req, res) => {
    try {
        const auth_id = res.locals.user.id;
        const { data: user } = await db_1.appDb.from('users').select('id').eq('auth_id', auth_id).single();
        if (!user)
            return res.status(404).json({ error: 'User not found' });
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
        const { data, error } = await db_1.appDb
            .from('user_scheme_status')
            .upsert(statusData, { onConflict: 'user_id,scheme_id' })
            .select()
            .single();
        if (error)
            throw error;
        return res.json(data);
    }
    catch (err) {
        if (err?.name === 'ZodError') {
            return res.status(400).json({ error: err.errors?.[0]?.message || 'Invalid status' });
        }
        return res.status(500).json({ error: err.message });
    }
});
exports.statusRouter.get('/', async (req, res) => {
    try {
        const auth_id = res.locals.user.id;
        const { data: user } = await db_1.appDb.from('users').select('id').eq('auth_id', auth_id).single();
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        const { data, error } = await db_1.appDb
            .from('user_scheme_status')
            .select('*, schemes(*)')
            .eq('user_id', user.id);
        if (error)
            throw error;
        return res.json(data);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// ═══════════ NOTES ROUTES (AES-256-GCM ENCRYPTED) ═══════════
const NOTES_SECRET = process.env.NOTES_KEY || 'namma_thittam_notes_secret_32ch';
const NOTES_KEY = crypto_1.default.createHash('sha256').update(NOTES_SECRET).digest();
const GCM_IV_LENGTH = 12;
const LEGACY_IV_LENGTH = 16;
function encrypt(text) {
    const iv = crypto_1.default.randomBytes(GCM_IV_LENGTH);
    const cipher = crypto_1.default.createCipheriv('aes-256-gcm', NOTES_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v2', iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}
function decrypt(text) {
    const parts = text.split(':');
    if (parts[0] === 'v2') {
        const iv = Buffer.from(parts[1], 'hex');
        const tag = Buffer.from(parts[2], 'hex');
        const encrypted = Buffer.from(parts[3], 'hex');
        const decipher = crypto_1.default.createDecipheriv('aes-256-gcm', NOTES_KEY, iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted.toString('utf8');
    }
    const iv = Buffer.from(parts.shift(), 'hex');
    const encrypted = Buffer.from(parts.join(':'), 'hex');
    const legacyKey = Buffer.from(NOTES_SECRET, 'utf8').subarray(0, 32);
    const decipher = crypto_1.default.createDecipheriv('aes-256-cbc', legacyKey, iv.subarray(0, LEGACY_IV_LENGTH));
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
}
exports.notesRouter.post('/:schemeId', async (req, res) => {
    try {
        const auth_id = res.locals.user.id;
        const { data: user } = await db_1.appDb.from('users').select('id').eq('auth_id', auth_id).single();
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        const encryptedNote = encrypt(String(req.body.note || ''));
        const { data: existing, error: existingError } = await db_1.appDb
            .from('user_scheme_status')
            .select('id')
            .eq('user_id', user.id)
            .eq('scheme_id', req.params.schemeId)
            .single();
        if (existingError && existingError.code !== 'PGRST116')
            throw existingError;
        const { error } = existing
            ? await db_1.appDb
                .from('user_scheme_status')
                .update({ notes_encrypted: encryptedNote })
                .eq('id', existing.id)
                .select()
                .single()
            : await db_1.appDb
                .from('user_scheme_status')
                .insert({
                user_id: user.id,
                scheme_id: req.params.schemeId,
                status: 'not_applied',
                notes_encrypted: encryptedNote
            })
                .select()
                .single();
        if (error)
            throw error;
        return res.json({ success: true });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.notesRouter.get('/:schemeId', async (req, res) => {
    try {
        const auth_id = res.locals.user.id;
        const { data: user } = await db_1.appDb.from('users').select('id').eq('auth_id', auth_id).single();
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        const { data, error } = await db_1.appDb
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
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// ═══════════ NOTIFICATIONS ROUTES ═══════════
exports.notificationsRouter.get('/', async (req, res) => {
    try {
        const auth_id = res.locals.user.id;
        const { data: user } = await db_1.appDb.from('users').select('id').eq('auth_id', auth_id).single();
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        const { data: notifications, error } = await db_1.appDb
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        const normalized = (notifications || []).map(notification => ({
            ...notification,
            is_read: !!notification.read_at
        }));
        const unread_count = normalized.filter(n => !n.is_read).length;
        return res.json({ notifications: normalized, unread_count });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.notificationsRouter.patch('/:id/read', async (req, res) => {
    try {
        const auth_id = res.locals.user.id;
        const { data: user } = await db_1.appDb.from('users').select('id').eq('auth_id', auth_id).single();
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        const { error } = await db_1.appDb
            .from('notifications')
            .update({ read_at: new Date().toISOString() })
            .eq('id', req.params.id)
            .eq('user_id', user.id);
        if (error)
            throw error;
        return res.json({ success: true });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.notificationsRouter.patch('/read-all', async (req, res) => {
    try {
        const auth_id = res.locals.user.id;
        const { data: user } = await db_1.appDb.from('users').select('id').eq('auth_id', auth_id).single();
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        const { error } = await db_1.appDb
            .from('notifications')
            .update({ read_at: new Date().toISOString() })
            .eq('user_id', user.id)
            .is('read_at', null);
        if (error)
            throw error;
        return res.json({ success: true });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
