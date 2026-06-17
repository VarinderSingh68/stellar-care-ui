# CardioVita - Medical Booking & Admin System

Complete healthcare practice management solution built with React and Node.js.

## Features Implemented

### 🏥 Admin Dashboard (`/admin`)
- **Login System**: Admin credentials (username: `admin` / password: `password123`)
- **Patient Management**: 
  - Add patient details (name, suffering/diagnosis, email, WhatsApp)
  - Send prescriptions via Email or WhatsApp
  - View all patient records
- **Prescription Management**:
  - Create and manage patient prescriptions
  - Auto-send via email or WhatsApp
- **Review Media Management**:
  - Upload images/videos from computer or URL
  - Publish to testimonials page
  - Delete media items in real-time

### 📅 Appointment Booking (`/booking`)
- **Patient Details Form**: Name, email, phone, reason for visit
- **Date & Time Selection**: Calendar with available time slots
- **Email Notifications**:
  - Confirmation email to patient
  - Notification email to admin (ngw.designer@gmail.com)
- **Local Storage**: All bookings saved for reference

### 📝 Testimonials & Reviews (`/testimonials`)
- Patient testimonials display
- Real-time media gallery (admin-published images/videos)
- Auto-refresh when media is added/deleted

### 🛠️ Setup Requirements

#### Email System Setup
The booking system requires a Node.js backend server for email delivery. To enable it:

1. **Gmail App-Specific Password**:
   - Enable 2FA on your Google account
   - Generate an App Password at https://myaccount.google.com/apppasswords
   - Copy the 16-character password

2. **Create `.env` File** in project root:
   ```
   EMAIL_USER=ngw.designer@gmail.com
   EMAIL_PASSWORD=xxxx xxxx xxxx xxxx
   PORT=5000
   ```

3. **Install Dependencies**:
   ```bash
   npm install
   ```

4. **Run Both Servers**:
   ```bash
   npm run dev:all
   ```
   - Frontend: http://localhost:8081
   - Backend: http://localhost:5000

### 📚 Project Structure

```
src/
├── components/
│   ├── BookingSection.tsx      (Appointment booking form)
│   ├── TestimonialsSection.tsx (Reviews with media)
│   ├── Navbar.tsx              (Navigation)
│   └── ui/                     (shadcn/ui components)
├── pages/
│   ├── AdminLoginPage.tsx      (Admin login)
│   ├── AdminDashboard.tsx      (Admin panel)
│   ├── BookingPage.tsx         (Booking page)
│   └── TestimonialsPage.tsx    (Reviews page)
├── lib/
│   ├── admin.ts                (Admin storage & auth)
│   └── booking.ts              (Booking logic & email)
└── App.tsx                     (Route setup)

server.ts                        (Email backend server)
```

### 🎯 Key Routes

- `/` - Home page
- `/services` - Services page
- `/about` - About page
- `/booking` - Appointment booking
- `/testimonials` - Patient reviews and media
- `/contact` - Contact page
- `/admin` - Admin login
- `/admin/dashboard` - Admin panel

### 💾 Data Storage

- **Patients**: LocalStorage (admin panel)
- **Bookings**: LocalStorage + Email notifications
- **Media**: LocalStorage + Real-time updates
- **Admin Auth**: SessionStorage (current session only)

### 🔒 Default Admin Credentials

- Username: `admin`
- Password: `password123`

⚠️ **Note**: Change these credentials before deploying to production!

### 📧 Email Features

Booking confirmations are sent to:
1. **Patient Email**: HTML-formatted confirmation with appointment details
2. **Admin Email** (ngw.designer@gmail.com): Notification with patient info and appointment details

Both emails are sent from: ngw.designer@gmail.com

### 🚀 Deployment Notes

Before deploying:
1. Update admin credentials
2. Set up proper Gmail credentials (not shown in code)
3. Update email backend URL if deployed separately
4. Add environment variables securely
5. Consider adding database instead of localStorage for production

---

**Built with**: React, TypeScript, Tailwind CSS, shadcn/ui, Vite, Express, Nodemailer
