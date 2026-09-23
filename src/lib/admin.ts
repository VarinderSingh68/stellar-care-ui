import { API_CONFIG } from "./config";
import { apiGet, apiPost, apiPut, clearAdminToken, dispatchWindowEvent, isAdminAuthenticated, setAdminToken } from "./api";

// NOTE: this used to be a localStorage-backed module -- every collection
// below now lives on the backend (see email-server.cjs + server/store.cjs)
// so data is shared across every visitor/device instead of being trapped in
// one admin's browser. Reads are now async (they hit the network), which is
// why every component that uses this module goes through react-query.

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
  appointmentDate: string;
  appointmentTime: string;
  durationMinutes?: number;
  reason: string;
  status?: AppointmentStatus;
  notes?: string;
  bookingDate: string;
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

export const DEFAULT_CLINIC_SETTINGS: ClinicSettings = {
  clinicName: "Dr. Rana Dental Clinic",
  doctorName: "Dr. Rana",
  phone: "090414 81946",
  whatsappNumber: "",
  email: "",
  address: "New Mata Gujri Enclave, Gurudwara Sahib Road, Janta Nagar, Mundi Kharar, Kharar, Punjab 140301",
  openingTime: "10:00",
  closingTime: "19:00",
  workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  prescriptionFooter: "Please follow the prescription as advised and contact the clinic for any urgent concern.",
  reminderLeadHours: "24",
};

// --- Patients ---------------------------------------------------------

export const getPatients = (): Promise<AdminPatient[]> => apiGet<AdminPatient[]>("/api/data/patients", "admin");

export const setPatients = async (patients: AdminPatient[]): Promise<void> => {
  await apiPut("/api/data/patients", patients, "admin");
  dispatchWindowEvent("patientsUpdated");
};

// --- Media (public read so every visitor sees it, admin-only write) ---

export const getMediaItems = (): Promise<AdminMediaItem[]> => apiGet<AdminMediaItem[]>("/api/media");

export const setMediaItems = async (media: AdminMediaItem[]): Promise<void> => {
  await apiPut("/api/data/media", media, "admin");
  dispatchWindowEvent("mediaUpdated");
};

// Media uploaded through /api/admin/media-upload comes back as a path
// relative to the API server (e.g. "/uploads/media/xyz.png"). The frontend
// and API are separate Render services with different origins, so any
// relative URL needs the API's base URL prefixed before it can be used in
// an <img>/<video> src. A URL the admin pasted in directly (http/https) is
// left untouched.
export const resolveMediaUrl = (url: string): string => {
  if (!url) return url;
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;
  const base = API_CONFIG.baseUrl?.replace(/\/+$/, "") || "";
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
};

export const uploadMediaFile = async (file: File): Promise<{ url: string }> => {
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("Could not read file."));
    reader.readAsDataURL(file);
  });

  return apiPost<{ success: boolean; url: string }>(
    "/api/admin/media-upload",
    { contentType: file.type, dataBase64 },
    "admin",
  );
};

// --- Bookings / appointments -------------------------------------------

// Raw shape of a booking record as email-server.cjs's JSON store returns it
// (see the `appointment` object built in its /api/send-booking and
// /api/appointments handlers) -- looser than AdminAppointment since older
// records on disk may be missing fields that newer code always sets.
interface RawBooking {
  id: string;
  patientId?: string;
  patientName: string;
  patientEmail?: string;
  patientPhone?: string;
  appointmentDate: string;
  appointmentTime: string;
  reason: string;
  notes?: string;
  bookingDate?: string;
  createdAt?: string;
  status?: AppointmentStatus;
  durationMinutes?: number;
}

export const getBookings = async (): Promise<AdminAppointment[]> => {
  try {
    const bookings = await apiGet<RawBooking[]>("/api/bookings", "admin");
    return bookings.map((b) => ({
      id: b.id,
      patientId: b.patientId,
      patientName: b.patientName,
      patientEmail: b.patientEmail,
      patientPhone: b.patientPhone,
      appointmentDate: b.appointmentDate,
      appointmentTime: b.appointmentTime,
      reason: b.reason,
      notes: b.notes,
      bookingDate: b.bookingDate || b.createdAt,
      status: b.status || "scheduled",
      durationMinutes: b.durationMinutes || 30,
    }));
  } catch (error) {
    console.error("Error fetching bookings:", error);
    return [];
  }
};

// --- Treatment plans / clinical notes / staff ---------------------------

export const getTreatmentPlans = (): Promise<TreatmentPlan[]> => apiGet<TreatmentPlan[]>("/api/data/treatment-plans", "admin");

export const setTreatmentPlans = (plans: TreatmentPlan[]): Promise<void> =>
  apiPut("/api/data/treatment-plans", plans, "admin").then(() => undefined);

export const getClinicalNotes = (): Promise<ClinicalNote[]> => apiGet<ClinicalNote[]>("/api/data/clinical-notes", "admin");

export const setClinicalNotes = (notes: ClinicalNote[]): Promise<void> =>
  apiPut("/api/data/clinical-notes", notes, "admin").then(() => undefined);

export const getStaffMembers = (): Promise<StaffMember[]> => apiGet<StaffMember[]>("/api/data/staff", "admin");

export const setStaffMembers = (staff: StaffMember[]): Promise<void> =>
  apiPut("/api/data/staff", staff, "admin").then(() => undefined);

// --- Clinic settings (public read, admin-only write) ---------------------

export const getClinicSettings = async (): Promise<ClinicSettings> => {
  try {
    const settings = await apiGet<Partial<ClinicSettings>>("/api/settings");
    return { ...DEFAULT_CLINIC_SETTINGS, ...settings };
  } catch (error) {
    console.error("Error fetching clinic settings:", error);
    return DEFAULT_CLINIC_SETTINGS;
  }
};

export const setClinicSettings = async (settings: ClinicSettings): Promise<void> => {
  await apiPut("/api/settings", settings, "admin");
  dispatchWindowEvent("clinicSettingsUpdated");
};

// --- Admin auth -----------------------------------------------------------

export const isAdminLoggedIn = (): boolean => isAdminAuthenticated();

export const loginAdmin = async (username: string, password: string): Promise<boolean> => {
  try {
    const result = await apiPost<{ success: boolean; token: string }>("/api/admin/login", { username, password });
    if (result?.success && result.token) {
      setAdminToken(result.token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
};

export const logoutAdmin = (): void => {
  clearAdminToken();
};

export const getAdminUsername = async (): Promise<string> => {
  const result = await apiGet<{ success: boolean; username: string }>("/api/admin/me", "admin");
  return result.username;
};

export const changeAdminCredentials = async (
  username: string,
  password?: string,
): Promise<{ success: boolean; message?: string }> => {
  try {
    const result = await apiPost<{ success: boolean; username: string }>(
      "/api/admin/change-credentials",
      { username, password },
      "admin",
    );
    return { success: result.success };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Failed to update credentials." };
  }
};

// --- Appointments (admin-authenticated create/update; list comes from
// getBookings above) --------------------------------------------------------

export const createAppointment = async (appointment: AdminAppointment): Promise<void> => {
  await apiPost("/api/appointments", appointment, "admin");
};

export const updateAppointmentStatus = async (
  appointmentId: string,
  updates: Partial<AdminAppointment>,
): Promise<void> => {
  await apiPut(`/api/appointments/${appointmentId}`, updates, "admin");
};

// --- Notifications --------------------------------------------------------

export const sendPrescriptionEmail = async (
  payload: PrescriptionEmailPayload,
): Promise<PrescriptionEmailResult> => {
  try {
    const result = await apiPost<PrescriptionEmailResult>(API_CONFIG.endpoints.prescription, payload, "admin");
    return {
      success: Boolean(result?.success),
      message: result?.message || "Prescription notification processed.",
      prescriptionPdf: result?.prescriptionPdf,
    };
  } catch (error) {
    console.error("Prescription notification send error:", error);
    const message = error instanceof Error ? error.message : "Could not reach the notification server.";
    return { success: false, message };
  }
};
