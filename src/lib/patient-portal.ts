import { API_CONFIG } from "./config";
import {
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  clearPatientToken,
  dispatchWindowEvent,
  isPatientAuthenticated,
  setPatientToken,
} from "./api";

// NOTE: this used to be a localStorage-backed module. Every collection here
// now lives on the backend so records survive across devices/browsers and
// so a patient's own portal account is a real, password-protected account
// instead of a plaintext object stored in the browser.

export interface PatientRecord {
  id: string;
  patientName: string;
  patientEmail: string;
  patientPhone: string;
  password?: string; // never populated on records returned from the server
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

const createId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// --- Patient portal auth --------------------------------------------------

export const isPatientLoggedIn = (): boolean => isPatientAuthenticated();

export const registerPatient = async (input: {
  name: string;
  email: string;
  phone: string;
  password: string;
  age?: string;
  gender?: string;
  address?: string;
}): Promise<{ success: boolean; patient?: PatientRecord; message?: string }> => {
  try {
    const result = await apiPost<{ success: boolean; token: string; patient: PatientRecord }>("/api/patient/register", {
      patientName: input.name,
      patientEmail: input.email,
      patientPhone: input.phone,
      password: input.password,
      age: input.age,
      gender: input.gender,
      address: input.address,
    });
    setPatientToken(result.token);
    return { success: true, patient: result.patient };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Could not create account." };
  }
};

export const loginPatient = async (
  email: string,
  password: string,
): Promise<{ success: boolean; patient?: PatientRecord; message?: string }> => {
  try {
    const result = await apiPost<{ success: boolean; token: string; patient: PatientRecord }>("/api/patient/login", {
      email,
      password,
    });
    setPatientToken(result.token);
    return { success: true, patient: result.patient };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Invalid email or password." };
  }
};

export const logoutPatient = (): void => {
  clearPatientToken();
};

export const getCurrentPatient = async (): Promise<PatientRecord | null> => {
  try {
    const result = await apiGet<{ success: boolean; patient: PatientRecord }>("/api/patient/me", "patient");
    return result.patient;
  } catch {
    return null;
  }
};

// --- Patient portal records (admin-side directory, read-only) ------------

export const getPatientPortalRecords = (): Promise<PatientRecord[]> => apiGet<PatientRecord[]>("/api/data/portal-patients", "admin");

// --- Follow-up Management --------------------------------------------------

export const getFollowUps = (): Promise<FollowUp[]> => apiGet<FollowUp[]>("/api/data/follow-ups", "admin");

export const getMyFollowUps = (): Promise<FollowUp[]> => apiGet<FollowUp[]>("/api/data/follow-ups", "patient");

export const createFollowUp = async (followUp: Omit<FollowUp, "id">): Promise<FollowUp> => {
  const current = await getFollowUps();
  const newFollowUp: FollowUp = { ...followUp, id: createId("followup") };
  await apiPut("/api/data/follow-ups", [...current, newFollowUp], "admin");
  dispatchWindowEvent("followUpUpdated");
  return newFollowUp;
};

export const updateFollowUp = async (id: string, updates: Partial<FollowUp>): Promise<FollowUp | null> => {
  const current = await getFollowUps();
  const index = current.findIndex((item) => item.id === id);
  if (index === -1) return null;
  const next = [...current];
  next[index] = { ...next[index], ...updates };
  await apiPut("/api/data/follow-ups", next, "admin");
  dispatchWindowEvent("followUpUpdated");
  return next[index];
};

export const markMyFollowUpComplete = async (id: string): Promise<void> => {
  await apiPatch(`/api/patient/follow-ups/${id}`, { status: "completed", completedDate: new Date().toISOString() }, "patient");
  dispatchWindowEvent("followUpUpdated");
};

// --- Consent Forms Management ----------------------------------------------

export const getConsentForms = (): Promise<ConsentForm[]> => apiGet<ConsentForm[]>("/api/data/consent-forms", "admin");

export const getMyConsentForms = (): Promise<ConsentForm[]> => apiGet<ConsentForm[]>("/api/data/consent-forms", "patient");

export const createConsentForm = async (form: Omit<ConsentForm, "id">): Promise<ConsentForm> => {
  const current = await getConsentForms();
  const newForm: ConsentForm = { ...form, id: createId("consent") };
  await apiPut("/api/data/consent-forms", [...current, newForm], "admin");
  dispatchWindowEvent("consentFormUpdated");
  return newForm;
};

export const signMyConsentForm = async (id: string): Promise<void> => {
  await apiPost(`/api/patient/consent-forms/${id}/sign`, {}, "patient");
  dispatchWindowEvent("consentFormUpdated");
};

// --- Insurance Billing Management -------------------------------------------

export const getInsuranceBillings = (): Promise<InsuranceBilling[]> => apiGet<InsuranceBilling[]>("/api/data/insurance-billings", "admin");

export const getMyInsuranceBillings = (): Promise<InsuranceBilling[]> => apiGet<InsuranceBilling[]>("/api/data/insurance-billings", "patient");

export const createInsuranceBilling = async (billing: Omit<InsuranceBilling, "id">): Promise<InsuranceBilling> => {
  const current = await getInsuranceBillings();
  const newBilling: InsuranceBilling = { ...billing, id: createId("billing") };
  await apiPut("/api/data/insurance-billings", [...current, newBilling], "admin");
  dispatchWindowEvent("insuranceBillingUpdated");
  return newBilling;
};

// --- Medical Reports Management ----------------------------------------------

export const getMedicalReports = (): Promise<MedicalReport[]> => apiGet<MedicalReport[]>("/api/data/medical-reports", "admin");

export const getMyMedicalReports = (): Promise<MedicalReport[]> => apiGet<MedicalReport[]>("/api/data/medical-reports", "patient");

export const createMedicalReport = async (report: Omit<MedicalReport, "id">): Promise<MedicalReport> => {
  const current = await getMedicalReports();
  const newReport: MedicalReport = { ...report, id: createId("report") };
  await apiPut("/api/data/medical-reports", [...current, newReport], "admin");
  dispatchWindowEvent("medicalReportUpdated");
  return newReport;
};

// --- Notifications (admin-triggered) -----------------------------------------

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
}): Promise<SendNotificationResult> => {
  try {
    const result = await apiPost<any>(API_CONFIG.endpoints.followup, payload, "admin");
    return {
      success: Boolean(result?.success),
      message: result?.message || "Follow-up email notification processed.",
      pdfUrl: result?.pdfUrl || result?.followUpPdf?.publicUrl || result?.followUpPdf?.localUrl,
    };
  } catch (error) {
    console.error("Follow-up email send error:", error);
    return { success: false, message: error instanceof Error ? error.message : "Could not send follow-up email." };
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
}): Promise<SendNotificationResult> => {
  try {
    const result = await apiPost<any>(API_CONFIG.endpoints.report, payload, "admin");
    return {
      success: Boolean(result?.success),
      message: result?.message || "Medical report email notification processed.",
      pdfUrl: result?.pdfUrl || result?.reportPdf?.publicUrl || result?.reportPdf?.localUrl,
    };
  } catch (error) {
    console.error("Medical report email send error:", error);
    return { success: false, message: error instanceof Error ? error.message : "Could not send medical report email." };
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
}): Promise<SendNotificationResult> => {
  try {
    const result = await apiPost<any>(API_CONFIG.endpoints.billing, payload, "admin");
    return {
      success: Boolean(result?.success),
      message: result?.message || "Billing email notification processed.",
      pdfUrl: result?.pdfUrl || result?.billingPdf?.publicUrl || result?.billingPdf?.localUrl,
    };
  } catch (error) {
    console.error("Billing email send error:", error);
    return { success: false, message: error instanceof Error ? error.message : "Could not send billing email." };
  }
};

// --- Patient Templates (static reference data, unchanged) --------------------

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
