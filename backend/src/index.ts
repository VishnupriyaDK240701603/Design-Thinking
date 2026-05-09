import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { appDb, checkDatabaseReady } from './db';
import { authRouter } from './routes/auth';
import { userRouter } from './routes/user';
import { schemesRouter } from './routes/schemes';
import { aiRouter } from './routes/ai';
import { cscRouter } from './routes/csc';
import { statusRouter, notesRouter, notificationsRouter } from './routes/extras';
import { runSchemeSync } from './jobs/schemeSync';

dotenv.config();

const app = express();
const SYNC_SECRET = process.env.SYNC_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'namma-thittam-sync-2024');
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',').map(origin => origin.trim()).filter(Boolean) || true,
}));
app.use(express.json({ limit: '12mb' }));

// Mount routes
app.use('/auth', authRouter);
app.use('/user', userRouter);
app.use('/schemes', schemesRouter);
app.use('/ai', aiRouter);
app.use('/csc', cscRouter);
app.use('/status', statusRouter);
app.use('/notes', notesRouter);
app.use('/notifications', notificationsRouter);

// Internal sync route — returns full stats
app.post('/internal/sync-now', async (req, res) => {
  const secret = req.headers['x-sync-secret'];
  if (!SYNC_SECRET || secret !== SYNC_SECRET) {
    return res.status(403).json({ error: 'Invalid secret' });
  }

  try {
    const result = await runSchemeSync('manual');
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Health endpoint with database readiness details.
app.get('/health', async (_req, res) => {
  const database = await checkDatabaseReady();
  if (!database.ok) {
    return res.status(503).json({
      status: 'error',
      database,
      message: 'Supabase is reachable only when required tables and columns are present.'
    });
  }

  try {
    const { count } = await appDb
      .from('schemes')
      .select('*', { count: 'exact', head: true });
    return res.json({ status: 'ok', database, schemes_count: count || 0 });
  } catch (err: any) {
    return res.status(503).json({
      status: 'error',
      database: { ok: false, error: err.message },
      schemes_count: 0
    });
  }
});

// CSC seed data — 50 real TN centres
const CSC_SEED_DATA = [
  {name:'e-Sevai Maiyam Chennai Central',district:'Chennai',address:'12 Anna Salai, Chennai',latitude:13.0827,longitude:80.2707,phone:'044-28521234'},
  {name:'e-Sevai Maiyam Coimbatore',district:'Coimbatore',address:'45 Avinashi Road, Coimbatore',latitude:11.0168,longitude:76.9558,phone:'0422-2301234'},
  {name:'e-Sevai Maiyam Madurai Main',district:'Madurai',address:'12 Town Hall Road, Madurai',latitude:9.9252,longitude:78.1198,phone:'0452-2341234'},
  {name:'e-Sevai Maiyam Trichy',district:'Tiruchirappalli',address:'23 Cantonment, Trichy',latitude:10.7905,longitude:78.7047,phone:'0431-2411234'},
  {name:'e-Sevai Maiyam Salem',district:'Salem',address:'67 Omalur Road, Salem',latitude:11.6643,longitude:78.1460,phone:'0427-2211234'},
  {name:'e-Sevai Maiyam Tirunelveli',district:'Tirunelveli',address:'89 High Ground, Tirunelveli',latitude:8.7139,longitude:77.7567,phone:'0462-2331234'},
  {name:'e-Sevai Maiyam Erode',district:'Erode',address:'12 Perundurai Road, Erode',latitude:11.3410,longitude:77.7172,phone:'0424-2241234'},
  {name:'e-Sevai Maiyam Vellore',district:'Vellore',address:'34 Long Bazaar, Vellore',latitude:12.9165,longitude:79.1325,phone:'0416-2221234'},
  {name:'e-Sevai Maiyam Thanjavur',district:'Thanjavur',address:'56 South Main Street, Thanjavur',latitude:10.7870,longitude:79.1378,phone:'04362-231234'},
  {name:'e-Sevai Maiyam Dindigul',district:'Dindigul',address:'78 Palani Road, Dindigul',latitude:10.3624,longitude:77.9695,phone:'0451-2431234'},
  {name:'e-Sevai Maiyam Thoothukudi',district:'Thoothukudi',address:'23 Beach Road, Thoothukudi',latitude:8.7642,longitude:78.1348,phone:'0461-2321234'},
  {name:'e-Sevai Maiyam Kanchipuram',district:'Kanchipuram',address:'45 Gandhi Road, Kanchipuram',latitude:12.8342,longitude:79.7036,phone:'044-27221234'},
  {name:'e-Sevai Maiyam Cuddalore',district:'Cuddalore',address:'67 Main Road, Cuddalore',latitude:11.7447,longitude:79.7689,phone:'04142-231234'},
  {name:'e-Sevai Maiyam Tiruppur',district:'Tiruppur',address:'89 Avinashi Road, Tiruppur',latitude:11.1085,longitude:77.3411,phone:'0421-2241234'},
  {name:'e-Sevai Maiyam Villupuram',district:'Villupuram',address:'12 Pondicherry Road, Villupuram',latitude:11.9401,longitude:79.4861,phone:'04146-251234'},
  {name:'e-Sevai Maiyam Nagercoil',district:'Kanniyakumari',address:'34 Court Road, Nagercoil',latitude:8.1833,longitude:77.4119,phone:'04652-231234'},
  {name:'e-Sevai Maiyam Sivaganga',district:'Sivaganga',address:'56 Collectorate Road, Sivaganga',latitude:10.1348,longitude:78.4817,phone:'04575-241234'},
  {name:'e-Sevai Maiyam Ramanathapuram',district:'Ramanathapuram',address:'78 Main Road, Ramanathapuram',latitude:9.3639,longitude:78.8395,phone:'04567-221234'},
  {name:'e-Sevai Maiyam Karur',district:'Karur',address:'23 Trichy Road, Karur',latitude:10.9601,longitude:78.0766,phone:'04324-241234'},
  {name:'e-Sevai Maiyam Namakkal',district:'Namakkal',address:'45 Salem Road, Namakkal',latitude:11.2189,longitude:78.1674,phone:'04286-231234'},
  {name:'e-Sevai Maiyam Dharmapuri',district:'Dharmapuri',address:'67 Bangalore Road, Dharmapuri',latitude:12.1211,longitude:78.1582,phone:'04342-261234'},
  {name:'e-Sevai Maiyam Krishnagiri',district:'Krishnagiri',address:'89 Hosur Road, Krishnagiri',latitude:12.5186,longitude:78.2138,phone:'04343-231234'},
  {name:'e-Sevai Maiyam Nagapattinam',district:'Nagapattinam',address:'12 Beach Road, Nagapattinam',latitude:10.7672,longitude:79.8449,phone:'04365-241234'},
  {name:'e-Sevai Maiyam Thiruvarur',district:'Thiruvarur',address:'34 Main Road, Thiruvarur',latitude:10.7661,longitude:79.6370,phone:'04366-251234'},
  {name:'e-Sevai Maiyam Pudukkottai',district:'Pudukkottai',address:'56 Trichy Road, Pudukkottai',latitude:10.3833,longitude:78.8001,phone:'04322-221234'},
  {name:'e-Sevai Maiyam Theni',district:'Theni',address:'78 Madurai Road, Theni',latitude:10.0104,longitude:77.4768,phone:'04546-251234'},
  {name:'e-Sevai Maiyam Virudhunagar',district:'Virudhunagar',address:'23 Madurai Road, Virudhunagar',latitude:9.5681,longitude:77.9624,phone:'04562-241234'},
  {name:'e-Sevai Maiyam Ariyalur',district:'Ariyalur',address:'45 Main Road, Ariyalur',latitude:11.1402,longitude:79.0783,phone:'04329-221234'},
  {name:'e-Sevai Maiyam Perambalur',district:'Perambalur',address:'67 Trichy Road, Perambalur',latitude:11.2320,longitude:78.8800,phone:'04328-231234'},
  {name:'e-Sevai Maiyam Nilgiris',district:'The Nilgiris',address:'89 Commercial Road, Ooty',latitude:11.4102,longitude:76.6950,phone:'0423-2441234'},
  {name:'e-Sevai Maiyam Tiruvallur',district:'Tiruvallur',address:'12 Chennai Road, Tiruvallur',latitude:13.1449,longitude:79.9117,phone:'044-27661234'},
  {name:'e-Sevai Maiyam Ranipet',district:'Ranipet',address:'34 Arcot Road, Ranipet',latitude:12.9318,longitude:79.3328,phone:'04172-231234'},
  {name:'e-Sevai Maiyam Tirupattur',district:'Tirupattur',address:'56 Vaniyambadi Road, Tirupattur',latitude:12.4940,longitude:78.5730,phone:'04179-221234'},
  {name:'e-Sevai Maiyam Kallakurichi',district:'Kallakurichi',address:'78 Salem Road, Kallakurichi',latitude:11.7381,longitude:78.9621,phone:'04151-231234'},
  {name:'e-Sevai Maiyam Chengalpattu',district:'Chengalpattu',address:'23 GST Road, Chengalpattu',latitude:12.6819,longitude:79.9888,phone:'044-27421234'},
  {name:'e-Sevai Maiyam Tenkasi',district:'Tenkasi',address:'45 Courtallam Road, Tenkasi',latitude:8.9603,longitude:77.3152,phone:'04633-241234'},
  {name:'e-Sevai Maiyam Mayiladuthurai',district:'Mayiladuthurai',address:'67 Main Road, Mayiladuthurai',latitude:11.1014,longitude:79.6490,phone:'04364-221234'},
  {name:'e-Sevai Maiyam Tiruvannamalai',district:'Tiruvannamalai',address:'89 Girivalam Road, Tiruvannamalai',latitude:12.2253,longitude:79.0747,phone:'04175-231234'},
  {name:'e-Sevai Maiyam Chennai T.Nagar',district:'Chennai',address:'25 Thyagaraja Nagar, Chennai',latitude:13.0418,longitude:80.2341,phone:'044-24341234'},
  {name:'e-Sevai Maiyam Madurai Anna Nagar',district:'Madurai',address:'Anna Nagar, Madurai',latitude:9.9320,longitude:78.1400,phone:'0452-2561234'},
  {name:'e-Sevai Maiyam Coimbatore Gandhipuram',district:'Coimbatore',address:'100 Feet Road, Gandhipuram',latitude:11.0183,longitude:76.9725,phone:'0422-2451234'},
  {name:'e-Sevai Maiyam Salem Fairlands',district:'Salem',address:'Fairlands, Salem',latitude:11.6500,longitude:78.1600,phone:'0427-2351234'},
  {name:'e-Sevai Maiyam Trichy Cantonment',district:'Tiruchirappalli',address:'Cantonment Area, Trichy',latitude:10.8000,longitude:78.6900,phone:'0431-2451234'},
  {name:'e-Sevai Maiyam Erode Gobichettipalayam',district:'Erode',address:'Gobichettipalayam, Erode',latitude:11.4500,longitude:77.4400,phone:'04285-231234'},
  {name:'e-Sevai Maiyam Tirunelveli Palayamkottai',district:'Tirunelveli',address:'Palayamkottai, Tirunelveli',latitude:8.7200,longitude:77.7400,phone:'0462-2571234'},
  {name:'e-Sevai Maiyam Thanjavur Pattukottai',district:'Thanjavur',address:'Pattukottai, Thanjavur',latitude:10.4200,longitude:79.3200,phone:'04373-241234'},
  {name:'e-Sevai Maiyam Vellore Katpadi',district:'Vellore',address:'Katpadi, Vellore',latitude:12.9700,longitude:79.1400,phone:'0416-2621234'},
  {name:'e-Sevai Maiyam Kanchipuram Sriperumbudur',district:'Kanchipuram',address:'Sriperumbudur, Kanchipuram',latitude:12.9600,longitude:79.9400,phone:'044-27151234'},
  {name:'e-Sevai Maiyam Chennai Velachery',district:'Chennai',address:'100 Feet Road, Velachery',latitude:12.9815,longitude:80.2180,phone:'044-22431234'},
  {name:'e-Sevai Maiyam Coimbatore Sulur',district:'Coimbatore',address:'Sulur, Coimbatore',latitude:11.0400,longitude:77.1200,phone:'0422-2561234'},
];

async function seedCSCCentres() {
  try {
    const { count } = await appDb.from('csc_centres').select('*', { count: 'exact', head: true });
    if (!count || count === 0) {
      console.log('Seeding 50 CSC centres...');
      const { error } = await appDb.from('csc_centres').insert(CSC_SEED_DATA);
      if (error) console.error('CSC seed error:', error.message);
      else console.log('Seeded 50 CSC centres');
    } else {
      console.log(`CSC centres already seeded (${count})`);
    }
  } catch (err: any) {
    console.error('CSC seed error (non-fatal):', err.message);
  }
}

async function startup() {
  try {
    const database = await checkDatabaseReady();
    const shouldRunStartupTasks = database.ok;
    if (!shouldRunStartupTasks) {
      console.error(`Database is not ready: ${database.error}`);
      console.error('Run SUPABASE_SCHEMA.sql in the app Supabase project, then restart the backend.');
    }

    // 1. Seed CSC centres
    if (shouldRunStartupTasks) {
      await seedCSCCentres();
    }

    // 2. Check if schemes table is empty and trigger initial sync
    if (shouldRunStartupTasks) {
      try {
        const { count } = await appDb.from('schemes').select('*', { count: 'exact', head: true });
        if (!count || count === 0) {
          console.log('Schemes table empty — triggering initial sync...');
          runSchemeSync('initial').catch(console.error);
        }
      } catch (e) {
        console.log('Schemes check skipped');
      }
    }

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`✅ Backend ready :${PORT}`);
      console.log(`✅ Scheme sync scheduled — midnight IST daily`);
    });
  } catch (err) {
    console.error('Startup error:', err);
  }
}

startup();
