# WATI WhatsApp Setup

Follow this in order. Do not worry about everything at once.

## Current Simple Mode

For now, WATI is not required for prescriptions.

When you click `Send prescription` in the admin panel:

1. The prescription PDF is emailed to the patient.
2. The PDF opens in a new browser tab.
3. WhatsApp opens with the selected patient's number.
4. Attach the opened PDF in WhatsApp and send it manually.

## Already Done

These are already added in your local `.env`:

- WATI API endpoint
- WATI access token
- WATI channel number
- temporary contact number

Do not share `.env`. It contains private credentials.

## Part 1: Appointment WhatsApp Message

This is the easiest one. Do this first.

1. Open WATI.
2. Go to `Campaign` or `Campaigns`.
3. Open `Template Messages`.
4. Open `Your Templates`.
5. Click `New Template Message`.
6. Template name:

```text
appointment_confirmation
```

7. Category: choose `Utility`.
8. Language: choose `English`.
9. Header: choose `None`.
10. Body:

```text
Hello {{name}}, thank you for choosing Dr. Rana Dental Clinic. Your dental appointment has been scheduled successfully.

Your appointment details are:
Date: {{date}}
Time: {{time}}

Please arrive 10 minutes before your appointment time. If you need help or want to reschedule, please call us at {{clinic_phone}}.
```

11. The body variables are only:

```text
{{name}}
{{date}}
{{time}}
{{clinic_phone}}
```

12. Footer: optional, you can leave it blank.
13. Buttons: optional, you can leave it blank.
14. Click `Save and submit`.
15. Wait until WATI shows the template as `Approved`.

When this is approved, appointment booking WhatsApp can work.

## Part 2: Prescription WhatsApp PDF

Do this after Part 1.

1. Open WATI.
2. Go to `Campaign` or `Campaigns`.
3. Open `Template Messages`.
4. Open `Your Templates`.
5. Click `New Template Message`.
6. Template name:

```text
prescription_pdf
```

7. Category: choose `Utility`.
8. Language: choose `English`.
9. Header: choose `Media`.
10. Media type: choose `Document` or `PDF`.
11. In the document URL/header variable field, use:

```text
{{pdfLink}}
```

12. Body:

```text
Hello {{name}}, your prescription from Dr. Rana Dental Clinic is ready. Please open the attached PDF document and follow the instructions shared by the doctor.

If you have any questions or need help, please call us at {{clinic_phone}}.
```

13. The body variables are only:

```text
{{name}}
{{clinic_phone}}
```

14. The PDF/header variable is:

```text
{{pdfLink}}
```

15. Footer: optional, you can leave it blank.
16. Buttons: optional, you can leave it blank.
17. Click `Save and submit`.
18. Wait until WATI shows the template as `Approved`.

## Part 3: PUBLIC_APP_URL

Only prescription PDF needs this.

Why: WATI must download the PDF from a public HTTPS link before it can send it on WhatsApp.

For local testing, use ngrok:

1. Start backend:

```bash
npm run email-server
```

2. In another terminal, run:

```bash
ngrok http 5000
```

3. Ngrok will show an HTTPS URL like:

```text
https://abc123.ngrok-free.app
```

4. Put that URL in `.env`:

```text
PUBLIC_APP_URL=https://abc123.ngrok-free.app
```

5. Restart backend:

```bash
npm run email-server
```

If you do not have ngrok installed, install it from:

```text
https://ngrok.com/download
```

## Part 4: Run Everything

Backend:

```bash
npm run email-server
```

Frontend:

```bash
npm run dev
```

## Quick Check

Use this order:

1. Approve `appointment_confirmation`.
2. Test appointment booking.
3. Approve `prescription_pdf`.
4. Add `PUBLIC_APP_URL`.
5. Test prescription sending.

Appointment messages do not need `PUBLIC_APP_URL`.

Prescription PDF messages need `PUBLIC_APP_URL`.
