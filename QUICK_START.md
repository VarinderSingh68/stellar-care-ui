# Quick Start Guide - New Healthcare Features

## 🚀 Getting Started with New Features

### Step 1: Access the Patient Portal
1. Open your app and look for "Patient Portal" button in the navbar
2. Click it to go to `/patient-portal`
3. You'll see Login and Register tabs

### Step 2: Create a Patient Account
1. Click on **Register** tab
2. Fill in the registration form:
   - Full Name
   - Email
   - Phone Number
   - Age
   - Gender
   - Address
   - Create a password
3. Click **Create Account**
4. You'll be automatically logged in and taken to your dashboard

**Demo Account** (pre-created):
- Email: `patient@demo.com`
- Password: `demo123`

### Step 3: Admin Creates Care Plan
1. Login to **Admin Dashboard** (admin/password123)
2. Click **"Care Management"** tab
3. Select a patient from dropdown
4. Choose one of these options:

#### Option A: Quick Apply Template
- Scroll to bottom → "Apply Care Templates"
- Select a template (Diabetes, Pregnancy, Cardiology)
- Click "Apply Template"
- ✅ Done! Patient now has follow-ups and consent forms

#### Option B: Manual Care Management
Go to the tabs and add:

**Follow-ups Tab**:
- Add medication reminders, tests, exercises, diet plans
- Set due dates and descriptions

**Consent Forms Tab**:
- Create treatment/surgery/procedure consent forms
- Patient must sign before treatment

**Reports Tab**:
- Add medical test results
- Lab reports, X-rays, ECG, etc.

**Billing Tab**:
- Submit insurance claims
- Track claim status (submitted → approved → paid)

### Step 4: Patient Views Their Care Plan
1. Patient logs into portal
2. Dashboard shows:
   - **Follow-ups**: Tasks to complete (medicine, tests, appointments)
   - **Consent Forms**: Forms to sign (appears as "Pending" until signed)
   - **Reports**: Medical reports from doctor
   - **Billing**: Insurance claim status

---

## 📋 Feature Examples

### Scenario 1: Diabetic Patient Care
**Admin does this:**
1. Select patient
2. Click "Apply Care Templates"
3. Select "Diabetes Care Template"
4. Click "Apply Template"

**Patient automatically receives:**
- ✓ Blood sugar monitoring reminder
- ✓ Daily medication reminder
- ✓ Monthly HbA1c test
- ✓ Exercise routine
- ✓ Diet guidelines
- ✓ Diabetes treatment consent form to sign

### Scenario 2: Post-Surgery Patient
**Admin does this:**
1. Select patient
2. Go to "Consent Forms" tab
3. Select form type: "Surgery"
4. Enter consent text
5. Create form
6. Later: Add pain medication as follow-up
7. Add surgery report as medical report

**Patient sees:**
- Consent form to review and sign
- Medication reminder
- Surgery report in medical reports

---

## 🎯 Common Tasks

### Create a Follow-up Reminder
1. Admin Dashboard → Care Management
2. Select patient
3. Click "Follow-ups" tab
4. Enter task details:
   - Title: "Take Lisinopril 10mg"
   - Description: "Once daily with breakfast"
   - Type: "Medication"
   - Due Date: Tomorrow
5. Click "Create Follow-up"

### Get Patient to Sign Consent
1. Admin Dashboard → Care Management
2. Select patient
3. Click "Consent Forms" tab
4. Enter form details:
   - Type: "Treatment" / "Surgery" / etc.
   - Title: "Heart Surgery Consent"
   - Content: "I agree to the proposed heart surgery..."
5. Click "Create Consent Form"
6. Patient receives in their portal
7. Patient reviews and clicks "Sign Consent"

### Submit Insurance Claim
1. Admin Dashboard → Care Management
2. Select patient
3. Click "Billing" tab
4. Enter claim details:
   - Claim ID: "CLM-2024-001"
   - Insurance: "HDFC Insurance"
   - Amount: "50000"
5. Click "Submit Billing"
6. Patient can see status in their billing tab

### Add Lab Report
1. Admin Dashboard → Care Management
2. Select patient
3. Click "Reports" tab
4. Enter report details:
   - Report Type: "Blood Test"
   - Title: "Complete Blood Count"
   - Description: "All values normal"
5. Click "Add Report"
6. Patient can see report in their portal

---

## 📱 Patient Portal Dashboard

### Tab 1: Follow-ups
- Shows all assigned tasks
- Status: Pending | Completed | Missed
- Can mark as "Mark Complete"
- Shows due dates and descriptions

### Tab 2: Consent Forms
- Shows all forms pending signature
- Form type badge (Treatment/Surgery/etc.)
- "Sign Consent" button for unsigned forms
- Shows signature date when signed

### Tab 3: Medical Reports
- Lab reports, test results
- Download option for files
- Report type and date
- Search and filter

### Tab 4: Billing
- Insurance claim tracking
- Shows claim status
- Insurance provider and amount
- Submission date

---

## 🔑 Key Features Comparison

| Feature | Before | Now |
|---------|--------|-----|
| Patient Account | ❌ | ✅ Personal portal |
| Follow-ups | ❌ | ✅ Auto reminders |
| Consent Forms | ❌ | ✅ Digital signing |
| Medical Records | ❌ | ✅ Portal access |
| Insurance Tracking | ❌ | ✅ Claim tracking |
| Care Templates | ❌ | ✅ Pre-configured |

---

## 🛠️ Technical Details

### New Files Created
```
src/
├── pages/
│   ├── PatientPortalLoginPage.tsx
│   ├── PatientPortalDashboard.tsx
├── components/
│   └── AdminPatientManagement.tsx
└── lib/
    └── patient-portal.ts
```

### New Routes
- `/patient-portal` - Patient login
- `/patient-portal/dashboard` - Patient dashboard

### Data Storage
All data stored in browser localStorage:
- Patient accounts
- Follow-ups
- Consent forms
- Medical reports
- Insurance claims

---

## ⚙️ Configuration

### Customize Templates
Edit `src/lib/patient-portal.ts`:

```typescript
const PATIENT_TEMPLATES = [
  {
    id: "template-mycondition",
    name: "My Condition",
    category: "general",
    followUpItems: [
      {
        title: "Task 1",
        description: "Do this...",
        type: "medication",
        dueDate: "2024-05-20",
      },
    ],
  },
];
```

### Add New Consent Form Types
In `AdminPatientManagement.tsx`, update form type select:

```tsx
<option value="newtype">New Type</option>
```

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| Patient can't login | Check email/password match registration |
| Follow-ups not showing | Admin must create them first |
| Consent form won't sign | Try refreshing browser |
| Data disappeared | localStorage was cleared - re-enter |
| Patient not in dropdown | Register patient account first |

---

## 📞 Support

1. Clear browser cache: `Ctrl+Shift+Delete`
2. Reset data: Go to Console → `localStorage.clear()`
3. Check browser console for errors: `F12`
4. Contact support with screenshot of error

---

**Version**: 1.0  
**Last Updated**: May 14, 2026  
**Status**: Ready to Use ✅
