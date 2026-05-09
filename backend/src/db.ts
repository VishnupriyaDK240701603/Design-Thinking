import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const APP_SUPABASE_URL = process.env.APP_SUPABASE_URL || '';
const APP_SERVICE_KEY = process.env.APP_SERVICE_KEY || '';
const APP_ANON_KEY = process.env.APP_ANON_KEY || '';

const missingEnv = [
  ['APP_SUPABASE_URL', APP_SUPABASE_URL],
  ['APP_SERVICE_KEY', APP_SERVICE_KEY],
  ['APP_ANON_KEY', APP_ANON_KEY],
].filter(([, value]) => !value).map(([name]) => name);

if (missingEnv.length > 0) {
  throw new Error(`Missing required Supabase environment variables: ${missingEnv.join(', ')}`);
}

export const appDb = createClient(APP_SUPABASE_URL, APP_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export const appAuth = createClient(APP_SUPABASE_URL, APP_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const REQUIRED_USERS_COLUMNS = [
  'id',
  'auth_id',
  'username',
  'full_name',
  'age',
  'gender',
  'marital_status',
  'state_of_residence',
  'area_type',
  'social_category',
  'bpl_status',
  'land_ownership',
  'education_level',
  'employment_status',
  'registration_complete'
];

export async function checkDatabaseReady() {
  const startedAt = Date.now();
  const { error } = await appDb
    .from('user_registration_profiles')
    .select(REQUIRED_USERS_COLUMNS.join(','), { head: true })
    .limit(1);

  return {
    ok: !error,
    latency_ms: Date.now() - startedAt,
    error: error?.message
  };
}
