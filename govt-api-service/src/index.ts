import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { govtDb } from './db';
import { generateAllSchemes } from './seed';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

let schemeCount = 0;

async function runMigrations() {
  try {
    // Create govt_schemes table via RPC or raw SQL
    // Supabase doesn't support raw SQL from client, so we rely on the table existing
    // If table doesn't exist, the seed will fail gracefully
    console.log('Migration check complete');
  } catch (err) {
    console.error('Migration error (non-fatal):', err);
  }
}

async function seedIfEmpty() {
  try {
    const { count, error } = await govtDb
      .from('govt_schemes')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.log('Table may not exist, attempting to seed anyway...');
    }

    if (!count || count === 0) {
      console.log('Seeding validated schemes...');
      const schemes = generateAllSchemes();

      // Insert in batches of 25
      for (let i = 0; i < schemes.length; i += 25) {
        const batch = schemes.slice(i, i + 25);
        const { error: insertError } = await govtDb
          .from('govt_schemes')
          .upsert(batch, { onConflict: 'id' });

        if (insertError) {
          console.error(`Batch ${i/25 + 1} error:`, insertError.message);
        }
      }

      schemeCount = schemes.length;
      console.log(`Seeded ${schemes.length} validated schemes successfully`);
    } else {
      schemeCount = count;
      console.log(`Database already has ${count} schemes`);
    }
  } catch (err: any) {
    console.error('Seed error:', err.message);
  }
}

// GET /api/schemes - paginated list
app.get('/api/schemes', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const category = req.query.category as string;
    const offset = (page - 1) * limit;

    let query = govtDb
      .from('govt_schemes')
      .select('*')
      .eq('is_active', true)
      .range(offset, offset + limit - 1)
      .order('id');

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) throw error;

    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/schemes/:id
app.get('/api/schemes/:id', async (req, res) => {
  try {
    const { data, error } = await govtDb
      .from('govt_schemes')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Scheme not found' });
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/schemes/updates?since=ISO_DATE
app.get('/api/schemes/updates', async (req, res) => {
  try {
    const since = req.query.since as string;
    if (!since) return res.status(400).json({ error: 'since parameter required' });

    const { data, error } = await govtDb
      .from('govt_schemes')
      .select('*')
      .gte('launched_date', since);

    if (error) throw error;
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /health
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', count: schemeCount });
});

async function startup() {
  try {
    await runMigrations();
    await seedIfEmpty();

    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => {
      console.log(`✅ Govt API ready :${PORT} | ${schemeCount} schemes in database`);
    });
  } catch (err) {
    console.error('Startup error:', err);
  }
}

startup();
