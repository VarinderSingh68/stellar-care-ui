import { useMemo, useState } from "react";
import {
  Activity,
  Bell,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  IndianRupee,
  MessageCircle,
  NotebookPen,
  Plus,
  Save,
  Settings,
  TrendingUp,
  UserCog,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  type AdminAppointment,
  type AdminPatient,
  type AppointmentStatus,
  type ClinicalNote,
  type ClinicSettings,
  type StaffMember,
  type TreatmentPlan,
  getAdminCredentials,
  getAppointments,
  getClinicalNotes,
  getClinicSettings,
  getPatients,
  getStaffMembers,
  getTreatmentPlans,
  setAdminCredentials,
  setAppointments,
  setClinicalNotes,
  setClinicSettings,
  setPatients,
  setStaffMembers,
  setTreatmentPlans,
} from "@/lib/admin";
import {
  createFollowUp,
  getConsentForms,
  getFollowUps,
  getInsuranceBillings,
  getMedicalReports,
  updateFollowUp,
  type FollowUp,
} from "@/lib/patient-portal";

type AppointmentFormState = {
  patientId: string;
  patientName: string;
  patientEmail: string;
  patientPhone: string;
  date: string;
  time: string;
  durationMinutes: string;
  reason: string;
  status: AppointmentStatus;
  notes: string;
};

type TreatmentPlanFormState = {
  patientId: string;
  title: string;
  diagnosis: string;
  estimatedCost: string;
  totalSessions: string;
  completedSessions: string;
  nextStep: string;
  status: TreatmentPlan["status"];
};

type ClinicalNoteFormState = {
  patientId: string;
  visitDate: string;
  symptoms: string;
  diagnosis: string;
  allergies: string;
  medicalHistory: string;
  doctorNotes: string;
};

type ReminderFormState = {
  patientId: string;
  title: string;
  description: string;
  dueDate: string;
  type: FollowUp["type"];
};

type StaffFormState = {
  name: string;
  role: StaffMember["role"];
  email: string;
  phone: string;
  permissions: string[];
};

type TimelineItem = {
  id: string;
  date: string;
  title: string;
  description: string;
  tag: string;
  tone: string;
};

const panelClass = "rounded-lg border border-white/10 bg-slate-950/80 p-5";
const fieldClass = "text-black";
const mutedTextClass = "text-sm text-slate-400";
const dayOptions = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const staffPermissionOptions = ["Appointments", "Billing", "Clinical notes", "Reports", "Settings"];
const appointmentStatuses: AppointmentStatus[] = ["scheduled", "waiting", "completed", "cancelled", "missed"];
const reminderTypes: FollowUp["type"][] = ["appointment", "medication", "test", "exercise", "diet"];

const getTodayInputValue = () => new Date().toISOString().slice(0, 10);

const createId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createDefaultAppointmentForm = (): AppointmentFormState => ({
  patientId: "",
  patientName: "",
  patientEmail: "",
  patientPhone: "",
  date: getTodayInputValue(),
  time: "10:00",
  durationMinutes: "30",
  reason: "",
  status: "scheduled",
  notes: "",
});

const createDefaultTreatmentPlanForm = (): TreatmentPlanFormState => ({
  patientId: "",
  title: "",
  diagnosis: "",
  estimatedCost: "",
  totalSessions: "1",
  completedSessions: "0",
  nextStep: "",
  status: "planned",
});

const createDefaultClinicalNoteForm = (): ClinicalNoteFormState => ({
  patientId: "",
  visitDate: getTodayInputValue(),
  symptoms: "",
  diagnosis: "",
  allergies: "",
  medicalHistory: "",
  doctorNotes: "",
});

const createDefaultReminderForm = (): ReminderFormState => ({
  patientId: "",
  title: "",
  description: "",
  dueDate: getTodayInputValue(),
  type: "appointment",
});

const createDefaultStaffForm = (): StaffFormState => ({
  name: "",
  role: "receptionist",
  email: "",
  phone: "",
  permissions: ["Appointments"],
});

const formatDateValue = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
};

const formatDateTimeValue = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const formatCurrencyValue = (value?: string | number) => {
  if (value === undefined || value === null || value === "") return "INR 0";
  const amount = Number(value);
  if (Number.isNaN(amount)) return String(value);
  return `INR ${amount.toLocaleString("en-IN")}`;
};

const getBalanceDueAmount = (patient: AdminPatient) => {
  const total = Number(patient.totalFees || 0);
  const paid = Number(patient.amountPaid || 0);
  return Math.max(total - paid, 0);
};

const normalizeWhatsAppNumber = (value?: string) => {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `91${digits.slice(1)}`;
  return digits;
};

const openWhatsApp = (phone: string | undefined, text: string) => {
  const number = normalizeWhatsAppNumber(phone);
  if (!number) return false;
  window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, "_blank");
  return true;
};

const sortAppointments = (a: AdminAppointment, b: AdminAppointment) => {
  return `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`);
};

const isSameMonth = (value?: string) => {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
};

const getPatientLabel = (patient: AdminPatient) => {
  const detail = [patient.phone, patient.email].filter(Boolean).join(" | ");
  return detail ? `${patient.name} (${detail})` : patient.name;
};

const AdminOperationsPanel = () => {
  const [activeTool, setActiveTool] = useState("today");
  const [message, setMessage] = useState("");
  const [patients, setPatientsState] = useState<AdminPatient[]>(() => getPatients());
  const [appointments, setAppointmentsState] = useState<AdminAppointment[]>(() => getAppointments());
  const [treatmentPlans, setTreatmentPlansState] = useState<TreatmentPlan[]>(() => getTreatmentPlans());
  const [clinicalNotes, setClinicalNotesState] = useState<ClinicalNote[]>(() => getClinicalNotes());
  const [staffMembers, setStaffMembersState] = useState<StaffMember[]>(() => getStaffMembers());
  const [followUps, setFollowUpsState] = useState<FollowUp[]>(() => getFollowUps());
  const [settingsForm, setSettingsForm] = useState<ClinicSettings>(() => getClinicSettings());
  const [appointmentForm, setAppointmentForm] = useState(createDefaultAppointmentForm);
  const [calendarDate, setCalendarDate] = useState(getTodayInputValue());
  const [timelinePatientId, setTimelinePatientId] = useState("");
  const [planForm, setPlanForm] = useState(createDefaultTreatmentPlanForm);
  const [noteForm, setNoteForm] = useState(createDefaultClinicalNoteForm);
  const [reminderForm, setReminderForm] = useState(createDefaultReminderForm);
  const [staffForm, setStaffForm] = useState(createDefaultStaffForm);
  const [credentialForm, setCredentialForm] = useState(() => {
    const credentials = getAdminCredentials();
    return {
      username: credentials.username,
      password: "",
      confirmPassword: "",
    };
  });

  const savePatientList = (updated: AdminPatient[]) => {
    setPatients(updated);
    setPatientsState(updated);
  };

  const saveAppointmentList = (updated: AdminAppointment[]) => {
    const sorted = [...updated].sort(sortAppointments);
    setAppointments(sorted);
    setAppointmentsState(sorted);
  };

  const saveTreatmentPlanList = (updated: TreatmentPlan[]) => {
    setTreatmentPlans(updated);
    setTreatmentPlansState(updated);
  };

  const saveClinicalNoteList = (updated: ClinicalNote[]) => {
    setClinicalNotes(updated);
    setClinicalNotesState(updated);
  };

  const saveStaffList = (updated: StaffMember[]) => {
    setStaffMembers(updated);
    setStaffMembersState(updated);
  };

  const selectedTimelinePatientId = timelinePatientId || patients[0]?.id || "";
  const today = getTodayInputValue();

  const todayAppointments = useMemo(
    () => appointments.filter((appointment) => appointment.date === today).sort(sortAppointments),
    [appointments, today],
  );

  const calendarAppointments = useMemo(
    () => appointments.filter((appointment) => appointment.date === calendarDate).sort(sortAppointments),
    [appointments, calendarDate],
  );

  const pendingPaymentPatients = useMemo(
    () => patients.filter((patient) => getBalanceDueAmount(patient) > 0 || patient.paymentStatus === "partial" || patient.paymentStatus === "unpaid"),
    [patients],
  );

  const activeReminders = useMemo(
    () =>
      followUps
        .filter((followUp) => followUp.status !== "completed")
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [followUps],
  );

  const timelineItems = useMemo<TimelineItem[]>(() => {
    if (!selectedTimelinePatientId) return [];
    const selectedPatient = patients.find((patient) => patient.id === selectedTimelinePatientId);
    const matchesPatientName = (name?: string) => selectedPatient && name?.toLowerCase() === selectedPatient.name.toLowerCase();

    const patientItems = selectedPatient
      ? [
          {
            id: `patient-${selectedPatient.id}`,
            date: selectedPatient.visitDate || selectedPatient.prescriptionDate,
            title: "Patient record",
            description: `${selectedPatient.suffering}. Prescription: ${selectedPatient.prescription}`,
            tag: "Record",
            tone: "border-sky-500/30 bg-sky-500/10 text-sky-200",
          },
        ]
      : [];

    const appointmentItems = appointments
      .filter((appointment) => appointment.patientId === selectedTimelinePatientId || matchesPatientName(appointment.patientName))
      .map((appointment) => ({
        id: appointment.id,
        date: `${appointment.date}T${appointment.time}`,
        title: `${appointment.status} appointment`,
        description: `${appointment.reason}${appointment.notes ? ` | ${appointment.notes}` : ""}`,
        tag: "Appointment",
        tone: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200",
      }));

    const planItems = treatmentPlans
      .filter((plan) => plan.patientId === selectedTimelinePatientId)
      .map((plan) => ({
        id: plan.id,
        date: plan.createdAt,
        title: plan.title,
        description: `${plan.completedSessions}/${plan.totalSessions} sessions. Next: ${plan.nextStep}`,
        tag: "Plan",
        tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
      }));

    const noteItems = clinicalNotes
      .filter((note) => note.patientId === selectedTimelinePatientId)
      .map((note) => ({
        id: note.id,
        date: note.visitDate,
        title: note.diagnosis,
        description: `${note.symptoms}${note.doctorNotes ? ` | ${note.doctorNotes}` : ""}`,
        tag: "Note",
        tone: "border-amber-500/30 bg-amber-500/10 text-amber-200",
      }));

    const reminderItems = followUps
      .filter((followUp) => followUp.patientId === selectedTimelinePatientId)
      .map((followUp) => ({
        id: followUp.id,
        date: followUp.dueDate,
        title: followUp.title,
        description: `${followUp.type} reminder is ${followUp.status}. ${followUp.description}`,
        tag: "Reminder",
        tone: "border-rose-500/30 bg-rose-500/10 text-rose-200",
      }));

    const consentItems = getConsentForms()
      .filter((form) => form.patientId === selectedTimelinePatientId)
      .map((form) => ({
        id: form.id,
        date: form.signatureDate || form.createdDate,
        title: form.title,
        description: form.isSigned ? "Signed consent form" : "Pending consent form",
        tag: "Consent",
        tone: "border-violet-500/30 bg-violet-500/10 text-violet-200",
      }));

    const reportItems = getMedicalReports()
      .filter((report) => report.patientId === selectedTimelinePatientId)
      .map((report) => ({
        id: report.id,
        date: report.date,
        title: report.title,
        description: `${report.reportType}${report.description ? ` | ${report.description}` : ""}`,
        tag: "Report",
        tone: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
      }));

    const billingItems = getInsuranceBillings()
      .filter((billing) => billing.patientId === selectedTimelinePatientId)
      .map((billing) => ({
        id: billing.id,
        date: billing.submissionDate,
        title: `Claim ${billing.claimId}`,
        description: `${billing.insuranceProvider} | ${formatCurrencyValue(billing.amount)} | ${billing.status}`,
        tag: "Billing",
        tone: "border-lime-500/30 bg-lime-500/10 text-lime-200",
      }));

    return [
      ...patientItems,
      ...appointmentItems,
      ...planItems,
      ...noteItems,
      ...reminderItems,
      ...consentItems,
      ...reportItems,
      ...billingItems,
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [appointments, clinicalNotes, followUps, patients, selectedTimelinePatientId, treatmentPlans]);

  const analytics = useMemo(() => {
    const paidThisMonth = patients.reduce((sum, patient) => {
      if (!isSameMonth(patient.visitDate || patient.prescriptionDate)) return sum;
      return sum + Number(patient.amountPaid || 0);
    }, 0);

    const pendingDues = patients.reduce((sum, patient) => sum + getBalanceDueAmount(patient), 0);
    const monthPatients = patients.filter((patient) => isSameMonth(patient.visitDate || patient.prescriptionDate)).length;
    const completedAppointments = appointments.filter(
      (appointment) => appointment.status === "completed" && isSameMonth(appointment.date),
    ).length;
    const scheduledAppointments = appointments.filter((appointment) => isSameMonth(appointment.date)).length;

    const treatmentCounts = patients.reduce<Record<string, number>>((acc, patient) => {
      const label = (patient.suffering || "General care").split(/[.,\n]/)[0].trim() || "General care";
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});
    const commonTreatments = Object.entries(treatmentCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      paidThisMonth,
      pendingDues,
      monthPatients,
      completedAppointments,
      scheduledAppointments,
      commonTreatments,
    };
  }, [appointments, patients]);

  const selectPatientForAppointment = (patientId: string) => {
    const patient = patients.find((item) => item.id === patientId);
    setAppointmentForm((prev) => ({
      ...prev,
      patientId,
      patientName: patient?.name || "",
      patientEmail: patient?.email || "",
      patientPhone: patient?.phone || "",
    }));
  };

  const createAppointment = () => {
    const patientName = appointmentForm.patientName.trim();
    if (!patientName || !appointmentForm.date || !appointmentForm.time || !appointmentForm.reason.trim()) {
      setMessage("Add patient, date, time, and appointment reason.");
      return;
    }

    const appointment: AdminAppointment = {
      id: createId("appointment"),
      patientId: appointmentForm.patientId || undefined,
      patientName,
      patientEmail: appointmentForm.patientEmail.trim() || undefined,
      patientPhone: appointmentForm.patientPhone.trim() || undefined,
      date: appointmentForm.date,
      time: appointmentForm.time,
      durationMinutes: Number(appointmentForm.durationMinutes) || 30,
      reason: appointmentForm.reason.trim(),
      status: appointmentForm.status,
      notes: appointmentForm.notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    saveAppointmentList([appointment, ...appointments]);
    setCalendarDate(appointment.date);
    setAppointmentForm(createDefaultAppointmentForm());
    setMessage("Appointment added to the calendar.");
  };

  const updateAppointmentStatus = (appointmentId: string, status: AppointmentStatus) => {
    saveAppointmentList(
      appointments.map((appointment) => (appointment.id === appointmentId ? { ...appointment, status } : appointment)),
    );
    setMessage(`Appointment marked as ${status}.`);
  };

  const sendAppointmentReminder = (appointment: AdminAppointment) => {
    const sent = openWhatsApp(
      appointment.patientPhone,
      `Dear ${appointment.patientName}, this is a reminder for your appointment at ${settingsForm.clinicName} on ${formatDateValue(appointment.date)} at ${appointment.time}.`,
    );
    setMessage(sent ? "WhatsApp appointment reminder opened." : "No WhatsApp number found for this appointment.");
  };

  const createTreatmentPlan = () => {
    const patient = patients.find((item) => item.id === planForm.patientId);
    if (!patient || !planForm.title.trim() || !planForm.diagnosis.trim() || !planForm.nextStep.trim()) {
      setMessage("Select a patient and add treatment plan, diagnosis, and next step.");
      return;
    }

    const totalSessions = Math.max(Number(planForm.totalSessions) || 1, 1);
    const completedSessions = Math.min(Math.max(Number(planForm.completedSessions) || 0, 0), totalSessions);
    const plan: TreatmentPlan = {
      id: createId("plan"),
      patientId: patient.id,
      patientName: patient.name,
      title: planForm.title.trim(),
      diagnosis: planForm.diagnosis.trim(),
      estimatedCost: planForm.estimatedCost.trim() || undefined,
      totalSessions,
      completedSessions,
      nextStep: planForm.nextStep.trim(),
      status: planForm.status,
      createdAt: new Date().toISOString(),
    };

    saveTreatmentPlanList([plan, ...treatmentPlans]);
    setPlanForm(createDefaultTreatmentPlanForm());
    setMessage("Treatment plan saved.");
  };

  const updateTreatmentPlan = (planId: string, updates: Partial<TreatmentPlan>) => {
    saveTreatmentPlanList(treatmentPlans.map((plan) => (plan.id === planId ? { ...plan, ...updates } : plan)));
  };

  const createClinicalNote = () => {
    const patient = patients.find((item) => item.id === noteForm.patientId);
    if (!patient || !noteForm.symptoms.trim() || !noteForm.diagnosis.trim()) {
      setMessage("Select a patient and add symptoms plus diagnosis.");
      return;
    }

    const note: ClinicalNote = {
      id: createId("note"),
      patientId: patient.id,
      patientName: patient.name,
      visitDate: noteForm.visitDate || getTodayInputValue(),
      symptoms: noteForm.symptoms.trim(),
      diagnosis: noteForm.diagnosis.trim(),
      allergies: noteForm.allergies.trim() || undefined,
      medicalHistory: noteForm.medicalHistory.trim() || undefined,
      doctorNotes: noteForm.doctorNotes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    saveClinicalNoteList([note, ...clinicalNotes]);
    setNoteForm(createDefaultClinicalNoteForm());
    setMessage("Clinical note saved.");
  };

  const createReminder = () => {
    const patient = patients.find((item) => item.id === reminderForm.patientId);
    if (!patient || !reminderForm.title.trim() || !reminderForm.dueDate) {
      setMessage("Select a patient and add reminder title plus due date.");
      return;
    }

    createFollowUp({
      patientId: patient.id,
      title: reminderForm.title.trim(),
      description: reminderForm.description.trim(),
      dueDate: reminderForm.dueDate,
      type: reminderForm.type,
      status: "pending",
      createdDate: new Date().toISOString(),
    });
    setFollowUpsState(getFollowUps());
    setReminderForm(createDefaultReminderForm());
    setMessage("Recall reminder created.");
  };

  const markReminderCompleted = (followUpId: string) => {
    updateFollowUp(followUpId, {
      status: "completed",
      completedDate: new Date().toISOString(),
    });
    setFollowUpsState(getFollowUps());
    setMessage("Reminder marked as completed.");
  };

  const sendReminderMessage = (followUp: FollowUp) => {
    const patient = patients.find((item) => item.id === followUp.patientId);
    const sent = openWhatsApp(
      patient?.phone,
      `Dear ${patient?.name || "Patient"}, this is a reminder from ${settingsForm.clinicName}: ${followUp.title} is due on ${formatDateValue(followUp.dueDate)}.`,
    );
    setMessage(sent ? "WhatsApp reminder opened." : "No WhatsApp number found for this patient.");
  };

  const markPatientPaid = (patient: AdminPatient) => {
    const updated = patients.map((item) =>
      item.id === patient.id
        ? {
            ...item,
            amountPaid: item.totalFees || item.amountPaid || "0",
            paymentStatus: "paid" as const,
          }
        : item,
    );
    savePatientList(updated);
    setMessage(`${patient.name} marked as paid.`);
  };

  const sendPaymentReminder = (patient: AdminPatient) => {
    const balance = getBalanceDueAmount(patient);
    const sent = openWhatsApp(
      patient.phone,
      `Dear ${patient.name}, your pending balance at ${settingsForm.clinicName} is ${formatCurrencyValue(balance)}. Please contact the clinic for payment support.`,
    );
    setMessage(sent ? "WhatsApp payment reminder opened." : "No WhatsApp number found for this patient.");
  };

  const createStaffMember = () => {
    if (!staffForm.name.trim()) {
      setMessage("Add staff name before saving.");
      return;
    }

    const staff: StaffMember = {
      id: createId("staff"),
      name: staffForm.name.trim(),
      role: staffForm.role,
      email: staffForm.email.trim() || undefined,
      phone: staffForm.phone.trim() || undefined,
      active: true,
      permissions: staffForm.permissions,
      createdAt: new Date().toISOString(),
    };
    saveStaffList([staff, ...staffMembers]);
    setStaffForm(createDefaultStaffForm());
    setMessage("Staff member saved.");
  };

  const toggleStaffPermission = (permission: string) => {
    setStaffForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter((item) => item !== permission)
        : [...prev.permissions, permission],
    }));
  };

  const toggleWorkingDay = (day: string) => {
    setSettingsForm((prev) => ({
      ...prev,
      workingDays: prev.workingDays.includes(day)
        ? prev.workingDays.filter((item) => item !== day)
        : [...prev.workingDays, day],
    }));
  };

  const saveSettings = () => {
    const credentials = getAdminCredentials();
    const hasCredentialChanges =
      credentialForm.password || credentialForm.confirmPassword || credentialForm.username.trim() !== credentials.username;

    if (hasCredentialChanges) {
      if (!credentialForm.username.trim()) {
        setMessage("Admin username cannot be empty.");
        return;
      }
      if (credentialForm.password !== credentialForm.confirmPassword) {
        setMessage("Admin password confirmation does not match.");
        return;
      }
    }

    setClinicSettings(settingsForm);

    if (hasCredentialChanges) {
      setAdminCredentials({
        username: credentialForm.username.trim(),
        password: credentialForm.password || credentials.password,
      });
      setCredentialForm((prev) => ({ ...prev, password: "", confirmPassword: "" }));
    }

    setMessage("Settings saved.");
  };

  const renderAppointmentList = (items: AdminAppointment[]) => {
    if (items.length === 0) {
      return <p className={mutedTextClass}>No appointments found for this date.</p>;
    }

    return (
      <div className="space-y-3">
        {items.map((appointment) => (
          <div key={appointment.id} className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-white">{appointment.time} - {appointment.patientName}</p>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs capitalize text-slate-200">
                    {appointment.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-400">{appointment.reason}</p>
                <div className="mt-3 grid gap-x-4 gap-y-1 text-sm text-slate-400 md:grid-cols-2">
                  <p>Duration: {appointment.durationMinutes} min</p>
                  <p>Date: {formatDateValue(appointment.date)}</p>
                  <p>Phone: {appointment.patientPhone || "-"}</p>
                  <p>Email: {appointment.patientEmail || "-"}</p>
                </div>
                {appointment.notes && <p className="mt-2 text-sm text-slate-400">Notes: {appointment.notes}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {appointmentStatuses.map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    variant={appointment.status === status ? "default" : "secondary"}
                    onClick={() => updateAppointmentStatus(appointment.id, status)}
                    className="h-9 capitalize"
                  >
                    {status}
                  </Button>
                ))}
                <Button size="sm" variant="outline" onClick={() => sendAppointmentReminder(appointment)} className="h-9 gap-2">
                  <MessageCircle className="h-4 w-4" />
                  Remind
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {message && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
          {message}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className={panelClass}>
          <div className="flex items-center gap-3">
            <CalendarCheck className="h-5 w-5 text-sky-300" />
            <p className="text-sm text-slate-400">Today</p>
          </div>
          <p className="mt-3 text-2xl font-semibold text-white">{todayAppointments.length}</p>
          <p className={mutedTextClass}>appointments scheduled</p>
        </div>
        <div className={panelClass}>
          <div className="flex items-center gap-3">
            <WalletCards className="h-5 w-5 text-amber-300" />
            <p className="text-sm text-slate-400">Pending Dues</p>
          </div>
          <p className="mt-3 text-2xl font-semibold text-white">{formatCurrencyValue(analytics.pendingDues)}</p>
          <p className={mutedTextClass}>{pendingPaymentPatients.length} patients need attention</p>
        </div>
        <div className={panelClass}>
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-rose-300" />
            <p className="text-sm text-slate-400">Open Reminders</p>
          </div>
          <p className="mt-3 text-2xl font-semibold text-white">{activeReminders.length}</p>
          <p className={mutedTextClass}>follow-ups pending</p>
        </div>
        <div className={panelClass}>
          <div className="flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-emerald-300" />
            <p className="text-sm text-slate-400">This Month</p>
          </div>
          <p className="mt-3 text-2xl font-semibold text-white">{analytics.monthPatients}</p>
          <p className={mutedTextClass}>patient visits recorded</p>
        </div>
      </div>

      <Tabs value={activeTool} onValueChange={setActiveTool} className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0 md:grid-cols-5 xl:grid-cols-10">
          {[
            { value: "today", label: "Today", icon: Clock },
            { value: "calendar", label: "Calendar", icon: CalendarDays },
            { value: "timeline", label: "Timeline", icon: Activity },
            { value: "plans", label: "Plans", icon: ClipboardList },
            { value: "payments", label: "Payments", icon: IndianRupee },
            { value: "notes", label: "Notes", icon: NotebookPen },
            { value: "reminders", label: "Reminders", icon: Bell },
            { value: "staff", label: "Staff", icon: UserCog },
            { value: "analytics", label: "Analytics", icon: TrendingUp },
            { value: "settings", label: "Settings", icon: Settings },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="h-11 gap-2 rounded-lg border border-white/10 bg-slate-950/80 px-2 text-slate-300 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <Icon className="h-4 w-4" />
                <span className="text-xs sm:text-sm">{item.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="today" className="mt-6 space-y-6">
          <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
            <div className={panelClass}>
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-white">Today's Schedule</h2>
                  <p className={mutedTextClass}>Move patients through waiting, completed, cancelled, or missed states.</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setActiveTool("calendar")} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>
              {renderAppointmentList(todayAppointments)}
            </div>

            <div className={panelClass}>
              <h2 className="text-xl font-semibold text-white">Queue Snapshot</h2>
              <div className="mt-5 space-y-3">
                {appointmentStatuses.map((status) => {
                  const count = todayAppointments.filter((appointment) => appointment.status === status).length;
                  return (
                    <div key={status} className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-900/70 px-4 py-3">
                      <span className="capitalize text-slate-300">{status}</span>
                      <span className="font-semibold text-white">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="calendar" className="mt-6 space-y-6">
          <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <div className={panelClass}>
              <h2 className="text-xl font-semibold text-white">Appointment Calendar</h2>
              <div className="mt-5 grid gap-4">
                <div>
                  <Label htmlFor="appointment-patient">Patient</Label>
                  <select
                    id="appointment-patient"
                    value={appointmentForm.patientId}
                    onChange={(event) => selectPatientForAppointment(event.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-base text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">Walk-in or new patient</option>
                    {patients.map((patient) => (
                      <option key={patient.id} value={patient.id}>{getPatientLabel(patient)}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="appointment-name">Patient name</Label>
                    <Input id="appointment-name" value={appointmentForm.patientName} onChange={(event) => setAppointmentForm({ ...appointmentForm, patientName: event.target.value })} className={fieldClass} />
                  </div>
                  <div>
                    <Label htmlFor="appointment-phone">Phone</Label>
                    <Input id="appointment-phone" value={appointmentForm.patientPhone} onChange={(event) => setAppointmentForm({ ...appointmentForm, patientPhone: event.target.value })} className={fieldClass} />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label htmlFor="appointment-date">Date</Label>
                    <Input id="appointment-date" type="date" value={appointmentForm.date} onChange={(event) => setAppointmentForm({ ...appointmentForm, date: event.target.value })} className={fieldClass} />
                  </div>
                  <div>
                    <Label htmlFor="appointment-time">Time</Label>
                    <Input id="appointment-time" type="time" value={appointmentForm.time} onChange={(event) => setAppointmentForm({ ...appointmentForm, time: event.target.value })} className={fieldClass} />
                  </div>
                  <div>
                    <Label htmlFor="appointment-duration">Minutes</Label>
                    <Input id="appointment-duration" type="number" min="5" value={appointmentForm.durationMinutes} onChange={(event) => setAppointmentForm({ ...appointmentForm, durationMinutes: event.target.value })} className={fieldClass} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="appointment-reason">Reason</Label>
                  <Textarea id="appointment-reason" value={appointmentForm.reason} onChange={(event) => setAppointmentForm({ ...appointmentForm, reason: event.target.value })} className={fieldClass} placeholder="Consultation, extraction, scaling, follow-up..." />
                </div>
                <div>
                  <Label htmlFor="appointment-notes">Notes</Label>
                  <Input id="appointment-notes" value={appointmentForm.notes} onChange={(event) => setAppointmentForm({ ...appointmentForm, notes: event.target.value })} className={fieldClass} />
                </div>
                <Button onClick={createAppointment} className="gap-2">
                  <CalendarCheck className="h-4 w-4" />
                  Save appointment
                </Button>
              </div>
            </div>

            <div className={panelClass}>
              <div className="mb-5 grid gap-3 md:grid-cols-[1fr_220px] md:items-end">
                <div>
                  <h2 className="text-xl font-semibold text-white">Day View</h2>
                  <p className={mutedTextClass}>Review and update appointment status for the selected day.</p>
                </div>
                <Input type="date" value={calendarDate} onChange={(event) => setCalendarDate(event.target.value)} className={fieldClass} />
              </div>
              {renderAppointmentList(calendarAppointments)}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="timeline" className="mt-6 space-y-6">
          <section className={panelClass}>
            <div className="grid gap-4 lg:grid-cols-[1fr_320px] lg:items-end">
              <div>
                <h2 className="text-xl font-semibold text-white">Patient Timeline</h2>
                <p className={mutedTextClass}>Visits, appointments, notes, plans, reminders, reports, consent forms, and billing in one view.</p>
              </div>
              <div>
                <Label htmlFor="timeline-patient">Patient</Label>
                <select
                  id="timeline-patient"
                  value={selectedTimelinePatientId}
                  onChange={(event) => setTimelinePatientId(event.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-base text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {patients.length === 0 && <option value="">No patients</option>}
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>{getPatientLabel(patient)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {timelineItems.length === 0 ? (
                <p className={mutedTextClass}>Select a patient with records to see their timeline.</p>
              ) : (
                timelineItems.map((item) => (
                  <div key={`${item.tag}-${item.id}`} className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${item.tone}`}>{item.tag}</span>
                          <p className="font-semibold text-white">{item.title}</p>
                        </div>
                        <p className="mt-2 text-sm text-slate-400">{item.description}</p>
                      </div>
                      <p className="text-sm text-slate-400">{formatDateTimeValue(item.date)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="plans" className="mt-6 space-y-6">
          <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className={panelClass}>
              <h2 className="text-xl font-semibold text-white">Treatment Plans</h2>
              <div className="mt-5 grid gap-4">
                <div>
                  <Label htmlFor="plan-patient">Patient</Label>
                  <select id="plan-patient" value={planForm.patientId} onChange={(event) => setPlanForm({ ...planForm, patientId: event.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-base text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    <option value="">Select patient</option>
                    {patients.map((patient) => <option key={patient.id} value={patient.id}>{getPatientLabel(patient)}</option>)}
                  </select>
                </div>
                <div>
                  <Label htmlFor="plan-title">Plan</Label>
                  <Input id="plan-title" value={planForm.title} onChange={(event) => setPlanForm({ ...planForm, title: event.target.value })} className={fieldClass} placeholder="Root canal treatment, implant plan..." />
                </div>
                <div>
                  <Label htmlFor="plan-diagnosis">Diagnosis</Label>
                  <Textarea id="plan-diagnosis" value={planForm.diagnosis} onChange={(event) => setPlanForm({ ...planForm, diagnosis: event.target.value })} className={fieldClass} />
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label htmlFor="plan-cost">Estimated cost</Label>
                    <Input id="plan-cost" type="number" min="0" value={planForm.estimatedCost} onChange={(event) => setPlanForm({ ...planForm, estimatedCost: event.target.value })} className={fieldClass} />
                  </div>
                  <div>
                    <Label htmlFor="plan-total">Sessions</Label>
                    <Input id="plan-total" type="number" min="1" value={planForm.totalSessions} onChange={(event) => setPlanForm({ ...planForm, totalSessions: event.target.value })} className={fieldClass} />
                  </div>
                  <div>
                    <Label htmlFor="plan-complete">Completed</Label>
                    <Input id="plan-complete" type="number" min="0" value={planForm.completedSessions} onChange={(event) => setPlanForm({ ...planForm, completedSessions: event.target.value })} className={fieldClass} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="plan-next">Next step</Label>
                  <Input id="plan-next" value={planForm.nextStep} onChange={(event) => setPlanForm({ ...planForm, nextStep: event.target.value })} className={fieldClass} />
                </div>
                <Button onClick={createTreatmentPlan} className="gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Save treatment plan
                </Button>
              </div>
            </div>

            <div className={panelClass}>
              <h2 className="text-xl font-semibold text-white">Active Plans</h2>
              <div className="mt-5 space-y-3">
                {treatmentPlans.length === 0 ? (
                  <p className={mutedTextClass}>No treatment plans saved yet.</p>
                ) : (
                  treatmentPlans.map((plan) => {
                    const percent = Math.round((plan.completedSessions / Math.max(plan.totalSessions, 1)) * 100);
                    return (
                      <div key={plan.id} className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex-1">
                            <p className="font-semibold text-white">{plan.title}</p>
                            <p className="mt-1 text-sm text-slate-400">{plan.patientName} | {plan.status}</p>
                            <p className="mt-2 text-sm text-slate-400">{plan.diagnosis}</p>
                            <p className="mt-1 text-sm text-slate-400">Next: {plan.nextStep}</p>
                            <div className="mt-3 h-2 rounded-full bg-slate-800">
                              <div className="h-2 rounded-full bg-emerald-400" style={{ width: `${Math.min(percent, 100)}%` }} />
                            </div>
                            <p className="mt-2 text-sm text-slate-400">{plan.completedSessions}/{plan.totalSessions} sessions | {formatCurrencyValue(plan.estimatedCost)}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                updateTreatmentPlan(plan.id, {
                                  completedSessions: Math.min(plan.completedSessions + 1, plan.totalSessions),
                                  status: plan.completedSessions + 1 >= plan.totalSessions ? "completed" : "in-progress",
                                })
                              }
                              className="gap-2"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Session
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => updateTreatmentPlan(plan.id, { status: "on-hold" })}>
                              Hold
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="payments" className="mt-6 space-y-6">
          <section className={panelClass}>
            <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">Pending Payments</h2>
                <p className={mutedTextClass}>Follow up with unpaid and partially paid patients.</p>
              </div>
              <p className="text-lg font-semibold text-white">{formatCurrencyValue(analytics.pendingDues)}</p>
            </div>
            <div className="space-y-3">
              {pendingPaymentPatients.length === 0 ? (
                <p className={mutedTextClass}>No pending payments.</p>
              ) : (
                pendingPaymentPatients.map((patient) => (
                  <div key={patient.id} className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="font-semibold text-white">{patient.name}</p>
                        <div className="mt-2 grid gap-x-4 gap-y-1 text-sm text-slate-400 md:grid-cols-2">
                          <p>Total: {formatCurrencyValue(patient.totalFees)}</p>
                          <p>Paid: {formatCurrencyValue(patient.amountPaid)}</p>
                          <p>Balance: {formatCurrencyValue(getBalanceDueAmount(patient))}</p>
                          <p>Status: {patient.paymentStatus || "-"}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => sendPaymentReminder(patient)} className="gap-2">
                          <MessageCircle className="h-4 w-4" />
                          Remind
                        </Button>
                        <Button size="sm" onClick={() => markPatientPaid(patient)} className="gap-2">
                          <CheckCircle2 className="h-4 w-4" />
                          Mark paid
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="notes" className="mt-6 space-y-6">
          <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className={panelClass}>
              <h2 className="text-xl font-semibold text-white">Clinical Notes & Case History</h2>
              <div className="mt-5 grid gap-4">
                <div>
                  <Label htmlFor="note-patient">Patient</Label>
                  <select id="note-patient" value={noteForm.patientId} onChange={(event) => setNoteForm({ ...noteForm, patientId: event.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-base text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    <option value="">Select patient</option>
                    {patients.map((patient) => <option key={patient.id} value={patient.id}>{getPatientLabel(patient)}</option>)}
                  </select>
                </div>
                <div>
                  <Label htmlFor="note-date">Visit date</Label>
                  <Input id="note-date" type="date" value={noteForm.visitDate} onChange={(event) => setNoteForm({ ...noteForm, visitDate: event.target.value })} className={fieldClass} />
                </div>
                <div>
                  <Label htmlFor="note-symptoms">Symptoms</Label>
                  <Textarea id="note-symptoms" value={noteForm.symptoms} onChange={(event) => setNoteForm({ ...noteForm, symptoms: event.target.value })} className={fieldClass} />
                </div>
                <div>
                  <Label htmlFor="note-diagnosis">Diagnosis</Label>
                  <Textarea id="note-diagnosis" value={noteForm.diagnosis} onChange={(event) => setNoteForm({ ...noteForm, diagnosis: event.target.value })} className={fieldClass} />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="note-allergies">Allergies</Label>
                    <Input id="note-allergies" value={noteForm.allergies} onChange={(event) => setNoteForm({ ...noteForm, allergies: event.target.value })} className={fieldClass} />
                  </div>
                  <div>
                    <Label htmlFor="note-history">Medical history</Label>
                    <Input id="note-history" value={noteForm.medicalHistory} onChange={(event) => setNoteForm({ ...noteForm, medicalHistory: event.target.value })} className={fieldClass} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="note-doctor">Doctor-only notes</Label>
                  <Textarea id="note-doctor" value={noteForm.doctorNotes} onChange={(event) => setNoteForm({ ...noteForm, doctorNotes: event.target.value })} className={fieldClass} />
                </div>
                <Button onClick={createClinicalNote} className="gap-2">
                  <NotebookPen className="h-4 w-4" />
                  Save note
                </Button>
              </div>
            </div>

            <div className={panelClass}>
              <h2 className="text-xl font-semibold text-white">Recent Notes</h2>
              <div className="mt-5 space-y-3">
                {clinicalNotes.length === 0 ? (
                  <p className={mutedTextClass}>No clinical notes saved yet.</p>
                ) : (
                  clinicalNotes.map((note) => (
                    <div key={note.id} className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="font-semibold text-white">{note.patientName}</p>
                          <p className="mt-1 text-sm text-slate-400">{note.diagnosis}</p>
                        </div>
                        <p className="text-sm text-slate-400">{formatDateValue(note.visitDate)}</p>
                      </div>
                      <p className="mt-3 text-sm text-slate-400">Symptoms: {note.symptoms}</p>
                      {note.allergies && <p className="text-sm text-slate-400">Allergies: {note.allergies}</p>}
                      {note.medicalHistory && <p className="text-sm text-slate-400">History: {note.medicalHistory}</p>}
                      {note.doctorNotes && <p className="text-sm text-slate-400">Doctor notes: {note.doctorNotes}</p>}
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="reminders" className="mt-6 space-y-6">
          <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className={panelClass}>
              <h2 className="text-xl font-semibold text-white">Recall & Follow-up Reminders</h2>
              <div className="mt-5 grid gap-4">
                <div>
                  <Label htmlFor="reminder-patient">Patient</Label>
                  <select id="reminder-patient" value={reminderForm.patientId} onChange={(event) => setReminderForm({ ...reminderForm, patientId: event.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-base text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    <option value="">Select patient</option>
                    {patients.map((patient) => <option key={patient.id} value={patient.id}>{getPatientLabel(patient)}</option>)}
                  </select>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="reminder-title">Reminder</Label>
                    <Input id="reminder-title" value={reminderForm.title} onChange={(event) => setReminderForm({ ...reminderForm, title: event.target.value })} className={fieldClass} placeholder="Cleaning recall, post-treatment checkup..." />
                  </div>
                  <div>
                    <Label htmlFor="reminder-date">Due date</Label>
                    <Input id="reminder-date" type="date" value={reminderForm.dueDate} onChange={(event) => setReminderForm({ ...reminderForm, dueDate: event.target.value })} className={fieldClass} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="reminder-type">Type</Label>
                  <select id="reminder-type" value={reminderForm.type} onChange={(event) => setReminderForm({ ...reminderForm, type: event.target.value as FollowUp["type"] })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-base text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    {reminderTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
                <div>
                  <Label htmlFor="reminder-desc">Details</Label>
                  <Textarea id="reminder-desc" value={reminderForm.description} onChange={(event) => setReminderForm({ ...reminderForm, description: event.target.value })} className={fieldClass} />
                </div>
                <Button onClick={createReminder} className="gap-2">
                  <Bell className="h-4 w-4" />
                  Create reminder
                </Button>
              </div>
            </div>

            <div className={panelClass}>
              <h2 className="text-xl font-semibold text-white">Open Reminders</h2>
              <div className="mt-5 space-y-3">
                {activeReminders.length === 0 ? (
                  <p className={mutedTextClass}>No pending reminders.</p>
                ) : (
                  activeReminders.map((followUp) => {
                    const patient = patients.find((item) => item.id === followUp.patientId);
                    return (
                      <div key={followUp.id} className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p className="font-semibold text-white">{followUp.title}</p>
                            <p className="mt-1 text-sm text-slate-400">{patient?.name || "Patient"} | due {formatDateValue(followUp.dueDate)} | {followUp.type}</p>
                            <p className="mt-2 text-sm text-slate-400">{followUp.description || "No details added."}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="secondary" onClick={() => sendReminderMessage(followUp)} className="gap-2">
                              <MessageCircle className="h-4 w-4" />
                              Send
                            </Button>
                            <Button size="sm" onClick={() => markReminderCompleted(followUp.id)} className="gap-2">
                              <CheckCircle2 className="h-4 w-4" />
                              Done
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="staff" className="mt-6 space-y-6">
          <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className={panelClass}>
              <h2 className="text-xl font-semibold text-white">Staff & Role Access</h2>
              <div className="mt-5 grid gap-4">
                <div>
                  <Label htmlFor="staff-name">Name</Label>
                  <Input id="staff-name" value={staffForm.name} onChange={(event) => setStaffForm({ ...staffForm, name: event.target.value })} className={fieldClass} />
                </div>
                <div>
                  <Label htmlFor="staff-role">Role</Label>
                  <select id="staff-role" value={staffForm.role} onChange={(event) => setStaffForm({ ...staffForm, role: event.target.value as StaffMember["role"] })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-base text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    <option value="doctor">Doctor</option>
                    <option value="receptionist">Receptionist</option>
                    <option value="assistant">Assistant</option>
                  </select>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="staff-email">Email</Label>
                    <Input id="staff-email" value={staffForm.email} onChange={(event) => setStaffForm({ ...staffForm, email: event.target.value })} className={fieldClass} />
                  </div>
                  <div>
                    <Label htmlFor="staff-phone">Phone</Label>
                    <Input id="staff-phone" value={staffForm.phone} onChange={(event) => setStaffForm({ ...staffForm, phone: event.target.value })} className={fieldClass} />
                  </div>
                </div>
                <div>
                  <Label>Permissions</Label>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {staffPermissionOptions.map((permission) => (
                      <label key={permission} className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-200">
                        <input type="checkbox" checked={staffForm.permissions.includes(permission)} onChange={() => toggleStaffPermission(permission)} />
                        {permission}
                      </label>
                    ))}
                  </div>
                </div>
                <Button onClick={createStaffMember} className="gap-2">
                  <UserCog className="h-4 w-4" />
                  Save staff member
                </Button>
              </div>
            </div>

            <div className={panelClass}>
              <h2 className="text-xl font-semibold text-white">Team Access</h2>
              <div className="mt-5 space-y-3">
                {staffMembers.length === 0 ? (
                  <p className={mutedTextClass}>No staff records saved yet.</p>
                ) : (
                  staffMembers.map((member) => (
                    <div key={member.id} className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-white">{member.name}</p>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs capitalize text-slate-200">{member.role}</span>
                            <span className={`rounded-full border px-2.5 py-1 text-xs ${member.active ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-slate-500/30 bg-slate-500/10 text-slate-300"}`}>
                              {member.active ? "Active" : "Inactive"}
                            </span>
                          </div>
                          <div className="mt-3 grid gap-x-4 gap-y-1 text-sm text-slate-400 md:grid-cols-2">
                            <p>Email: {member.email || "-"}</p>
                            <p>Phone: {member.phone || "-"}</p>
                          </div>
                          <p className="mt-2 text-sm text-slate-400">Permissions: {member.permissions.join(", ") || "-"}</p>
                        </div>
                        <Button size="sm" variant="secondary" onClick={() => saveStaffList(staffMembers.map((item) => item.id === member.id ? { ...item, active: !item.active } : item))}>
                          {member.active ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="analytics" className="mt-6 space-y-6">
          <section className={panelClass}>
            <h2 className="text-xl font-semibold text-white">Reports & Analytics</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
                <p className="text-sm text-slate-400">Monthly Revenue</p>
                <p className="mt-2 text-2xl font-semibold text-white">{formatCurrencyValue(analytics.paidThisMonth)}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
                <p className="text-sm text-slate-400">Pending Dues</p>
                <p className="mt-2 text-2xl font-semibold text-white">{formatCurrencyValue(analytics.pendingDues)}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
                <p className="text-sm text-slate-400">Monthly Patients</p>
                <p className="mt-2 text-2xl font-semibold text-white">{analytics.monthPatients}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
                <p className="text-sm text-slate-400">Appointments Done</p>
                <p className="mt-2 text-2xl font-semibold text-white">{analytics.completedAppointments}/{analytics.scheduledAppointments}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <div>
                <h3 className="font-semibold text-white">Common Treatments</h3>
                <div className="mt-4 space-y-3">
                  {analytics.commonTreatments.length === 0 ? (
                    <p className={mutedTextClass}>No treatment data yet.</p>
                  ) : (
                    analytics.commonTreatments.map(([label, count]) => {
                      const max = Math.max(...analytics.commonTreatments.map((item) => item[1]), 1);
                      return (
                        <div key={label}>
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span className="text-slate-300">{label}</span>
                            <span className="text-slate-400">{count}</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-800">
                            <div className="h-2 rounded-full bg-sky-400" style={{ width: `${(count / max) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-white">Appointment Status</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {appointmentStatuses.map((status) => (
                    <div key={status} className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
                      <p className="capitalize text-slate-300">{status}</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{appointments.filter((appointment) => appointment.status === status).length}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="settings" className="mt-6 space-y-6">
          <section className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
            <div className={panelClass}>
              <h2 className="text-xl font-semibold text-white">Clinic Settings</h2>
              <div className="mt-5 grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="settings-clinic">Clinic name</Label>
                    <Input id="settings-clinic" value={settingsForm.clinicName} onChange={(event) => setSettingsForm({ ...settingsForm, clinicName: event.target.value })} className={fieldClass} />
                  </div>
                  <div>
                    <Label htmlFor="settings-doctor">Doctor name</Label>
                    <Input id="settings-doctor" value={settingsForm.doctorName} onChange={(event) => setSettingsForm({ ...settingsForm, doctorName: event.target.value })} className={fieldClass} />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label htmlFor="settings-phone">Phone</Label>
                    <Input id="settings-phone" value={settingsForm.phone} onChange={(event) => setSettingsForm({ ...settingsForm, phone: event.target.value })} className={fieldClass} />
                  </div>
                  <div>
                    <Label htmlFor="settings-whatsapp">WhatsApp</Label>
                    <Input id="settings-whatsapp" value={settingsForm.whatsappNumber} onChange={(event) => setSettingsForm({ ...settingsForm, whatsappNumber: event.target.value })} className={fieldClass} />
                  </div>
                  <div>
                    <Label htmlFor="settings-email">Email</Label>
                    <Input id="settings-email" value={settingsForm.email} onChange={(event) => setSettingsForm({ ...settingsForm, email: event.target.value })} className={fieldClass} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="settings-address">Address</Label>
                  <Textarea id="settings-address" value={settingsForm.address} onChange={(event) => setSettingsForm({ ...settingsForm, address: event.target.value })} className={fieldClass} />
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label htmlFor="settings-open">Opening time</Label>
                    <Input id="settings-open" type="time" value={settingsForm.openingTime} onChange={(event) => setSettingsForm({ ...settingsForm, openingTime: event.target.value })} className={fieldClass} />
                  </div>
                  <div>
                    <Label htmlFor="settings-close">Closing time</Label>
                    <Input id="settings-close" type="time" value={settingsForm.closingTime} onChange={(event) => setSettingsForm({ ...settingsForm, closingTime: event.target.value })} className={fieldClass} />
                  </div>
                  <div>
                    <Label htmlFor="settings-reminder">Reminder lead hours</Label>
                    <Input id="settings-reminder" type="number" min="1" value={settingsForm.reminderLeadHours} onChange={(event) => setSettingsForm({ ...settingsForm, reminderLeadHours: event.target.value })} className={fieldClass} />
                  </div>
                </div>
                <div>
                  <Label>Working days</Label>
                  <div className="mt-2 grid gap-2 sm:grid-cols-4">
                    {dayOptions.map((day) => (
                      <label key={day} className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-200">
                        <input type="checkbox" checked={settingsForm.workingDays.includes(day)} onChange={() => toggleWorkingDay(day)} />
                        {day}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <Label htmlFor="settings-footer">Prescription footer</Label>
                  <Textarea id="settings-footer" value={settingsForm.prescriptionFooter} onChange={(event) => setSettingsForm({ ...settingsForm, prescriptionFooter: event.target.value })} className={fieldClass} />
                </div>
              </div>
            </div>

            <div className={panelClass}>
              <h2 className="text-xl font-semibold text-white">Admin Login</h2>
              <div className="mt-5 grid gap-4">
                <div>
                  <Label htmlFor="admin-username">Username</Label>
                  <Input id="admin-username" value={credentialForm.username} onChange={(event) => setCredentialForm({ ...credentialForm, username: event.target.value })} className={fieldClass} />
                </div>
                <div>
                  <Label htmlFor="admin-password">New password</Label>
                  <Input id="admin-password" type="password" value={credentialForm.password} onChange={(event) => setCredentialForm({ ...credentialForm, password: event.target.value })} className={fieldClass} />
                </div>
                <div>
                  <Label htmlFor="admin-confirm">Confirm password</Label>
                  <Input id="admin-confirm" type="password" value={credentialForm.confirmPassword} onChange={(event) => setCredentialForm({ ...credentialForm, confirmPassword: event.target.value })} className={fieldClass} />
                </div>
                <Button onClick={saveSettings} className="gap-2">
                  <Save className="h-4 w-4" />
                  Save settings
                </Button>
                <div className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
                  <p className="font-semibold text-white">{settingsForm.clinicName}</p>
                  <p className="mt-1 text-sm text-slate-400">{settingsForm.doctorName}</p>
                  <p className="mt-1 text-sm text-slate-400">{settingsForm.openingTime} to {settingsForm.closingTime}</p>
                  <p className="mt-1 text-sm text-slate-400">{settingsForm.workingDays.join(", ")}</p>
                </div>
              </div>
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminOperationsPanel;
