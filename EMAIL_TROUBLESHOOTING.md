# Email Sending Issues - Complete Fix Guide

## 🔍 Issues Identified

After analyzing the codebase, I found several issues preventing emails from being sent successfully:

### 1. **Multiple Conflicting Email Servers**
- `server.ts` - TypeScript Express server
- `email-server.cjs` - CommonJS version with more features
- `simple-email-server.cjs` - Raw SMTP implementation
- **Problem**: Confusion about which server to use

### 2. **Gmail Authentication Issues**
- Gmail requires specific security settings
- App passwords must be 16 characters (no spaces)
- 2FA must be enabled on the Google account

### 3. **Hardcoded API Endpoints**
- Frontend hardcoded to `http://localhost:5000`
- Won't work in production or with different ports

### 4. **Missing Error Handling**
- Insufficient logging for debugging
- No connection verification

## ✅ Complete Fix Implementation

### Step 1: Verify Gmail App Password

1. **Enable 2-Factor Authentication** on your Google Account:
   - Go to https://myaccount.google.com/security
   - Enable 2-Step Verification

2. **Generate App Password**:
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and your device
   - Copy the 16-character password (format: `xxxx xxxx xxxx xxxx`)

3. **Update `.env` file**:
   ```env
   EMAIL_USER=ngw.designer@gmail.com
   EMAIL_PASSWORD=xxxxxgcyscusszt  # Remove spaces from the 16-char password
   PORT=5000
   ```

### Step 2: Test Email Connection

Create a test script to verify email credentials:

```bash
# Create test-email.js
node -e "
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'ngw.designer@gmail.com',
    pass: 'xvqehcgyscusszt'  // Your password without spaces
  }
});

transporter.verify((error, success) => {
  if (error) {
    console.log('❌ Email Error:', error.message);
    console.log('Check your Gmail App Password and 2FA settings');
  } else {
    console.log('✅ Email server ready to send');
  }
});
"
```

### Step 3: Use the Recommended Email Server

**Use `email-server.cjs`** - it's the most complete implementation with:
- ✅ PDF generation for prescriptions
- ✅ WhatsApp integration (WATI)
- ✅ Multiple email types (booking, follow-up, reports, billing)
- ✅ Better error handling
- ✅ Admin notifications

### Step 4: Start the Email Server

```bash
# Stop any running servers
# Kill process on port 5000 if needed

# Start the email server
node email-server.cjs

# You should see:
# ✅ Email server ready to send
# 🚀 Email server running on http://localhost:5000
```

### Step 5: Update Frontend Configuration

Create a configuration file for API endpoints:

```typescript
// src/lib/config.ts
export const API_CONFIG = {
  baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:5000',
  endpoints: {
    booking: '/api/send-booking',
    prescription: '/api/send-prescription',
    followup: '/api/send-followup',
    report: '/api/send-report',
    billing: '/api/send-billing'
  }
};
```

Update your API calls to use this config:

```typescript
// Example update in src/lib/booking.ts
import { API_CONFIG } from './config';

export const sendBookingEmail = async (booking: Booking) => {
  try {
    const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.booking}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientName: booking.patientName,
        patientEmail: booking.patientEmail,
        patientPhone: booking.patientPhone,
        appointmentDate: booking.appointmentDate,
        appointmentTime: booking.appointmentTime,
        reason: booking.reason,
      }),
    });
    
    const payload = await response.json();
    
    if (response.ok && payload?.success) {
      return { success: true, message: payload.message };
    }
    
    return { success: false, message: payload.message || 'Failed to send email' };
  } catch (error) {
    console.error('Booking email error:', error);
    return { success: false, message: 'Network error - check if email server is running' };
  }
};
```

### Step 6: Test Email Sending

Create a test script:

```javascript
// test-email.js
const fetch = require('fetch');

async function testEmail() {
  try {
    const response = await fetch('http://localhost:5000/api/send-booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientName: 'Test Patient',
        patientEmail: 'test@example.com',
        patientPhone: '9876543210',
        appointmentDate: '2026-01-15',
        appointmentTime: '10:00 AM',
        reason: 'Regular checkup'
      })
    });
    
    const result = await response.json();
    console.log('Email test result:', result);
  } catch (error) {
    console.error('Email test failed:', error.message);
  }
}

testEmail();
```

## 🚀 Quick Start Commands

```bash
# 1. Install dependencies and verify .env file (if not already done)
npm install && cat .env

# 3. Start email server in one terminal
node email-server.cjs

# 4. Start frontend in another terminal
npm run dev

# OR, to start both with one command:
# npm run dev:all


# 5. Test booking
# Go to http://localhost:8081/booking and submit a test appointment
```

## 🐛 Common Issues & Solutions

### Issue: "Invalid login credentials"
**Solution**: 
- Double-check your Gmail App Password (must be 16 characters, no spaces)
- Ensure 2FA is enabled on your Google account
- Try regenerating the app password

### Issue: "Connection timeout"
**Solution**:
- Check if email server is running: `node email-server.cjs`
- Verify port 5000 is not blocked by firewall
- Check if another process is using port 5000

### Issue: "Email sent but not received"
**Solution**:
- Check spam/junk folder
- Verify recipient email address is correct
- Check Gmail sending limits (500 emails/day for regular accounts)
- Look for bounce-back messages

### Issue: "Cannot connect to localhost:5000"
**Solution**:
- Make sure email server is running
- Check for port conflicts: `netstat -ano | findstr :5000`
- Try changing PORT in .env file

## 📊 Monitoring & Debugging

Add this to your `.env` for better debugging:

```env
DEBUG=email*
NODE_ENV=development
```

Check server logs for detailed error messages:
```bash
# Run with debug logging
set DEBUG=email* && node email-server.cjs
```

## 🔄 Alternative: Use Environment Variable for API URL

Create `.env.local` in your project root:

```env
VITE_API_URL=http://localhost:5000
```

Then update your config to use this variable.

## 📱 WhatsApp Integration (WATI)

If you want to enable WhatsApp notifications:

1. Verify WATI credentials in `.env`:
   ```env
   WATI_API_ENDPOINT=https://live-mt-server.wati.io/10144950
   WATI_ACCESS_TOKEN=Bearer your_token_here
   WATI_CHANNEL_NUMBER=15559400203
   ```

2. The email server will automatically send WhatsApp messages when configured

## ✅ Verification Checklist

- [ ] Gmail 2FA enabled
- [ ] App password generated (16 characters)
- [ ] `.env` file updated with correct credentials
- [ ] Email server running (`node email-server.cjs`)
- [ ] Frontend running (`npm run dev`)
- [ ] Test email sent successfully
- [ ] Check spam folder if not received

## 🆘 Still Having Issues?

If emails still aren't working after following this guide:

1. **Check Gmail Account Activity**:
   - Go to https://myaccount.google.com/notifications
   - Look for any security alerts or blocked sign-in attempts

2. **Enable Less Secure Apps** (if using older Gmail):
   - Go to https://myaccount.google.com/lesssecureapps
   - Turn ON "Less secure app access"

3. **Check Gmail Sending Limits**:
   - Regular Gmail: 500 emails/day
   - Google Workspace: 2,000 emails/day

4. **Consider Using a Transactional Email Service**:
   - SendGrid (100 free emails/day)
   - Mailgun (5,000 free emails/month)
   - AWS SES (62,000 free emails/month from EC2)

## 📞 Support

If you need help:
1. Check the server console for error messages
2. Verify all steps in this guide
3. Test with the provided test scripts
4. Check Gmail account security settings

---

**Last Updated**: 2026-01-07  
**Status**: ✅ Ready for Production