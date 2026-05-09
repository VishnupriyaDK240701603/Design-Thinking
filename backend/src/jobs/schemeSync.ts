import { appDb } from '../db';
import cron from 'node-cron';
import { scoreScheme } from '../lib/eligibility';
import axios from 'axios';

const GOVT_API_URL = process.env.GOVT_API_URL || 'http://localhost:4000';
const DOCUMENT_TYPE_MAP: Record<string, string> = {
  aadhaar: 'aadhaar',
  aadhar: 'aadhaar',
  ration_card: 'ration_card',
  income_certificate: 'income_certificate',
  community_certificate: 'community_certificate',
  caste_certificate: 'community_certificate',
  residence_certificate: 'residence_certificate',
  disability_certificate: 'disability_certificate',
  business_proof: 'business_proof',
  land_ownership_proof: 'land_ownership_proof',
  age_proof: 'age_proof',
  passport_photo: 'passport_photo',
  bank_account: 'bank_account'
};

export interface SyncResult {
  schemes_added: number;
  schemes_updated: number;
  schemes_deactivated: number;
  users_notified: number;
  duration_ms: number;
}

function normalizeDocumentType(value: any) {
  const raw = typeof value === 'string'
    ? value
    : value?.type || value?.document_type || value?.name_en || value?.name_ta || value?.name || '';
  const key = String(raw).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return DOCUMENT_TYPE_MAP[key] || 'other';
}

function documentNotes(value: any) {
  if (typeof value === 'string') return value;
  return value?.name_ta || value?.name_en || value?.name || value?.document_type || value?.type || 'Other';
}

async function replaceSchemeDocuments(schemeId: string, documents: any[] = []) {
  await appDb.from('scheme_required_documents').delete().eq('scheme_id', schemeId);
  const rowsByType = new Map<string, Record<string, any>>();
  for (const doc of documents) {
    const document_type = normalizeDocumentType(doc);
    rowsByType.set(document_type, {
      scheme_id: schemeId,
      document_type,
      is_mandatory: doc?.is_mandatory ?? true,
      notes: documentNotes(doc)
    });
  }
  const rows = Array.from(rowsByType.values());
  if (rows.length > 0) {
    await appDb.from('scheme_required_documents').upsert(rows, { onConflict: 'scheme_id,document_type' });
  }
}

async function replaceSchemeSteps(schemeId: string, steps: any[] = []) {
  await appDb.from('scheme_application_steps').delete().eq('scheme_id', schemeId);
  const rows = steps.map((step, index) => ({
    scheme_id: schemeId,
    step_no: index + 1,
    instruction_ta: typeof step === 'string' ? step : (step.description_ta || step.instruction_ta || step.description_en || step.instruction_en || `Step ${index + 1}`),
    instruction_en: typeof step === 'string' ? null : (step.description_en || step.instruction_en || null)
  }));
  if (rows.length > 0) {
    await appDb.from('scheme_application_steps').insert(rows);
  }
}

export async function runSchemeSync(trigger: string): Promise<SyncResult> {
  const startTime = Date.now();
  let schemesAdded = 0;
  let schemesUpdated = 0;
  let schemesDeactivated = 0;
  let usersNotified = 0;

  try {
    console.log(`Starting scheme sync [${trigger}]...`);

    // Step A: Fetch from Govt API
    let govtSchemes: any[] = [];
    try {
      const response = await axios.get(`${GOVT_API_URL}/api/schemes?limit=200`);
      govtSchemes = response.data;
    } catch (fetchErr: any) {
      console.warn('Govt API unreachable, skipping sync:', fetchErr.message);
      return { schemes_added: 0, schemes_updated: 0, schemes_deactivated: 0, users_notified: 0, duration_ms: Date.now() - startTime };
    }

    if (!govtSchemes || govtSchemes.length === 0) {
      console.warn('No schemes from Govt API');
      return { schemes_added: 0, schemes_updated: 0, schemes_deactivated: 0, users_notified: 0, duration_ms: Date.now() - startTime };
    }

    // Step B: Upsert into schemes
    const fetchedGovtIds: string[] = [];

    for (const gs of govtSchemes) {
      fetchedGovtIds.push(gs.id);

      const schemeData = {
        government_scheme_id: gs.id,
        title_ta: gs.title_ta,
        title_en: gs.title_en,
        description_ta: gs.description_ta,
        description_en: gs.description_en,
        category: gs.category,
        eligibility_rules: gs.eligibility || gs.eligibility_criteria || {},
        benefit_type: gs.benefit_type,
        benefit_amount: gs.benefit_amount,
        benefit_unit: gs.benefit_unit,
        application_url: gs.application_url,
        application_deadline: gs.application_deadline || gs.expiry_date || null,
        benefit_norm: gs.benefit_norm,
        urgency: gs.urgency,
        recency: gs.recency,
        is_active: true,
        synced_at: new Date().toISOString()
      };

      const { data: existing } = await appDb.from('schemes').select('id').eq('government_scheme_id', gs.id).single();

      if (existing) {
        await appDb.from('schemes').update(schemeData).eq('id', existing.id);
        await replaceSchemeDocuments(existing.id, gs.documents_required || []);
        await replaceSchemeSteps(existing.id, gs.application_steps || []);
        schemesUpdated++;
      } else {
        const { data: newScheme } = await appDb.from('schemes').insert(schemeData).select().single();
        schemesAdded++;

        // Step D: Score all completed individual accounts for new schemes
        if (newScheme) {
          await replaceSchemeDocuments(newScheme.id, gs.documents_required || []);
          await replaceSchemeSteps(newScheme.id, gs.application_steps || []);

          const { data: users } = await appDb.from('user_scheme_profile_inputs').select('*');
          if (users) {
            const userNotifCounts: Record<string, number> = {};

            for (const user of users) {
              const userId = user.id;
              userNotifCounts[userId] = userNotifCounts[userId] || 0;

              // Score main user
              const elig = scoreScheme(user, newScheme.eligibility_rules || {});
              if (elig.score >= 65 && userNotifCounts[userId] < 3) {
                await appDb.from('notifications').insert({
                  user_id: userId,
                  type: 'scheme_match',
                  title_ta: 'புதிய திட்டம்',
                  message_ta: `உங்களுக்கு ஏற்ற புதிய திட்டம்: ${newScheme.title_ta}`,
                  scheme_id: newScheme.id
                });
                userNotifCounts[userId]++;
                usersNotified++;
              }
            }
          }
        }
      }
    }

    // Step C: Deactivate schemes NOT in fetched list
    if (fetchedGovtIds.length > 0) {
      const { data: deactivated } = await appDb
        .from('schemes')
        .update({ is_active: false })
        .not('government_scheme_id', 'in', `(${fetchedGovtIds.map(id => `"${id}"`).join(',')})`)
        .select();

      schemesDeactivated = deactivated ? deactivated.length : 0;
    }

    // Expiry alert: schemes expiring in 7 days
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
    const { data: expiringSchemes } = await appDb
      .from('schemes')
      .select('*')
      .eq('is_active', true)
      .lte('application_deadline', sevenDaysLater.toISOString())
      .gte('application_deadline', new Date().toISOString());

    if (expiringSchemes && expiringSchemes.length > 0) {
      const { data: allUsers } = await appDb.from('user_scheme_profile_inputs').select('id');
      if (allUsers) {
        for (const scheme of expiringSchemes) {
          for (const user of allUsers) {
            await appDb.from('notifications').insert({
              user_id: user.id,
              type: 'deadline',
              title_ta: 'திட்ட காலாவதி எச்சரிக்கை',
              message_ta: `${scheme.title_ta} 7 நாட்களில் காலாவதியாகும்`,
              scheme_id: scheme.id
            });
          }
        }
      }
    }

    const duration_ms = Date.now() - startTime;

    // Step E: Write sync_logs
    await appDb.from('sync_logs').insert({
      source: 'govt-api',
      entity: 'schemes',
      status: 'success',
      finished_at: new Date().toISOString(),
      records_seen: govtSchemes.length,
      records_inserted: schemesAdded,
      records_updated: schemesUpdated,
      metadata: { trigger, schemes_deactivated: schemesDeactivated, users_notified: usersNotified, duration_ms }
    });

    console.log(`Sync complete in ${duration_ms}ms — added:${schemesAdded} updated:${schemesUpdated} deactivated:${schemesDeactivated} notified:${usersNotified}`);

    return { schemes_added: schemesAdded, schemes_updated: schemesUpdated, schemes_deactivated: schemesDeactivated, users_notified: usersNotified, duration_ms };

  } catch (err: any) {
    console.error('Sync failed:', err.message);
    const duration_ms = Date.now() - startTime;
    try {
      await appDb.from('sync_logs').insert({
        source: 'govt-api',
        entity: 'schemes',
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_message: err.message,
        metadata: { trigger, duration_ms }
      });
    } catch (_) {}

    return { schemes_added: schemesAdded, schemes_updated: schemesUpdated, schemes_deactivated: schemesDeactivated, users_notified: usersNotified, duration_ms };
  }
}

cron.schedule('0 0 * * *', () => runSchemeSync('cron'), { timezone: 'Asia/Kolkata' });
