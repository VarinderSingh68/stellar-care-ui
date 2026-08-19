import { AdminAppointment, AdminPatient } from "@/lib/admin";

export const getTodayInputValue = () => new Date().toISOString().slice(0, 10);

export const createId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const formatDateValue = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
};

export const formatDateTimeValue = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

export const formatCurrencyValue = (value?: string | number) => {
  if (value === undefined || value === null || value === "") return "INR 0";
  const amount = Number(value);
  if (Number.isNaN(amount)) return String(value);
  return `INR ${amount.toLocaleString("en-IN")}`;
};

export const getBalanceDueAmount = (patient: AdminPatient) => {
  const total = Number(patient.totalFees || 0);
  const paid = Number(patient.amountPaid || 0);
  return Math.max(total - paid, 0);
};

export const normalizeWhatsAppNumber = (value?: string) => {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `91${digits.slice(1)}`;
  return digits;
};

export const openWhatsApp = (phone: string | undefined, text: string) => {
  const number = normalizeWhatsAppNumber(phone);
  if (!number) return false;
  window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, "_blank");
  return true;
};

export const sortAppointments = (a: AdminAppointment, b: AdminAppointment) => {
  return `${a.appointmentDate}T${a.appointmentTime}`.localeCompare(`${b.appointmentDate}T${b.appointmentTime}`);
};

export const isSameMonth = (value?: string) => {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
};

export const getPatientLabel = (patient: AdminPatient) => {
  const detail = [patient.phone, patient.email].filter(Boolean).join(" | ");
  return detail ? `${patient.name} (${detail})` : patient.name;
};

export const getPrescriptionBadge = (patient: AdminPatient) => {
  if (!patient.prescriptionSentAt) {
    return { label: "Not sent", className: "border-amber-500/30 bg-amber-500/10 text-amber-300" };
  }

  const sentTime = new Date(patient.prescriptionSentAt).getTime();
  const prescriptionTime = new Date(patient.prescriptionDate).getTime();
  const isResent = sentTime - prescriptionTime > 60_000;

  return {
    label: isResent ? "Resent" : "Sent",
    className: isResent
      ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  };
};

export const panelClass = "rounded-xl border border-border bg-card p-5 shadow-sm";
export const itemRowClass = "rounded-lg border border-border bg-background/60 p-4";
export const mutedTextClass = "text-sm text-muted-foreground";
export const nativeSelectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
