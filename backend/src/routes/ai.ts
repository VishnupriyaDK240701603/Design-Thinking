import { Router, Request, Response } from 'express';
import { appDb } from '../db';
import { requireAuth } from '../middleware/auth';
import { scoreScheme } from '../lib/eligibility';
import Groq, { toFile } from 'groq-sdk';
import { File as NodeFile } from 'node:buffer';

export const aiRouter = Router();

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
const MODEL_NAME = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
const TRANSCRIPTION_MODEL = process.env.GROQ_TRANSCRIPTION_MODEL || 'whisper-large-v3-turbo';
const SCHEME_CACHE_TTL_MS = 60_000;
const CHAT_TIMEOUT_MS = 12_000;
const SUPPORTED_TRANSCRIPTION_TYPES: Record<string, string> = {
  'audio/flac': 'flac',
  'audio/mp3': 'mp3',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mpeg',
  'audio/mpga': 'mpga',
  'audio/m4a': 'm4a',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
};
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'what', 'which', 'about', 'tell', 'give', 'show',
  'scheme', 'schemes', 'yojana', 'plan', 'help', 'apply', 'application', 'link', 'portal', 'details',
  'me', 'my', 'i', 'a', 'an', 'to', 'of', 'in', 'on', 'is', 'are'
]);

let schemeCache: { expiresAt: number; data: any[] } | null = null;

if (typeof globalThis.File === 'undefined') {
  (globalThis as any).File = NodeFile;
}

aiRouter.use(requireAuth);

function writeSse(res: Response, payload: any) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function formatMoney(value: number | null | undefined) {
  if (!value) return '';
  return `₹${Number(value).toLocaleString('en-IN')}`;
}

async function fetchProfile(authId: string) {
  const { data } = await appDb.from('user_scheme_profile_inputs').select('*').eq('auth_id', authId).single();
  return data;
}

function normalizeSchemeForClient(scheme: any) {
  const documents_required = (scheme.scheme_required_documents || [])
    .sort((a: any, b: any) => String(a.document_type).localeCompare(String(b.document_type)))
    .map((doc: any) => doc.notes || doc.document_type);

  const { scheme_required_documents, scheme_application_steps, eligibility_rules, ...base } = scheme;
  return {
    ...base,
    govt_scheme_id: base.government_scheme_id,
    eligibility_criteria: eligibility_rules,
    documents_required
  };
}

async function fetchActiveSchemes() {
  if (schemeCache && schemeCache.expiresAt > Date.now()) {
    return schemeCache.data;
  }

  const { data: schemes, error } = await appDb
    .from('schemes')
    .select('*, scheme_required_documents(*)')
    .eq('is_active', true);
  if (error || !schemes) return schemeCache?.data || [];

  schemeCache = {
    data: schemes.map(normalizeSchemeForClient),
    expiresAt: Date.now() + SCHEME_CACHE_TTL_MS
  };
  return schemes;
}

function tokenize(value: string) {
  return (value || '')
    .toLowerCase()
    .normalize('NFKD')
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter(token => token.length > 1 && !STOP_WORDS.has(token)) || [];
}

function schemeSearchText(scheme: any) {
  return [
    scheme.title_en,
    scheme.title_ta,
    scheme.description_en,
    scheme.description_ta,
    scheme.category,
    scheme.department,
    scheme.benefit_unit,
    ...(scheme.tags || []),
    ...(scheme.documents_required || [])
  ].filter(Boolean).join(' ');
}

function scoreTextRelevance(scheme: any, queryTokens: string[]) {
  if (!queryTokens.length) return 0;
  const title = `${scheme.title_en || ''} ${scheme.title_ta || ''}`.toLowerCase();
  const text = schemeSearchText(scheme).toLowerCase();

  return queryTokens.reduce((score, token) => {
    if (title.includes(token)) return score + 4;
    if (text.includes(token)) return score + 2;
    return score;
  }, 0);
}

async function rankSchemes(profile: any, message = '', limit = 8) {
  const schemes = await fetchActiveSchemes();
  if (!schemes.length) return [];

  const queryTokens = tokenize(message);

  return schemes
    .map((scheme: any) => ({
      ...scheme,
      eligibility: profile ? scoreScheme(profile, scheme.eligibility_criteria || {}) : { score: 0 },
      relevanceScore: scoreTextRelevance(scheme, queryTokens)
    }))
    .filter((scheme: any) => {
      if (!queryTokens.length) return scheme.eligibility.score >= 65;
      return scheme.relevanceScore > 0 || scheme.eligibility.score >= 80;
    })
    .sort((a: any, b: any) => {
      const aScore = a.relevanceScore * 20 + a.eligibility.score;
      const bScore = b.relevanceScore * 20 + b.eligibility.score;
      return bScore - aScore;
    })
    .slice(0, limit);
}

async function fetchPersonalizedSchemes(profile: any, limit = 8) {
  return rankSchemes(profile, '', limit);
}

function buildSchemeContext(schemes: any[]) {
  if (!schemes.length) return 'No strongly eligible schemes found for this profile.';
  return schemes.map((scheme, index) => {
    const docs = (scheme.documents_required || []).slice(0, 3).join(', ');
    return `${index + 1}. ${scheme.title_en || scheme.title_ta}; score ${scheme.eligibility.score}; benefit ${formatMoney(scheme.benefit_amount)} ${scheme.benefit_unit || ''}; apply ${scheme.application_url || 'N/A'}; docs ${docs}`;
  }).join('\n');
}

export function buildSystemPrompt(user: any, lang: 'ta' | 'en', schemeContext = '') {
  const age = user?.dob ? Math.floor((Date.now() - new Date(user.dob).getTime()) / 31557600000) : 'unknown';
  const income = user?.income_annual != null ? Number(user.income_annual).toLocaleString('en-IN') : 'unknown';

  return `
You are Namma Thittam, a Tamil Nadu government scheme assistant.
Reply in ${lang === 'ta' ? 'Tamil' : 'English'}.
Use only the active scheme data provided below. Do not invent schemes, amounts, or eligibility.
Keep replies under 150 words. Prefer direct, practical answers.
If the user asks how to apply, include the official application URL from the scheme data.
If no scheme matches, say which profile details should be updated.

User profile:
Name: ${user?.full_name || user?.username || 'user'}
Age: ${age}
Gender: ${user?.gender || '-'}
District: ${user?.district || '-'}
Area: ${user?.area_type || '-'}
Income: ₹${income}/year
Community: ${user?.social_category || '-'}
Occupation: ${user?.occupation || '-'}
Education: ${user?.education_level || '-'}
BPL: ${user?.is_bpl ? 'yes' : 'no'}
Ration card: ${user?.ration_card_type || '-'}
Land: ${user?.land_holding_acres || 0} acres
House: ${user?.house_ownership || '-'}
Vehicle: ${user?.vehicle_ownership || '-'}
Disabled: ${user?.is_disabled ? `yes ${user?.disability_percent || ''}%` : 'no'}

Strongly eligible active schemes:
${schemeContext}
`;
}

function schemeLine(scheme: any, index: number) {
  const benefit = scheme.benefit_amount ? ` - ${formatMoney(scheme.benefit_amount)} ${scheme.benefit_unit || ''}` : '';
  return `${index + 1}. ${scheme.title_ta || scheme.title_en}${benefit}`;
}

async function buildFallbackReply(message: string, profile: any, lang: 'ta' | 'en') {
  const recommended = await fetchPersonalizedSchemes(profile, 6);
  const normalized = message.toLowerCase();
  const wantsApplication = /apply|application|link|portal|விண்ணப்ப|இணைப்பு/.test(normalized);

  if (!recommended.length) {
    return lang === 'ta'
      ? 'உங்கள் தற்போதைய சுயவிவரத்தின் அடிப்படையில் வலுவான பொருத்தம் இல்லை. வருமானம், தொழில், கல்வி, BPL, வீட்டு நிலை, மாற்றுத்திறன் போன்ற விவரங்களை புதுப்பித்தால் துல்லியமான பரிந்துரைகள் கிடைக்கும்.'
      : 'I could not find a strong match from your current profile. Update income, occupation, education, BPL, housing, and disability details for better recommendations.';
  }

  if (wantsApplication) {
    const first = recommended[0];
    const docs = (first.documents_required || []).slice(0, 4).join(', ');
    return lang === 'ta'
      ? `${first.title_ta || first.title_en} விண்ணப்பிக்க அதிகாரப்பூர்வ இணைப்பு: ${first.application_url || 'இணைப்பு இல்லை'}. தேவையான ஆவணங்கள்: ${docs || 'திட்ட விவரப் பக்கத்தை பார்க்கவும்'}.`
      : `Official application link for ${first.title_en || first.title_ta}: ${first.application_url || 'not available'}. Documents: ${docs || 'check the scheme detail page'}.`;
  }

  return lang === 'ta'
    ? `உங்கள் சுயவிவரத்துக்கு பொருந்தும் முக்கிய திட்டங்கள்:\n${recommended.map(schemeLine).join('\n')}\n\nஒவ்வொரு திட்ட விவரப் பக்கத்திலும் தகுதி சதவீதமும் விண்ணப்ப இணைப்பும் இருக்கும்.`
    : `Top schemes matching your profile:\n${recommended.map(schemeLine).join('\n')}\n\nEach detail page shows the eligibility score and official application link.`;
}

aiRouter.post('/chat', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const { message, history, language = 'ta' } = req.body;
  const lang = language === 'en' ? 'en' : 'ta';

  try {
    const profile = await fetchProfile(res.locals.user.id);
    const personalized = await rankSchemes(profile, message || '', 6);

    if (!groq) {
      writeSse(res, { text: await buildFallbackReply(message || '', profile, lang), fallback: true });
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    const messages = [
      { role: 'system', content: buildSystemPrompt(profile || {}, lang, buildSchemeContext(personalized)) },
      ...(history || []).slice(-4).map((item: any) => ({
        role: item.role === 'model' || item.role === 'assistant' ? 'assistant' : 'user',
        content: item.text || item.parts?.[0]?.text || item.content || ''
      })),
      { role: 'user', content: message }
    ];

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), CHAT_TIMEOUT_MS);
    res.on('close', () => {
      if (!res.writableEnded) abortController.abort();
    });

    try {
      const stream = await groq.chat.completions.create({
        messages: messages as any,
        model: MODEL_NAME,
        stream: true,
        max_tokens: 280,
        temperature: 0.2
      }, {
        signal: abortController.signal
      });

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || '';
        if (text) writeSse(res, { text });
      }
    } finally {
      clearTimeout(timeout);
    }

    res.write('data: [DONE]\n\n');
    return res.end();
  } catch (err: any) {
    try {
      const profile = await fetchProfile(res.locals.user.id);
      writeSse(res, { text: await buildFallbackReply(message || '', profile, lang), fallback: true });
      res.write('data: [DONE]\n\n');
      return res.end();
    } catch {
      writeSse(res, { error: err.message || 'Chat failed' });
      return res.end();
    }
  }
});

aiRouter.post('/transcribe', async (req: Request, res: Response) => {
  try {
    if (!groq) {
      return res.status(503).json({ error: 'Voice input is unavailable because GROQ_API_KEY is not configured.' });
    }

    const { audio_base64, mime_type = 'audio/m4a', language = 'ta' } = req.body || {};
    const normalizedMimeType = String(mime_type || 'audio/m4a').toLowerCase();
    if (!audio_base64 || typeof audio_base64 !== 'string') {
      return res.status(400).json({ error: 'Missing audio_base64.' });
    }

    const extension = SUPPORTED_TRANSCRIPTION_TYPES[normalizedMimeType];
    if (!extension) {
      return res.status(400).json({
        error: `Unsupported audio format ${normalizedMimeType}. Please record as m4a or webm.`
      });
    }

    const audio = Buffer.from(audio_base64, 'base64');
    if (!audio.length) {
      return res.status(400).json({ error: 'Empty audio recording.' });
    }

    const result = await groq.audio.transcriptions.create({
      file: await toFile(audio, `voice.${extension}`, { type: normalizedMimeType }),
      model: TRANSCRIPTION_MODEL,
      language: language === 'en' ? 'en' : 'ta',
      temperature: 0
    });

    return res.json({ text: (result.text || '').trim() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Voice transcription failed.' });
  }
});

aiRouter.post('/form-assist', async (req: Request, res: Response) => {
  try {
    const { form_field_label, form_context, language = 'ta' } = req.body;
    const { data: user } = await appDb.from('user_registration_profiles').select('*').eq('auth_id', res.locals.user.id).single();

    const label = String(form_field_label || '').toLowerCase();
    const autofillMap: Array<[boolean, string, any]> = [
      [label.includes('name') || label.includes('பெயர்'), 'பெயர்', user?.full_name || user?.username],
      [label.includes('dob') || label.includes('birth') || label.includes('பிறந்த'), 'பிறந்த தேதி', user?.dob],
      [label.includes('income') || label.includes('வருமான'), 'வருமானம்', user?.income_annual],
      [label.includes('district') || label.includes('மாவட்ட'), 'மாவட்டம்', user?.district],
      [label.includes('community') || label.includes('caste') || label.includes('சமூக'), 'சமூகப் பிரிவு', user?.social_category],
      [label.includes('ration'), 'ரேஷன் அட்டை', user?.ration_card_type],
      [label.includes('occupation') || label.includes('தொழில்'), 'தொழில்', user?.occupation],
      [label.includes('aadhaar') || label.includes('aadhar'), 'ஆதார்', user?.has_aadhaar ? 'ஆம்' : 'இல்லை'],
      [label.includes('bank'), 'வங்கி', user?.has_jan_dhan_account ? 'ஜன்தன் உள்ளது' : 'வங்கி விவரம் தேவை']
    ];

    const match = autofillMap.find(([condition, , value]) => condition && value !== null && value !== undefined && value !== '');
    if (match) {
      return res.json({ can_autofill: true, field_name_ta: match[1], value: match[2] });
    }

    if (!groq) {
      return res.json({
        can_autofill: false,
        explanation_ta: 'இந்த புலத்திற்கான தகவல் உங்கள் சுயவிவரத்தில் இல்லை. தொடர்புடைய சான்றிதழ் அல்லது ஆவணத்தை பார்த்து நிரப்பவும்.',
        document_hint: 'ஆதார் / வருமானச் சான்று / குடும்ப அட்டை போன்ற தொடர்புடைய ஆவணம்'
      });
    }

    const prompt = `
Explain the application form field "${form_field_label}" for "${form_context}".
Reply as JSON: { "explanation_ta": "short Tamil explanation", "document_hint": "one likely document" }.
`;

    const result = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: MODEL_NAME,
      response_format: { type: 'json_object' },
      temperature: 0.1
    });

    const parsed = JSON.parse(result.choices[0]?.message?.content || '{}');
    return res.json({
      can_autofill: false,
      explanation_ta: parsed.explanation_ta || 'இந்த புலத்தை திட்ட விண்ணப்ப விதிமுறைக்கு ஏற்ப நிரப்பவும்.',
      document_hint: parsed.document_hint || ''
    });
  } catch (err: any) {
    return res.json({
      can_autofill: false,
      explanation_ta: 'இந்த புலத்தை விளக்க AI தற்போது இயங்கவில்லை. உங்கள் சுயவிவரமும் ஆவணங்களும் வைத்து நிரப்பவும்.',
      document_hint: '',
      warning: err.message
    });
  }
});
