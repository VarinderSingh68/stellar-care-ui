export interface PatientRecord {
  id: string;
  patientName: string;
  patientEmail: string;
  patientPhone: string;
  password?: string;
  gender?: string;
  age?: string;
  address?: string;
  medicalHistory?: string;
  emergencyContact?: string;
}

export interface FollowUp {
  id: string;
  patientId: string;
  title: string;
  description: string;
  dueDate: string;
  type: "medication" | "test" | "appointment" | "exercise" | "diet";
  status: "pending" | "completed" | "missed";
  createdDate: string;
  completedDate?: string;
}

export interface ConsentForm {
  id: string;
  patientId: string;
  patientName: string;
  patientEmail: string;
  formType: "treatment" | "surgery" | "procedure" | "research" | "imaging";
  title: string;
  content: string;
  signatureDate?: string;
  isSigned: boolean;
  createdDate: string;
}

export interface InsuranceBilling {
  id: string;
  patientId: string;
  claimId: string;
  insuranceProvider: string;
  policyNumber: string;
  treatmentDate: string;
  amount: number;
  status: "submitted" | "processing" | "approved" | "rejected" | "paid";
  submissionDate: string;
  approvalDate?: string;
  notes?: string;
}

export interface MedicalReport {
  id: string;
  patientId: string;
  reportType: string;
  title: string;
  date: string;
  fileUrl?: string;
  description?: string;
}

export interface PatientTemplate {
  id: string;
  name: string;
  category: "diabetes" | "pregnancy" | "hypertension" | "cardiology" | "orthopedic" | "general";
  followUpItems: Omit<FollowUp, "id" | "patientId" | "createdDate" | "status" | "completedDate">[];
  consentForms: Omit<ConsentForm, "id" | "patientId" | "patientName" | "patientEmail" | "signatureDate" | "isSigned" | "createdDate">[];
}

const PATIENT_PORTAL_KEY = "cardiovita.patient-portal";
const FOLLOW_UPS_KEY = "cardiovita.follow-ups";
const CONSENT_FORMS_KEY = "cardiovita.consent-forms";
const INSURANCE_BILLING_KEY = "cardiovita.insurance-billing";
const MEDICAL_REPORTS_KEY = "cardiovita.medical-reports";

// Patient Portal Management
export const getPatientPortalRecords = (): PatientRecord[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PATIENT_PORTAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const setPatientPortalRecords = (records: PatientRecord[]) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(PATIENT_PORTAL_KEY, JSON.stringify(records));
};

export const getPatientByEmail = (email: string): PatientRecord | null => {
  const records = getPatientPortalRecords();
  return records.find((p) => p.patientEmail === email.toLowerCase()) || null;
};

export const createPatientRecord = (patient: PatientRecord) => {
  const records = getPatientPortalRecords();
  const newRecord = {
    ...patient,
    id: `patient-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
  records.push(newRecord);
  setPatientPortalRecords(records);
  return newRecord;
};

// Follow-up Management
export const getFollowUps = (): FollowUp[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FOLLOW_UPS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const setFollowUps = (followUps: FollowUp[]) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(FOLLOW_UPS_KEY, JSON.stringify(followUps));
  window.dispatchEvent(new Event("followUpUpdated"));
};

export const getFollowUpsByPatientId = (patientId: string): FollowUp[] => {
  return getFollowUps().filter((f) => f.patientId === patientId);
};

export const createFollowUp = (followUp: Omit<FollowUp, "id">) => {
  const followUps = getFollowUps();
  const newFollowUp: FollowUp = {
    ...followUp,
    id: `followup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
  followUps.push(newFollowUp);
  setFollowUps(followUps);
  return newFollowUp;
};

export const updateFollowUp = (id: string, updates: Partial<FollowUp>) => {
  const followUps = getFollowUps();
  const index = followUps.findIndex((f) => f.id === id);
  if (index !== -1) {
    followUps[index] = { ...followUps[index], ...updates };
    setFollowUps(followUps);
    return followUps[index];
  }
  return null;
};

// Consent Forms Management
export const getConsentForms = (): ConsentForm[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CONSENT_FORMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const setConsentForms = (forms: ConsentForm[]) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONSENT_FORMS_KEY, JSON.stringify(forms));
  window.dispatchEvent(new Event("consentFormUpdated"));
};

export const getConsentFormsByPatientId = (patientId: string): ConsentForm[] => {
  return getConsentForms().filter((f) => f.patientId === patientId);
};

export const createConsentForm = (form: Omit<ConsentForm, "id">) => {
  const forms = getConsentForms();
  const newForm: ConsentForm = {
    ...form,
    id: `consent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
  forms.push(newForm);
  setConsentForms(forms);
  return newForm;
};

export const signConsentForm = (id: string) => {
  const forms = getConsentForms();
  const index = forms.findIndex((f) => f.id === id);
  if (index !== -1) {
    forms[index] = {
      ...forms[index],
      isSigned: true,
      signatureDate: new Date().toISOString(),
    };
    setConsentForms(forms);
    return forms[index];
  }
  return null;
};

// Insurance Billing Management
export const getInsuranceBillings = (): InsuranceBilling[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(INSURANCE_BILLING_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const setInsuranceBillings = (billings: InsuranceBilling[]) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(INSURANCE_BILLING_KEY, JSON.stringify(billings));
  window.dispatchEvent(new Event("insuranceBillingUpdated"));
};

export const getInsuranceBillingsByPatientId = (patientId: string): InsuranceBilling[] => {
  return getInsuranceBillings().filter((b) => b.patientId === patientId);
};

export const createInsuranceBilling = (billing: Omit<InsuranceBilling, "id">) => {
  const billings = getInsuranceBillings();
  const newBilling: InsuranceBilling = {
    ...billing,
    id: `billing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
  billings.push(newBilling);
  setInsuranceBillings(billings);
  return newBilling;
};

// Medical Reports Management
export const getMedicalReports = (): MedicalReport[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(MEDICAL_REPORTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const setMedicalReports = (reports: MedicalReport[]) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(MEDICAL_REPORTS_KEY, JSON.stringify(reports));
};

export const getMedicalReportsByPatientId = (patientId: string): MedicalReport[] => {
  return getMedicalReports().filter((r) => r.patientId === patientId);
};

export const createMedicalReport = (report: Omit<MedicalReport, "id">) => {
  const reports = getMedicalReports();
  const newReport: MedicalReport = {
    ...report,
    id: `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
  reports.push(newReport);
  setMedicalReports(reports);
  return newReport;
};

export interface SendNotificationResult {
  success: boolean;
  message: string;
  pdfUrl?: string;
}

export const sendFollowUpEmail = async (payload: {
  patientName: string;
  patientEmail: string;
  patientPhone?: string;
  title: string;
  description: string;
  dueDate: string;
  type: string;
}) => {
  try {
    const response = await fetch("http://localhost:5000/api/send-followup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => null);
    const success = response.ok && (result?.success ?? true);
    const message = result?.message
      || (response.ok ? "Follow-up email notification processed." : `Follow-up email request failed (${response.status} ${response.statusText}).`);
    return {
      success,
      message,
      pdfUrl:
        result?.pdfUrl || result?.followUpPdf?.publicUrl || result?.followUpPdf?.localUrl,
    } as SendNotificationResult;
  } catch (error) {
    console.error("Follow-up email send error:", error);
    return { success: false, message: "Could not send follow-up email. Please check the email server." };
  }
};

export const sendReportEmail = async (payload: {
  patientName: string;
  patientEmail: string;
  patientPhone?: string;
  reportType: string;
  title: string;
  description?: string;
  date: string;
}) => {
  try {
    const response = await fetch("http://localhost:5000/api/send-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => null);
    const success = response.ok && (result?.success ?? true);
    const message = result?.message
      || (response.ok ? "Medical report email notification processed." : `Medical report request failed (${response.status} ${response.statusText}).`);
    return {
      success,
      message,
      pdfUrl:
        result?.pdfUrl || result?.reportPdf?.publicUrl || result?.reportPdf?.localUrl,
    } as SendNotificationResult;
  } catch (error) {
    console.error("Medical report email send error:", error);
    return { success: false, message: "Could not send medical report email. Please check the email server." };
  }
};

export const sendBillingEmail = async (payload: {
  patientName: string;
  patientEmail: string;
  patientPhone?: string;
  claimId: string;
  insuranceProvider: string;
  policyNumber?: string;
  treatmentDate: string;
  amount: number;
  status: string;
  notes?: string;
  submissionDate: string;
}) => {
  try {
    const response = await fetch("http://localhost:5000/api/send-billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => null);
    const success = response.ok && (result?.success ?? true);
    const message = result?.message
      || (response.ok ? "Billing email notification processed." : `Billing request failed (${response.status} ${response.statusText}).`);
    return {
      success,
      message,
      pdfUrl:
        result?.pdfUrl || result?.billingPdf?.publicUrl || result?.billingPdf?.localUrl,
    } as SendNotificationResult;
  } catch (error) {
    console.error("Billing email send error:", error);
    return { success: false, message: "Could not send billing email. Please check the email server." };
  }
};

// Patient Templates
export const PATIENT_TEMPLATES: PatientTemplate[] = [
  {
    id: "template-diabetes",
    name: "Diabetes Care Template",
    category: "diabetes",
    followUpItems: [
      {
        title: "Blood Sugar Monitoring",
        description: "Check blood sugar levels before meals and at bedtime",
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        type: "test",
      },
      {
        title: "Take Diabetes Medication",
        description: "Take prescribed diabetes medication with meals",
        dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        type: "medication",
      },
      {
        title: "HbA1c Test",
        description: "Schedule HbA1c test (every 3 months)",
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        type: "test",
      },
      {
        title: "Exercise Routine",
        description: "30 minutes of moderate exercise daily",
        dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        type: "exercise",
      },
      {
        title: "Dietary Guidelines",
        description: "Follow low-sugar, high-fiber diet",
        dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        type: "diet",
      },
    ],
    consentForms: [
      {
        formType: "treatment",
        title: "Diabetes Treatment Consent",
        content: "I consent to the proposed diabetes treatment plan including medication and lifestyle modifications.",
      },
    ],
  },
  {
    id: "template-pregnancy",
    name: "Pregnancy Tracking Template",
    category: "pregnancy",
    followUpItems: [
      {
        title: "Prenatal Vitamins",
        description: "Take prenatal vitamins with folic acid daily",
        dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        type: "medication",
      },
      {
        title: "Ultrasound Scan",
        description: "Schedule routine ultrasound",
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        type: "test",
      },
      {
        title: "Blood Pressure Check",
        description: "Monitor blood pressure regularly",
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        type: "test",
      },
      {
        title: "Prenatal Appointment",
        description: "Schedule next prenatal checkup",
        dueDate: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        type: "appointment",
      },
    ],
    consentForms: [
      {
        formType: "procedure",
        title: "Pregnancy Care Consent",
        content: "I consent to prenatal care including routine tests and procedures necessary for the health of the mother and baby.",
      },
    ],
  },
  {
    id: "template-cardiology",
    name: "Cardiology Care Template",
    category: "cardiology",
    followUpItems: [
      {
        title: "Blood Pressure Monitoring",
        description: "Check blood pressure twice daily",
        dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        type: "test",
      },
      {
        title: "Cardiac Medication",
        description: "Take prescribed cardiac medications",
        dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        type: "medication",
      },
      {
        title: "ECG Test",
        description: "Schedule ECG test",
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        type: "test",
      },
    ],
    consentForms: [
      {
        formType: "treatment",
        title: "Cardiac Treatment Consent",
        content: "I consent to cardiac treatment and monitoring as recommended by my cardiologist.",
      },
    ],
  },
];
