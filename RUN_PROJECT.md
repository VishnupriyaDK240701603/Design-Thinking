# 🚀 Namma Thittam — Quick Start Guide

## Prerequisites
- Node.js 18+ installed
- npm installed
- All `.env` files configured (already done ✅)

---

## 🎯 Run All Services (Recommended)

### Option 1: Run in 3 Separate Terminals (Best for Development)

**Terminal 1 — Backend API**
```powershell
cd "d:\Namma Thittam\backend"
npm install
npm run dev
```
✅ Runs on `http://localhost:3000`

---

**Terminal 2 — Government API Service**
```powershell
cd "d:\Namma Thittam\govt-api-service"
npm install
npm run dev
```
✅ Runs on `http://localhost:4000`

---

**Terminal 3 — Expo App**
```powershell
cd "d:\Namma Thittam\app"
npm install
npx expo start
```
✅ Scan QR code with **Expo Go** app on your phone

---

## 📱 Testing on Mobile

1. **Download Expo Go** app from Google Play or App Store
2. Make sure your phone is on the **same WiFi network** as your computer
3. Scan the QR code from Terminal 3
4. App will load in Expo Go

---

## 🔧 Environment Variables Already Set

✅ Backend (APP_SUPABASE_URL, APP_SERVICE_KEY, GROQ_API_KEY)  
✅ Govt API (GOVT_SUPABASE_URL, GOVT_SERVICE_KEY)  
✅ App (API_URL = http://10.134.103.225:3000)

---

## ⚠️ If You Get a 500 Error

1. **Check Backend is Running**: Open `http://localhost:3000/health` in browser
   - Should return: `{"status":"ok","count":0}`

2. **Check Govt API is Running**: Open `http://localhost:4000/health` in browser
   - Should return: `{"status":"ok","count":###}`

3. **If Supabase Connection Fails**:
   - Verify `.env` files have correct URLs and keys
   - Check internet connection

---

## 🧪 Quick Test After Startup

```powershell
# Test backend health
curl http://localhost:3000/health

# Test govt API health
curl http://localhost:4000/health
```

---

## 🎬 Project Review Tips

- **Show Mobile App First**: Scan QR code, show onboarding screens
- **Show Authentication**: Register → Login → Profile Setup flow
- **Show Scheme Discovery**: Browse schemes by category
- **Show Backend API**: Health endpoints prove services are live
- **Keep Terminals Visible**: Shows all services running

---

## 📋 Common Issues

| Issue | Solution |
|-------|----------|
| "Cannot find module" | Run `npm install` in that folder |
| "Port already in use" | Change `PORT` in `.env` file |
| "Supabase connection failed" | Check `.env` credentials and internet |
| "App won't load in Expo Go" | Make sure phone and PC are on same WiFi |

---

**Ready to go! 🚀**
