# Stellar Care UI - Healthcare Management Platform

A comprehensive healthcare management platform built with React and TypeScript, designed for medical professionals and patients to streamline healthcare delivery.

## 🏥 Features

### For Patients
- **Patient Portal**: Create account and access personal health dashboard
- **Follow-up Reminders**: View and track assigned health tasks
- **Consent Forms**: Review and digitally sign treatment consent forms
- **Medical Records**: Access lab reports and medical documents
- **Insurance Tracking**: Monitor health insurance claims status

### For Healthcare Providers (Admin)
- **Patient Management**: Maintain comprehensive patient records with medical history
- **Prescription Management**: Create and send prescriptions via email/WhatsApp
- **Automated Follow-ups**: Create medication reminders, test schedules, exercise routines
- **Digital Consent Forms**: Generate and manage patient consent forms
- **Insurance Integration**: Submit and track insurance claims directly
- **Care Templates**: Pre-configured care plans for common conditions (diabetes, pregnancy, cardiology)
- **Medical Reports**: Manage and share patient medical reports
- **Appointment Booking**: Integrated appointment scheduling system

## ✨ New Features (v1.0)

### 1. Patient Portal & Dashboard
- Secure patient accounts with registration and login
- Personal health dashboard with key metrics
- Follow-up task management with status tracking
- Digital consent form signing
- Medical report access
- Insurance claim visibility

**Access**: Navigate to Patient Portal link in navbar or visit `/patient-portal`

### 2. Automated Follow-ups
- Create medication reminders
- Schedule medical tests
- Track exercise and diet recommendations
- Set appointment follow-ups
- Monitor completion status

### 3. Digital Consent Forms
- Create treatment, surgery, and procedure consent forms
- Digital signature with timestamp
- Patient-side signing interface
- Track signed vs. unsigned forms

### 4. Insurance Billing Integration
- Direct insurance claim submission
- Track claim status (submitted, processing, approved, rejected, paid)
- Link multiple insurance providers
- Monitor claim processing

### 5. Care Templates
Pre-configured care plans for common conditions:
- **Diabetes Care**: Blood monitoring, medication, HbA1c tests, exercise, diet
- **Pregnancy Tracking**: Prenatal vitamins, ultrasounds, blood pressure checks
- **Cardiology**: Blood pressure monitoring, cardiac medication, ECG tests

### 6. Medical Reports Management
- Upload and manage lab reports
- Track report dates and types
- Patient access through secure portal
- Searchable report library

## 🚀 Quick Start

### Installation
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Access the Application

**Admin Dashboard**:
- Navigate to `/admin`
- Default credentials: `admin` / `password123`

**Patient Portal**:
- Click "Patient Portal" in navbar
- Register for new account or use demo: `patient@demo.com` / `demo123`

## 📁 Project Structure

```
src/
├── pages/
│   ├── Index.tsx
│   ├── BookingPage.tsx
│   ├── AdminDashboard.tsx
│   ├── PatientPortalLoginPage.tsx (NEW)
│   ├── PatientPortalDashboard.tsx (NEW)
│   └── ...
├── components/
│   ├── Navbar.tsx (updated)
│   ├── BookingSection.tsx
│   ├── AdminPatientManagement.tsx (NEW)
│   └── ...
└── lib/
    ├── admin.ts
    ├── booking.ts
    ├── patient-portal.ts (NEW)
    └── utils.ts
```

## 📚 Documentation

- [Features Guide](FEATURES_GUIDE.md) - Comprehensive feature documentation
- [Quick Start Guide](QUICK_START.md) - Step-by-step usage instructions
- [Setup Guide](SETUP.md) - Development environment setup

## 🔐 Demo Credentials

### Admin Account
- **Email**: admin
- **Password**: password123
- **URL**: `/admin`

### Demo Patient Account
- **Email**: patient@demo.com
- **Password**: demo123
- **URL**: `/patient-portal`

## 🛠️ Tech Stack

- **Frontend**: React 18 with TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **State Management**: React Hooks
- **Routing**: React Router v6
- **Data Storage**: Browser localStorage
- **Build Tool**: Vite

## 📋 Available Scripts

```bash
# Development
npm run dev           # Start dev server
npm run dev:fast      # Fast reload without tag processing
npm run dev:server    # Run with Node server

# Production
npm run build         # Build for production
npm run build:fast    # Faster build without sourcemaps
npm run preview       # Preview production build

# Utilities
npm run lint          # Run ESLint
npm test              # Run tests
npm test:watch       # Run tests in watch mode
npm run cache:clean  # Clear Vite and node_modules cache
```

## 📊 Data Storage

All data is stored in browser localStorage for demo purposes:
- Patient accounts
- Patient medical records
- Follow-up tasks
- Consent forms
- Insurance billing records
- Medical reports

**⚠️ Note**: For production, replace localStorage with a proper backend database.

## 🔄 Workflow Examples

### Scenario 1: Create Care Plan for Diabetic Patient
1. Admin: Admin Dashboard → Care Management
2. Select patient
3. Apply "Diabetes Care Template"
4. ✅ Patient automatically receives follow-ups and consent forms

### Scenario 2: Patient Signs Consent Form
1. Patient: Login to portal
2. Go to "Consent Forms" tab
3. Review form content
4. Click "Sign Consent"
5. ✅ Form marked as signed with timestamp

### Scenario 3: Submit Insurance Claim
1. Admin: Care Management → Billing tab
2. Enter claim details and amount
3. Click "Submit Billing"
4. Patient: Can view claim status in portal

## 🐛 Known Limitations

- Data persists only in browser (localStorage)
- No real email/SMS notifications (demo mode)
- No actual insurance API integration (demo forms)
- No file upload for medical reports (URL-based only)
- No real user authentication backend

## 🚀 Future Enhancements

- Backend database integration (MongoDB, PostgreSQL)
- Real email/SMS notifications
- Video consultation features
- Mobile app version
- Advanced analytics and reporting
- AI-powered health recommendations
- Multi-language support
- Real insurance provider integration
- Payment gateway integration

## 🤝 Contributing

This is a demo healthcare platform. For production use, ensure:
- HIPAA compliance
- End-to-end encryption
- Secure authentication (OAuth, JWT)
- Data backup and recovery
- GDPR compliance
- Audit logging
- Regular security audits

## 📄 License

This project is provided as-is for demonstration purposes.

## 📞 Support

For issues or questions:
1. Check the [Features Guide](FEATURES_GUIDE.md)
2. Review [Quick Start](QUICK_START.md)
3. Check browser console for errors (F12)
4. Clear localStorage if data issues: `localStorage.clear()`

---

**Last Updated**: May 14, 2026  
**Version**: 1.0  
**Status**: Production Demo ✅

