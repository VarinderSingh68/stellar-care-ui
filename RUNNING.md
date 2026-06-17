# 🚀 Running CardioVita Application

## Frontend is Running ✅
- **URL**: http://localhost:8082/
- **Mobile URL**: http://192.168.29.145:8082/

## For Email Support

Email functionality requires a simple 3-step setup:

### Step 1: Wait for Dependencies
```bash
# Terminal: npm install express cors nodemailer dotenv --force
# (This is currently installing, please wait for it to complete)
```

### Step 2: Run Email Server (After Step 1 Completes)
Open a new terminal in the project folder and run:
```bash
npm run email-server
```

You should see:
```
✅ Email server ready to send
🚀 Email server running on http://localhost:5000
   Sending emails to: ngw.designer@gmail.com
```

### Step 3: Test Booking with Emails

While both servers are running:
1. Go to http://localhost:8082/booking
2. Fill in your details
3. Click "Confirm Appointment"
4. Check your email and ngw.designer@gmail.com for confirmation

---

## All Available Pages

| Page | URL |
|------|-----|
| Home | http://localhost:8082/ |
| Services | http://localhost:8082/services |
| About | http://localhost:8082/about |
| **Booking** | http://localhost:8082/booking |
| Testimonials | http://localhost:8082/testimonials |
| Contact | http://localhost:8082/contact |
| **Admin** | http://localhost:8082/admin |

## Admin Login
- **Username**: admin
- **Password**: password123

---

### Troubleshooting

**If npm install is stuck:**
- Press Ctrl+C and try: `npm install --legacy-peer-deps`

**If email server won't start:**
- Make sure you ran: `npm run email-server`
- Check that .env file exists in project root
- Look for errors in terminal

**Emails not sending:**
- Verify .env file has the correct Gmail app password
- Check email server is running (you should see ✅ Email server ready)
- Look for error messages in email-server terminal
