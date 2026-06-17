export interface AdminPatient {
  id: string;
  name: string;
  visitDate?: string;
  gender?: string;
  age?: string;
  suffering: string;
  email?: string;
  phone?: string;
  address?: string;
  prescription: string;
  prescriptionDate: string;
  prescriptionSentAt?: string;
  totalFees?: string;
  amountPaid?: string;
  paymentStatus?: "unpaid" | "partial" | "paid";
  nextAppointmentDate?: string;
  notes?: string;
}

export interface AdminMediaItem {
  id: string;
  title: string;
  url: string;
  type: "image" | "video";
}

export type AppointmentStatus = "scheduled" | "waiting" | "completed" | "cancelled" | "missed";

export interface AdminAppointment {
  id: string;
  patientId?: string;
  patientName: string;
  patientEmail?: string;
  patientPhone?: string;
  date: string;
  time: string;
  durationMinutes: number;
  reason: string;
  status: AppointmentStatus;
  notes?: string;
  createdAt: string;
}

export interface TreatmentPlan {
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  diagnosis: string;
  estimatedCost?: string;
  totalSessions: number;
  completedSessions: number;
  nextStep: string;
  status: "planned" | "in-progress" | "completed" | "on-hold";
  createdAt: string;
}

export interface ClinicalNote {
  id: string;
  patientId: string;
  patientName: string;
  visitDate: string;
  symptoms: string;
  diagnosis: string;
  allergies?: string;
  medicalHistory?: string;
  doctorNotes?: string;
  createdAt: string;
}

export interface StaffMember {
  id: string;
  name: string;
  role: "doctor" | "receptionist" | "assistant";
  email?: string;
  phone?: string;
  active: boolean;
  permissions: string[];
  createdAt: string;
}

export interface ClinicSettings {
  clinicName: string;
  doctorName: string;
  phone: string;
  whatsappNumber: string;
  email: string;
  address: string;
  openingTime: string;
  closingTime: string;
  workingDays: string[];
  prescriptionFooter: string;
  reminderLeadHours: string;
}

export interface AdminCredentials {
  username: string;
  password: string;
}

export interface PrescriptionEmailPayload {
  patientName: string;
  patientEmail?: string;
  patientPhone?: string;
  gender?: string;
  age?: string;
  address?: string;
  suffering: string;
  prescription: string;
  prescriptionDate: string;
  visitDate?: string;
  totalFees?: string;
  amountPaid?: string;
  paymentStatus?: AdminPatient["paymentStatus"];
  nextAppointmentDate?: string;
  notes?: string;
}

export interface PrescriptionEmailResult {
  success: boolean;
  message: string;
  prescriptionPdf?: {
    filename: string;
    localUrl: string;
    publicUrl?: string;
  };
}

const PATIENTS_KEY = "cardiovita.admin.patients";
const MEDIA_KEY = "cardiovita.admin.media";
const AUTH_KEY = "cardiovita.admin.auth";
const APPOINTMENTS_KEY = "cardiovita.admin.appointments";
const TREATMENT_PLANS_KEY = "cardiovita.admin.treatment-plans";
const CLINICAL_NOTES_KEY = "cardiovita.admin.clinical-notes";
const STAFF_KEY = "cardiovita.admin.staff";
const SETTINGS_KEY = "cardiovita.admin.settings";
const CREDENTIALS_KEY = "cardiovita.admin.credentials";

export const ADMIN_USERNAME = "admin";
export const ADMIN_PASSWORD = "password123";

export const DEFAULT_CLINIC_SETTINGS: ClinicSettings = {
  clinicName: "Dr. Rana Dental Clinic",
  doctorName: "Dr. Rana",
  phone: "",
  whatsappNumber: "",
  email: "",
  address: "New Mata Gujri Enclave, Janta Nagar, Kharar",
  openingTime: "10:00",
  closingTime: "19:00",
  workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  prescriptionFooter: "Please follow the prescription as advised and contact the clinic for any urgent concern.",
  reminderLeadHours: "24",
};

const readJson = <T>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = <T>(key: string, value: T, eventName?: string) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
  if (eventName) {
    window.dispatchEvent(new Event(eventName));
  }
};

export const getPatients = (): AdminPatient[] => {
  return readJson<AdminPatient[]>(PATIENTS_KEY, []);
};

export const setPatients = (patients: AdminPatient[]) => {
  writeJson(PATIENTS_KEY, patients, "patientsUpdated");
};

export const getMediaItems = (): AdminMediaItem[] => {
  return readJson<AdminMediaItem[]>(MEDIA_KEY, []);
};

export const setMediaItems = (media: AdminMediaItem[]) => {
  writeJson(MEDIA_KEY, media, "mediaUpdated");
};

export const getAppointments = (): AdminAppointment[] => {
  return readJson<AdminAppointment[]>(APPOINTMENTS_KEY, []);
};

export const setAppointments = (appointments: AdminAppointment[]) => {
  writeJson(APPOINTMENTS_KEY, appointments, "appointmentsUpdated");
};

export const getTreatmentPlans = (): TreatmentPlan[] => {
  return readJson<TreatmentPlan[]>(TREATMENT_PLANS_KEY, []);
};

export const setTreatmentPlans = (plans: TreatmentPlan[]) => {
  writeJson(TREATMENT_PLANS_KEY, plans, "treatmentPlansUpdated");
};

export const getClinicalNotes = (): ClinicalNote[] => {
  return readJson<ClinicalNote[]>(CLINICAL_NOTES_KEY, []);
};

export const setClinicalNotes = (notes: ClinicalNote[]) => {
  writeJson(CLINICAL_NOTES_KEY, notes, "clinicalNotesUpdated");
};

export const getStaffMembers = (): StaffMember[] => {
  return readJson<StaffMember[]>(STAFF_KEY, []);
};

export const setStaffMembers = (staff: StaffMember[]) => {
  writeJson(STAFF_KEY, staff, "staffUpdated");
};

export const getClinicSettings = (): ClinicSettings => {
  return {
    ...DEFAULT_CLINIC_SETTINGS,
    ...readJson<Partial<ClinicSettings>>(SETTINGS_KEY, {}),
  };
};

export const setClinicSettings = (settings: ClinicSettings) => {
  writeJson(SETTINGS_KEY, settings, "clinicSettingsUpdated");
};

export const getAdminCredentials = (): AdminCredentials => {
  return readJson<AdminCredentials>(CREDENTIALS_KEY, {
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
  });
};

export const setAdminCredentials = (credentials: AdminCredentials) => {
  writeJson(CREDENTIALS_KEY, credentials, "adminCredentialsUpdated");
};

export const isAdminLoggedIn = () => {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(AUTH_KEY) === "true";
};

export const loginAdmin = (username: string, password: string) => {
  const credentials = getAdminCredentials();
  if (username === credentials.username && password === credentials.password) {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(AUTH_KEY, "true");
    }
    return true;
  }
  return false;
};

export const logoutAdmin = () => {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(AUTH_KEY);
  }
};

export const sendPrescriptionEmail = async (
  payload: PrescriptionEmailPayload,
): Promise<PrescriptionEmailResult> => {
  try {
    const response = await fetch("http://localhost:5000/api/send-prescription", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => null);

    if (response.ok && result?.success !== false) {
      return {
        success: true,
        message: result?.message || "Prescription notification sent successfully.",
        prescriptionPdf: result?.prescriptionPdf,
      };
    }

    return {
      success: false,
      message: result?.message || "Patient record saved, but prescription notification failed.",
    };
  } catch (error) {
    console.error("Prescription notification send error:", error);
    return { success: false, message: "Patient record saved, but could not reach notification server." };
  }
};
