import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const GOVT_SUPABASE_URL = process.env.GOVT_SUPABASE_URL || '';
const GOVT_SERVICE_KEY = process.env.GOVT_SERVICE_KEY || '';

if (!GOVT_SUPABASE_URL || !GOVT_SERVICE_KEY) {
  console.error('Missing GOVT_SUPABASE_URL or GOVT_SERVICE_KEY');
  process.exit(1);
}

export const govtDb = createClient(GOVT_SUPABASE_URL, GOVT_SERVICE_KEY);
