# ✅ Email Booking System - Setup Instructions

## 🎯 Quick Start

Your booking system is now ready! Follow these 4 steps to enable email notifications:

### Step 1: Get Gmail App Password
1. Go to https://myaccount.google.com/
2. Click **Security** in the left menu
3. Enable **2-Step Verification** (if not already enabled)
4. Look for **App passwords** option
5. Select **Mail** and **Windows Computer**
6. Google will give you a 16-character password → **Copy it**

### Step 2: Create `.env` File
Create a new file called `.env` in the root folder with:
```
EMAIL_USER=ngw.designer@gmail.com
EMAIL_PASSWORD=paste-your-16-char-password-here
PORT=5000
```

### Step 3: Install & Run
Open terminal and run:
```bash
npm install
npm run dev:all
```

This starts:
- ✅ Frontend on http://localhost:8081
- ✅ Email server on http://localhost:5000

### Step 4: Test Booking
1. Go to http://localhost:8081/booking
2. Fill in your details
3. Select date and time
4. Click "Confirm Appointment"
5. ✅ Check both your email and ngw.designer@gmail.com

---

## 📧 What Happens When Someone Books

**Patient receives:** Confirmation email with appointment details from ngw.designer@gmail.com

**Admin receives:** Notification email at ngw.designer@gmail.com with patient info

---

## 🛠️ Admin Panel

Access at http://localhost:8081/admin
- **Username:** admin
- **Password:** password123

Features:
- ➕ Add patient records
- 📤 Send prescriptions via Email/WhatsApp
- 🎥 Upload images/videos
- 🗑️ Delete media items

---

## ❓ Troubleshooting

**Emails not sending?**
- Check `.env` file exists with correct password
- Make sure both servers running (npm run dev:all)
- Verify Gmail app password (not regular password!)

**Server not starting?**
```bash
npm install --legacy-peer-deps
npm run dev:all
```

**Use individual servers:**
```bash
# Terminal 1
npm run dev

# Terminal 2  
npm run dev:server
```

---

**Need help?** Check `EMAIL_SETUP.md` and `FEATURES.md` for more details.
