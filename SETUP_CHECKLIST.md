# ✅ SETUP CHECKLIST — Get Running by Tomorrow

## Step 1: Setup Supabase Database (5 mins)

### 1.1 Create Tables
1. Go to: https://supabase.co/dashboard
2. Select your projects:
   - **APP Database**: `sjckllkoqybnvnubaese` 
   - **GOVT Database**: `rajjsyagzqtspewwizwd`

3. **For APP Database:**
   - Click **SQL Editor** → **New Query**
   - Copy ALL SQL from `d:\Namma Thittam\SUPABASE_SCHEMA.sql`
   - Paste & Execute
   - ✅ Should show "Success" for all tables

4. **For GOVT Database:**
   - Create a simple table (govt_schemes) OR it will auto-seed
   - The backend will auto-seed 150 schemes on first run

### 1.2 Create Storage Bucket
1. In APP Database, go to **Storage** tab
2. Click **New Bucket** → Name: `user-documents` → Make **Private**
3. ✅ Bucket created

---

## Step 2: Install Dependencies (3 mins)

```powershell
# Terminal 1
cd "d:\Namma Thittam\backend"
npm install

# Terminal 2  
cd "d:\Namma Thittam\govt-api-service"
npm install

# Terminal 3
cd "d:\Namma Thittam\app"
npm install
```

---

## Step 3: Start All Services (2 mins)

**IMPORTANT: Start in this exact order, in 3 separate terminals!**

### Terminal 1 — Backend
```powershell
cd "d:\Namma Thittam\backend"
npm run dev
```
Expected output:
```
✅ Backend ready :3000
✅ Scheme sync scheduled — midnight IST daily
```

Wait until you see the green ✅ message.

---

### Terminal 2 — Government API
```powershell
cd "d:\Namma Thittam\govt-api-service"
npm run dev
```
Expected output:
```
✅ Govt API ready :4000 | 150 schemes in database
```

Wait until you see the green ✅ message.

---

### Terminal 3 — Expo App
```powershell
cd "d:\Namma Thittam\app"
npx expo start
```
Expected output:
```
› Metro waiting on exp://YOUR_IP:8081
› Scan the QR code above with Expo Go
```

---

## Step 4: Test on Phone (1 min)

1. Download **Expo Go** from Google Play or App Store
2. Scan the QR code from Terminal 3
3. App will load in ~15 seconds
4. You should see the Onboarding screen

---

## Step 5: Validate Everything Works (2 mins)

### Test 1: Backend Health
```powershell
# In PowerShell
curl http://localhost:3000/health
```
Expected response: `{"status":"ok","count":0}`

### Test 2: Govt API Health
```powershell
curl http://localhost:4000/health
```
Expected response: `{"status":"ok","count":150}`

### Test 3: Registration (via curl)
```powershell
curl.exe -i -X POST -H "Content-Type: application/json" `
  -d '{"username":"testuser123","password":"Password123!","security_q1":"q1","security_a1":"a1","security_q2":"q2","security_a2":"a2","security_q3":"q3","security_a3":"a3","security_q4":"q4","security_a4":"a4"}' `
  http://127.0.0.1:3000/auth/register
```
Expected: `HTTP/1.1 200 OK` with `access_token` in response

---

## ⚠️ Troubleshooting 500 Errors

### If Backend Returns 500:

**Check 1: Supabase Connection**
- Verify `.env` has correct APP_SUPABASE_URL and APP_SERVICE_KEY
- Tables exist in Supabase (run SUPABASE_SCHEMA.sql)

**Check 2: Look at Terminal Output**
- Backend terminal should show the actual error
- Example: `"Relation 'public.users' does not exist"`
- Fix: Run SUPABASE_SCHEMA.sql in Supabase SQL Editor

**Check 3: Network**
```powershell
# Test if Supabase is reachable
curl https://sjckllkoqybnvnubaese.supabase.co
```
Should return HTML page (not connection timeout)

### If App Won't Connect to Backend:

**Check API_URL in app:**
- Open `d:\Namma Thittam\app\lib\api.ts`
- Line 4: `export const API_URL = 'http://10.134.103.225:3000';`
- Replace `10.134.103.225` with your computer's local IP:
  ```powershell
  ipconfig /all
  # Look for IPv4 Address (usually 192.168.x.x or 10.x.x.x)
  ```
- Or use `localhost:3000` if testing on same machine

### If Phone Can't Scan QR Code:

- Make sure phone and PC are on **same WiFi**
- Terminal 3 should show: `› Using Expo Go`
- Try again or press `r` in terminal to reload

---

## 🎯 For Project Review Tomorrow

### Demo Flow:
1. **Open app** (scan QR code)
2. **Show Onboarding** (swipe through 3 slides)
3. **Register** → Use form fields
4. **Profile Setup** → Fill all 7 steps
5. **Home Screen** → Show scheme categories
6. **Search & Filter** → Find schemes
7. **Scheme Details** → Tap a scheme

### Impress Them:
- ✅ All 3 services running (show terminals)
- ✅ Health endpoints return data (show curl tests)
- ✅ Full registration flow works
- ✅ Database persists data (Supabase tables)
- ✅ Real Tamil translations throughout
- ✅ Smooth animations (Reanimated library)

---

## ⏱️ Total Setup Time: ~15 minutes

1. Supabase tables .......................... 5 min
2. Install dependencies ................... 3 min
3. Start 3 services ........................ 2 min
4. Test on phone ........................... 3 min
5. Validate with curl ..................... 2 min

**You're ready for project review! 🚀**

---

## 📞 Last Resort Fixes

If you still get errors tomorrow:

1. **Restart all terminals** (Ctrl+C, then rerun)
2. **Clear cache**: `rm -r node_modules .expo` in each folder, then `npm install` again
3. **Check Supabase status**: https://status.supabase.com
4. **Verify internet**: `ping google.com`

