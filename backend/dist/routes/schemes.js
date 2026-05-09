"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.schemesRouter = void 0;
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const eligibility_1 = require("../lib/eligibility");
exports.schemesRouter = (0, express_1.Router)();
exports.schemesRouter.use(auth_1.requireAuth);
async function getProfileToScore(auth_id) {
    const { data: user } = await db_1.appDb
        .from('user_scheme_profile_inputs')
        .select('*')
        .eq('auth_id', auth_id)
        .single();
    return user;
}
function getSchemeCriteria(scheme) {
    return (scheme.eligibility_rules || scheme.eligibility || scheme.eligibility_criteria || {});
}
function normalizeSchemeForClient(scheme) {
    const requiredDocuments = (scheme.scheme_required_documents || [])
        .sort((a, b) => String(a.document_type).localeCompare(String(b.document_type)))
        .map((doc) => doc.notes || doc.document_type);
    const applicationSteps = (scheme.scheme_application_steps || [])
        .sort((a, b) => Number(a.step_no) - Number(b.step_no))
        .map((step) => ({
        description_ta: step.instruction_ta,
        description_en: step.instruction_en
    }));
    const { scheme_required_documents, scheme_application_steps, eligibility_rules, ...base } = scheme;
    return {
        ...base,
        govt_scheme_id: base.government_scheme_id,
        eligibility_criteria: eligibility_rules,
        documents_required: requiredDocuments,
        application_steps: applicationSteps
    };
}
function scoreSchemes(profileData, schemes) {
    return (schemes || []).map(rawScheme => {
        const scheme = normalizeSchemeForClient(rawScheme);
        return {
            ...scheme,
            eligibility: profileData ? (0, eligibility_1.scoreScheme)(profileData, getSchemeCriteria(scheme)) : null
        };
    });
}
function shouldOnlyReturnEligible(req) {
    return req.query.include_ineligible !== 'true';
}
function sanitizeSearchTerm(value) {
    return String(value || '')
        .replace(/[,%()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
}
exports.schemesRouter.get('/recommended', async (req, res) => {
    try {
        const profileData = await getProfileToScore(res.locals.user.id);
        if (!profileData)
            return res.status(404).json({ error: 'Profile not found' });
        const { data: schemes, error } = await db_1.appDb
            .from('schemes')
            .select('*, scheme_required_documents(*), scheme_application_steps(*)')
            .eq('is_active', true);
        if (error)
            throw error;
        const scoredSchemes = schemes.map(rawScheme => {
            const scheme = normalizeSchemeForClient(rawScheme);
            const eligibility = (0, eligibility_1.scoreScheme)(profileData, getSchemeCriteria(scheme));
            const benefit_norm = scheme.benefit_norm || 0;
            const urgency = scheme.urgency || 0;
            const recency = scheme.recency || 0;
            const compositeScore = (eligibility.score * 0.5) + (benefit_norm * 0.2) + (urgency * 0.2) + (recency * 0.1);
            return {
                ...scheme,
                eligibility,
                compositeScore
            };
        });
        const recommended = scoredSchemes
            .filter(s => s.eligibility.score >= 65)
            .sort((a, b) => b.compositeScore - a.compositeScore)
            .slice(0, 30);
        return res.json(recommended);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.schemesRouter.get('/category/:cat', async (req, res) => {
    try {
        const profileData = await getProfileToScore(res.locals.user.id);
        const { data: schemes, error } = await db_1.appDb
            .from('schemes')
            .select('*, scheme_required_documents(*), scheme_application_steps(*)')
            .eq('category', req.params.cat)
            .eq('is_active', true);
        if (error)
            throw error;
        const scored = scoreSchemes(profileData, schemes || []);
        const personalized = shouldOnlyReturnEligible(req)
            ? scored.filter(s => (s.eligibility?.score || 0) >= 65)
            : scored;
        return res.json(personalized);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.schemesRouter.get('/search', async (req, res) => {
    try {
        const q = sanitizeSearchTerm(req.query.q);
        if (!q)
            return res.json([]);
        const profileData = await getProfileToScore(res.locals.user.id);
        const { data: schemes, error } = await db_1.appDb
            .from('schemes')
            .select('*, scheme_required_documents(*), scheme_application_steps(*)')
            .or(`title_ta.ilike.%${q}%,title_en.ilike.%${q}%,description_ta.ilike.%${q}%`)
            .eq('is_active', true);
        if (error)
            throw error;
        const scored = scoreSchemes(profileData, schemes || []);
        const personalized = shouldOnlyReturnEligible(req)
            ? scored.filter(s => (s.eligibility?.score || 0) >= 65)
            : scored;
        return res.json(personalized);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.schemesRouter.get('/:id', async (req, res) => {
    try {
        const profileData = await getProfileToScore(res.locals.user.id);
        const { data: scheme, error } = await db_1.appDb
            .from('schemes')
            .select('*, scheme_required_documents(*), scheme_application_steps(*)')
            .eq('id', req.params.id)
            .single();
        if (error || !scheme)
            return res.status(404).json({ error: 'Scheme not found' });
        const clientScheme = normalizeSchemeForClient(scheme);
        let status = null;
        if (profileData && 'id' in profileData) {
            const { data: statusData } = await db_1.appDb
                .from('user_scheme_status')
                .select('*')
                .eq('user_id', profileData.id)
                .eq('scheme_id', clientScheme.id)
                .single();
            status = statusData;
        }
        const eligibility = profileData ? (0, eligibility_1.scoreScheme)(profileData, getSchemeCriteria(clientScheme)) : null;
        return res.json({
            ...clientScheme,
            eligibility,
            status
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.schemesRouter.get('/:id/eligibility', async (req, res) => {
    try {
        const profileData = await getProfileToScore(res.locals.user.id);
        if (!profileData)
            return res.status(404).json({ error: 'Profile not found' });
        const { data: scheme, error } = await db_1.appDb
            .from('schemes')
            .select('*')
            .eq('id', req.params.id)
            .single();
        if (error || !scheme)
            return res.status(404).json({ error: 'Scheme not found' });
        const eligibility = (0, eligibility_1.scoreScheme)(profileData, getSchemeCriteria(scheme));
        return res.json(eligibility);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
