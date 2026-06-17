# Email Server Setup Guide

## How to Enable Email Notifications

The booking system now sends emails to both patients and admin. Follow these steps to set it up:

### 1. Create a Gmail App-Specific Password

1. Go to your Google Account: https://myaccount.google.com/
2. Navigate to **Security** (left menu)
3. Enable **2-Step Verification** if not already enabled
4. Go back to Security and look for **App passwords** (this appears after 2FA is enabled)
5. Select **Mail** and **Windows Computer** (or your device)
6. Google will generate a 16-character app-specific password
7. Copy this password

### 2. Create .env File

In the project root, create a `.env` file with:

```
EMAIL_USER=ngw.designer@gmail.com
EMAIL_PASSWORD=xxxx xxxx xxxx xxxx
PORT=5000
```

Replace `xxxx xxxx xxxx xxxx` with the 16-character password from step 1 (you can include or remove spaces).

### 3. Install Dependencies

```bash
npm install
```

### 4. Run the Application

To run both the frontend and email server together:

```bash
npm run dev:all
```

This will start:
- Frontend Vite dev server on http://localhost:8081
- Email backend server on http://localhost:5000

### 5. Test the Booking System

1. Go to http://localhost:8081/booking
2. Fill in the form with your details
3. Select a date and time
4. Click "Confirm Appointment"
5. Check your email and ngw.designer@gmail.com for confirmation emails

## Emails Will Be Sent To:
- **Patient**: Confirmation email from ngw.designer@gmail.com
- **Admin**: Notification email to ngw.designer@gmail.com

## Troubleshooting

If emails aren't being sent:
1. Make sure the `.env` file exists in the root directory
2. Verify the EMAIL_PASSWORD is a 16-character app-specific password (not your regular Google password)
3. Check that both servers are running (npm run dev:all)
4. Look for errors in the terminal console

## Individual Server Commands

If you want to run servers separately:

```bash
# Terminal 1 - Frontend only
npm run dev

# Terminal 2 - Backend email server only
npm run dev:server
```
