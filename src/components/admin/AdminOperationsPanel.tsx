import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Bell,
  CalendarCheck,
  Check,
  CheckCircle2,
  ClipboardList,
  FileText,
  MessageCircle,
  NotebookPen,
  Plus,
  Save,
  UserCog,
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
  getBookings,
  getClinicalNotes,
  getClinicSettings,
  getPatients,
  getStaffMembers,
  getTreatmentPlans,
  setAdminCredentials,
  setClinicalNotes,
  setClinicSettings,
  setPatients,
  setStaffMembers,
  setTreatmentPlans,
} from "@/lib/admin";
import {
  createConsentForm,
  createFollowUp,
  createInsuranceBilling,
  createMedicalReport,
  getConsentForms,
  getFollowUps,
  getInsuranceBillings,
  getMedicalReports,
  getPatientPortalRecords,
  PATIENT_TEMPLATES,
  sendBillingEmail,
  sendFollowUpEmail,
  sendReportEmail,
  updateFollowUp,
  type ConsentForm,
  type FollowUp,
  type InsuranceBilling,
  type MedicalReport,
  type PatientRecord,
} from "@/lib/patient-portal";
import { useQuery } from "@tanstack/react-query";
import {
  formatCurrencyValue,
  formatDateValue,
  formatDateTimeValue,
  getBalanceDueAmount,
  getPatientLabel,
  getTodayInputValue,
  isSameMonth,
  itemRowClass,
  mutedTextClass,
  nativeSelectClass,
  openWhatsApp,
  panelClass,
  sortAppointments,
} from "./adminFormatters";
import { AdminSectionId } from "./adminNav";

type AppointmentFormState = {
  patientId: string;
  patientName: string;
  patientEmail: string;
  patientPhone: string;
  appointmentDate: string;
  appointmentTime: string;
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

type ConsentFormState = {
  patientId: string;
  formType: ConsentForm["formType"];
  title: string;
  content: string;
};

type ReportFormState = {
  patientId: string;
  reportType: string;
  title: string;
  description: string;
};

type BillingFormState = {
  patientId: string;
  claimId: string;
  insuranceProvider: string;
  policyNumber: string;
  treatmentDate: string;
  amount: string;
  notes: string;
};

type TimelineItem = {
  id: string;
  date: string;
  title: string;
  description: string;
  tag: string;
  tone: string;
};

const dayOptions = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const staffPermissionOptions = ["Appointments", "Billing", "Clinical notes", "Reports", "Settings"];
const appointmentStatuses: AppointmentStatus[] = ["scheduled", "waiting", "completed", "cancelled", "missed"];
const reminderTypes: FollowUp["type"][] = ["appointment", "medication", "test", "exercise", "diet"];
const consentTypes: ConsentForm["formType"][] = ["treatment", "surgery", "procedure", "research", "imaging"];
const careTools = [
  { value: "reminders", label: "Reminders" },
  { value: "consent", label: "Consent Forms" },
  { value: "reports", label: "Medical Reports" },
  { value: "billing", label: "Insurance Billing" },
  { value: "templates", label: "Care Templates" },
] as const;

const createDefaultAppointmentForm = (): AppointmentFormState => ({
  patientId: "",
  patientName: "",
  patientEmail: "",
  patientPhone: "",
  appointmentDate: getTodayInputValue(),
  appointmentTime: "10:00",
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

const createDefaultConsentForm = (): ConsentFormState => ({
  patientId: "",
  formType: "treatment",
  title: "",
  content: "",
});

const createDefaultReportForm = (): ReportFormState => ({
  patientId: "",
  reportType: "",
  title: "",
  description: "",
});

const createDefaultBillingForm = (): BillingFormState => ({
  patientId: "",
  claimId: "",
  insuranceProvider: "",
  policyNumber: "",
  treatmentDate: "",
  amount: "",
  notes: "",
});

interface AdminOperationsPanelProps {
  activeTool: AdminSectionId;
  onToolChange: (tool: AdminSectionId) => void;
}

const AdminOperationsPanel = ({ activeTool, onToolChange }: AdminOperationsPanelProps) => {
  const [message, setMessage] = useState("");
  const [patients, setPatientsState] = useState<AdminPatient[]>(() => getPatients());
  const [portalPatients, setPortalPatients] = useState<PatientRecord[]>(() => getPatientPortalRecords());
  const { data: appointments = [], refetch: refetchAppointments } = useQuery({
    queryKey: ["appointments"],
    queryFn: getBookings,
  });
  const [treatmentPlans, setTreatmentPlansState] = useState<TreatmentPlan[]>(() => getTreatmentPlans());
  const [clinicalNotes, setClinicalNotesState] = useState<ClinicalNote[]>(() => getClinicalNotes());
  const [staffMembers, setStaffMembersState] = useState<StaffMember[]>(() => getStaffMembers());
  const [followUps, setFollowUpsState] = useState<FollowUp[]>(() => getFollowUps());
  const [consentForms, setConsentFormsState] = useState<ConsentForm[]>(() => getConsentForms());
  const [medicalReports, setMedicalReportsState] = useState<MedicalReport[]>(() => getMedicalReports());
  const [insuranceBillings, setInsuranceBillingsState] = useState<InsuranceBilling[]>(() => getInsuranceBillings());
  const [settingsForm, setSettingsForm] = useState<ClinicSettings>(() => getClinicSettings());
  const [appointmentForm, setAppointmentForm] = useState(createDefaultAppointmentForm);
  const [calendarDate, setCalendarDate] = useState(getTodayInputValue());
  const [timelinePatientId, setTimelinePatientId] = useState("");
  const [planForm, setPlanForm] = useState(createDefaultTreatmentPlanForm);
  const [noteForm, setNoteForm] = useState(createDefaultClinicalNoteForm);
  const [reminderForm, setReminderForm] = useState(createDefaultReminderForm);
  const [staffForm, setStaffForm] = useState(createDefaultStaffForm);
  const [careTool, setCareTool] = useState<(typeof careTools)[number]["value"]>("reminders");
  const [consentForm, setConsentForm] = useState(createDefaultConsentForm);
  const [reportForm, setReportForm] = useState(createDefaultReportForm);
  const [billingForm, setBillingForm] = useState(createDefaultBillingForm);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [credentialForm, setCredentialForm] = useState(() => {
    const credentials = getAdminCredentials();
    return { username: credentials.username, password: "", confirmPassword: "" };
  });

  useEffect(() => {
    const refreshPatients = () => setPatientsState(getPatients());
    window.addEventListener("patientsUpdated", refreshPatients);
    return () => window.removeEventListener("patientsUpdated", refreshPatients);
  }, []);

  const savePatientList = (updated: AdminPatient[]) => {
    setPatientsState(updated);
  };

  const saveAppointmentList = () => {
    refetchAppointments();
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

  const allCarePatients = useMemo(
    () => [
      ...patients.map((p) => ({ id: p.id, name: p.name, email: p.email || "", phone: p.phone || "" })),
      ...portalPatients.map((p) => ({ id: p.id, name: p.patientName, email: p.patientEmail, phone: p.patientPhone || "" })),
    ],
    [patients, portalPatients],
  );

  const selectedTimelinePatientId = timelinePatientId || patients[0]?.id || "";
  const today = getTodayInputValue();

  const todayAppointments = useMemo(
    () => appointments.filter((appointment) => appointment.appointmentDate === today).sort(sortAppointments),
    [appointments, today],
  );

  const calendarAppointments = useMemo(
    () => appointments.filter((appointment) => appointment.appointmentDate === calendarDate).sort(sortAppointments),
    [appointments, calendarDate],
  );

  const pendingPaymentPatients = useMemo(
    () =>
      patients.filter(
        (patient) => getBalanceDueAmount(patient) > 0 || patient.paymentStatus === "partial" || patient.paymentStatus === "unpaid",
      ),
    [patients],
  );

  const activeReminders = useMemo(
    () => followUps.filter((followUp) => followUp.status !== "completed").sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
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
        date: `${appointment.appointmentDate}T${appointment.appointmentTime}`,
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

    const consentItems = consentForms
      .filter((form) => form.patientId === selectedTimelinePatientId)
      .map((form) => ({
        id: form.id,
        date: form.signatureDate || form.createdDate,
        title: form.title,
        description: form.isSigned ? "Signed consent form" : "Pending consent form",
        tag: "Consent",
        tone: "border-violet-500/30 bg-violet-500/10 text-violet-200",
      }));

    const reportItems = medicalReports
      .filter((report) => report.patientId === selectedTimelinePatientId)
      .map((report) => ({
        id: report.id,
        date: report.date,
        title: report.title,
        description: `${report.reportType}${report.description ? ` | ${report.description}` : ""}`,
        tag: "Report",
        tone: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
      }));

    const billingItems = insuranceBillings
      .filter((billing) => billing.patientId === selectedTimelinePatientId)
      .map((billing) => ({
        id: billing.id,
        date: billing.submissionDate,
        title: `Claim ${billing.claimId}`,
        description: `${billing.insuranceProvider} | ${formatCurrencyValue(billing.amount)} | ${billing.status}`,
        tag: "Billing",
        tone: "border-lime-500/30 bg-lime-500/10 text-lime-200",
      }));

    return [...patientItems, ...appointmentItems, ...planItems, ...noteItems, ...reminderItems, ...consentItems, ...reportItems, ...billingItems].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [appointments, clinicalNotes, consentForms, followUps, insuranceBillings, medicalReports, patients, selectedTimelinePatientId, treatmentPlans]);

  const analytics = useMemo(() => {
    const paidThisMonth = patients.reduce((sum, patient) => {
      if (!isSameMonth(patient.visitDate || patient.prescriptionDate)) return sum;
      return sum + Number(patient.amountPaid || 0);
    }, 0);

    const pendingDues = patients.reduce((sum, patient) => sum + getBalanceDueAmount(patient), 0);
    const monthPatients = patients.filter((patient) => isSameMonth(patient.visitDate || patient.prescriptionDate)).length;
    const completedAppointments = appointments.filter(
      (appointment) => appointment.status === "completed" && isSameMonth(appointment.appointmentDate),
    ).length;
    const scheduledAppointments = appointments.filter((appointment) => isSameMonth(appointment.appointmentDate)).length;

    const treatmentCounts = patients.reduce<Record<string, number>>((acc, patient) => {
      const label = (patient.suffering || "General care").split(/[.,\n]/)[0].trim() || "General care";
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});
    const commonTreatments = Object.entries(treatmentCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return { paidThisMonth, pendingDues, monthPatients, completedAppointments, scheduledAppointments, commonTreatments };
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

  const createAppointment = async () => {
    const patientName = appointmentForm.patientName.trim();
    if (!patientName || !appointmentForm.appointmentDate || !appointmentForm.appointmentTime || !appointmentForm.reason.trim()) {
      setMessage("Add patient, date, time, and appointment reason.");
      return;
    }

    const appointment: AdminAppointment = {
      id: `appointment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      patientId: appointmentForm.patientId || undefined,
      patientName,
      patientEmail: appointmentForm.patientEmail.trim() || undefined,
      patientPhone: appointmentForm.patientPhone.trim() || undefined,
      appointmentDate: appointmentForm.appointmentDate,
      appointmentTime: appointmentForm.appointmentTime,
      durationMinutes: Number(appointmentForm.durationMinutes) || 30,
      reason: appointmentForm.reason.trim(),
      status: appointmentForm.status,
      notes: appointmentForm.notes.trim() || undefined,
      bookingDate: new Date().toISOString(),
    };

    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(appointment),
      });

      if (response.ok) {
        saveAppointmentList();
        setCalendarDate(appointment.appointmentDate);
        setAppointmentForm(createDefaultAppointmentForm());
        setMessage("Appointment added to the calendar.");
      } else {
        setMessage("Failed to create appointment.");
      }
    } catch {
      setMessage("Error creating appointment.");
    }
  };

  const updateAppointmentStatus = async (appointmentId: string, status: AppointmentStatus) => {
    try {
      const response = await fetch(`/api/appointments/${appointmentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (response.ok) {
        saveAppointmentList();
        setMessage(`Appointment marked as ${status}.`);
      } else {
        setMessage("Failed to update appointment status.");
      }
    } catch {
      setMessage("Error updating appointment status.");
    }
  };

  const sendAppointmentReminder = (appointment: AdminAppointment) => {
    const sent = openWhatsApp(
      appointment.patientPhone,
      `Dear ${appointment.patientName}, this is a reminder for your appointment at ${settingsForm.clinicName} on ${formatDateValue(appointment.appointmentDate)} at ${appointment.appointmentTime}.`,
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
      id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

  const createReminder = async () => {
    const patient = allCarePatients.find((item) => item.id === reminderForm.patientId);
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

    if (patient.email) {
      const result = await sendFollowUpEmail({
        patientName: patient.name,
        patientEmail: patient.email,
        patientPhone: patient.phone,
        title: reminderForm.title.trim(),
        description: reminderForm.description.trim(),
        dueDate: reminderForm.dueDate,
        type: reminderForm.type,
      });
      setMessage(result.success ? `Reminder created and email sent to ${patient.name}.` : `Reminder created. Email failed: ${result.message}`);
      return;
    }

    setMessage(`Reminder created for ${patient.name}. No email on file to notify them.`);
  };

  const markReminderCompleted = (followUpId: string) => {
    updateFollowUp(followUpId, { status: "completed", completedDate: new Date().toISOString() });
    setFollowUpsState(getFollowUps());
    setMessage("Reminder marked as completed.");
  };

  const sendReminderMessage = (followUp: FollowUp) => {
    const patient = allCarePatients.find((item) => item.id === followUp.patientId);
    const sent = openWhatsApp(
      patient?.phone,
      `Dear ${patient?.name || "Patient"}, this is a reminder from ${settingsForm.clinicName}: ${followUp.title} is due on ${formatDateValue(followUp.dueDate)}.`,
    );
    setMessage(sent ? "WhatsApp reminder opened." : "No WhatsApp number found for this patient.");
  };

  const createConsent = () => {
    const patient = allCarePatients.find((item) => item.id === consentForm.patientId);
    if (!patient || !consentForm.title.trim() || !consentForm.content.trim()) {
      setMessage("Select a patient and add consent form title plus content.");
      return;
    }

    createConsentForm({
      patientId: patient.id,
      patientName: patient.name,
      patientEmail: patient.email,
      formType: consentForm.formType,
      title: consentForm.title.trim(),
      content: consentForm.content.trim(),
      isSigned: false,
      createdDate: new Date().toISOString(),
    });
    setConsentFormsState(getConsentForms());
    setConsentForm(createDefaultConsentForm());
    setMessage(`Consent form created for ${patient.name}.`);
  };

  const addMedicalReport = async () => {
    const patient = allCarePatients.find((item) => item.id === reportForm.patientId);
    if (!patient || !reportForm.title.trim() || !reportForm.reportType.trim()) {
      setMessage("Select a patient and add report type plus title.");
      return;
    }

    createMedicalReport({
      patientId: patient.id,
      reportType: reportForm.reportType.trim(),
      title: reportForm.title.trim(),
      date: new Date().toISOString().split("T")[0],
      description: reportForm.description.trim(),
    });
    setMedicalReportsState(getMedicalReports());

    if (patient.email) {
      const result = await sendReportEmail({
        patientName: patient.name,
        patientEmail: patient.email,
        patientPhone: patient.phone,
        reportType: reportForm.reportType.trim(),
        title: reportForm.title.trim(),
        description: reportForm.description.trim(),
        date: new Date().toISOString().split("T")[0],
      });
      setMessage(result.success ? `Report added and email sent to ${patient.name}.` : `Report added. Email failed: ${result.message}`);
    } else {
      setMessage(`Report added for ${patient.name}. No email on file to notify them.`);
    }

    setReportForm(createDefaultReportForm());
  };

  const addInsuranceBilling = async () => {
    const patient = allCarePatients.find((item) => item.id === billingForm.patientId);
    if (!patient || !billingForm.claimId.trim() || !billingForm.insuranceProvider.trim() || !billingForm.amount.trim()) {
      setMessage("Select a patient and add claim ID, provider, and amount.");
      return;
    }

    const payload = {
      patientId: patient.id,
      claimId: billingForm.claimId.trim(),
      insuranceProvider: billingForm.insuranceProvider.trim(),
      policyNumber: billingForm.policyNumber.trim(),
      treatmentDate: billingForm.treatmentDate || new Date().toISOString().split("T")[0],
      amount: Number(billingForm.amount),
      status: "submitted" as const,
      submissionDate: new Date().toISOString(),
      notes: billingForm.notes.trim(),
    };

    createInsuranceBilling(payload);
    setInsuranceBillingsState(getInsuranceBillings());

    if (patient.email) {
      const result = await sendBillingEmail({ ...payload, patientName: patient.name, patientEmail: patient.email, patientPhone: patient.phone });
      setMessage(result.success ? `Billing claim saved and email sent to ${patient.name}.` : `Billing claim saved. Email failed: ${result.message}`);
    } else {
      setMessage(`Billing claim saved for ${patient.name}. No email on file to notify them.`);
    }

    setBillingForm(createDefaultBillingForm());
  };

  const applyTemplate = () => {
    const patient = allCarePatients.find((item) => item.id === reminderForm.patientId || item.id === consentForm.patientId);
    if (!selectedTemplate) {
      setMessage("Select a care template to apply.");
      return;
    }
    const template = PATIENT_TEMPLATES.find((item) => item.id === selectedTemplate);
    const targetPatientId = reminderForm.patientId || consentForm.patientId;
    const targetPatient = allCarePatients.find((item) => item.id === targetPatientId);
    if (!template || !targetPatient) {
      setMessage("Select a patient (via Reminders or Consent tab) and a template to apply.");
      return;
    }

    const createdDate = new Date().toISOString();
    template.followUpItems.forEach((item) => {
      createFollowUp({ patientId: targetPatient.id, ...item, status: "pending", createdDate });
    });
    template.consentForms.forEach((form) => {
      createConsentForm({
        patientId: targetPatient.id,
        patientName: targetPatient.name,
        patientEmail: targetPatient.email,
        ...form,
        isSigned: false,
        createdDate,
      });
    });

    setFollowUpsState(getFollowUps());
    setConsentFormsState(getConsentForms());
    setMessage(`Template "${template.name}" applied to ${targetPatient.name}.`);
    setSelectedTemplate("");
  };

  const markPatientPaid = (patient: AdminPatient) => {
    const updated = patients.map((item) =>
      item.id === patient.id ? { ...item, amountPaid: item.totalFees || item.amountPaid || "0", paymentStatus: "paid" as const } : item,
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
      id: `staff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
      permissions: prev.permissions.includes(permission) ? prev.permissions.filter((item) => item !== permission) : [...prev.permissions, permission],
    }));
  };

  const toggleWorkingDay = (day: string) => {
    setSettingsForm((prev) => ({
      ...prev,
      workingDays: prev.workingDays.includes(day) ? prev.workingDays.filter((item) => item !== day) : [...prev.workingDays, day],
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
      setAdminCredentials({ username: credentialForm.username.trim(), password: credentialForm.password || credentials.password });
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
          <div key={appointment.id} className={itemRowClass}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-foreground">
                    {appointment.appointmentTime} - {appointment.patientName}
                  </p>
                  <span className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs capitalize text-secondary-foreground">
                    {appointment.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{appointment.reason}</p>
                <div className="mt-3 grid gap-x-4 gap-y-1 text-sm text-muted-foreground md:grid-cols-2">
                  <p>Duration: {appointment.durationMinutes} min</p>
                  <p>Date: {formatDateValue(appointment.appointmentDate)}</p>
                  <p>Phone: {appointment.patientPhone || "-"}</p>
                  <p>Email: {appointment.patientEmail || "-"}</p>
                </div>
                {appointment.notes && <p className="mt-2 text-sm text-muted-foreground">Notes: {appointment.notes}</p>}
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
      {message && <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">{message}</div>}

      <Tabs value={activeTool} onValueChange={(value) => onToolChange(value as AdminSectionId)} className="w-full">
        <TabsContent value="appointments" className="space-y-6">
          <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <div className={panelClass}>
              <h2 className="text-xl font-semibold text-foreground">New Appointment</h2>
              <div className="mt-5 grid gap-4">
                <div>
                  <Label htmlFor="appointment-patient">Patient</Label>
                  <select id="appointment-patient" value={appointmentForm.patientId} onChange={(event) => selectPatientForAppointment(event.target.value)} className={nativeSelectClass}>
                    <option value="">Walk-in or new patient</option>
                    {patients.map((patient) => (
                      <option key={patient.id} value={patient.id}>{getPatientLabel(patient)}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="appointment-name">Patient name</Label>
                    <Input id="appointment-name" value={appointmentForm.patientName} onChange={(event) => setAppointmentForm({ ...appointmentForm, patientName: event.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="appointment-phone">Phone</Label>
                    <Input id="appointment-phone" value={appointmentForm.patientPhone} onChange={(event) => setAppointmentForm({ ...appointmentForm, patientPhone: event.target.value })} />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label htmlFor="appointment-date">Date</Label>
                    <Input id="appointment-date" type="date" value={appointmentForm.appointmentDate} onChange={(event) => setAppointmentForm({ ...appointmentForm, appointmentDate: event.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="appointment-time">Time</Label>
                    <Input id="appointment-time" type="time" value={appointmentForm.appointmentTime} onChange={(event) => setAppointmentForm({ ...appointmentForm, appointmentTime: event.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="appointment-duration">Minutes</Label>
                    <Input id="appointment-duration" type="number" min="5" value={appointmentForm.durationMinutes} onChange={(event) => setAppointmentForm({ ...appointmentForm, durationMinutes: event.target.value })} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="appointment-reason">Reason</Label>
                  <Textarea id="appointment-reason" value={appointmentForm.reason} onChange={(event) => setAppointmentForm({ ...appointmentForm, reason: event.target.value })} placeholder="Consultation, extraction, scaling, follow-up..." />
                </div>
                <div>
                  <Label htmlFor="appointment-notes">Notes</Label>
                  <Input id="appointment-notes" value={appointmentForm.notes} onChange={(event) => setAppointmentForm({ ...appointmentForm, notes: event.target.value })} />
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
                  <h2 className="text-xl font-semibold text-foreground">Day View</h2>
                  <p className={mutedTextClass}>Review and update appointment status for the selected day.</p>
                </div>
                <Input type="date" value={calendarDate} onChange={(event) => setCalendarDate(event.target.value)} />
              </div>
              {renderAppointmentList(calendarDate === today ? todayAppointments : calendarAppointments)}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="timeline" className="space-y-6">
          <section className={panelClass}>
            <div className="grid gap-4 lg:grid-cols-[1fr_320px] lg:items-end">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Patient Timeline</h2>
                <p className={mutedTextClass}>Visits, appointments, notes, plans, reminders, reports, consent forms, and billing in one view.</p>
              </div>
              <div>
                <Label htmlFor="timeline-patient">Patient</Label>
                <select id="timeline-patient" value={selectedTimelinePatientId} onChange={(event) => setTimelinePatientId(event.target.value)} className={nativeSelectClass}>
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
                  <div key={`${item.tag}-${item.id}`} className={itemRowClass}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${item.tone}`}>{item.tag}</span>
                          <p className="font-semibold text-foreground">{item.title}</p>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">{formatDateTimeValue(item.date)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="plans" className="space-y-6">
          <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className={panelClass}>
              <h2 className="text-xl font-semibold text-foreground">Treatment Plans</h2>
              <div className="mt-5 grid gap-4">
                <div>
                  <Label htmlFor="plan-patient">Patient</Label>
                  <select id="plan-patient" value={planForm.patientId} onChange={(event) => setPlanForm({ ...planForm, patientId: event.target.value })} className={nativeSelectClass}>
                    <option value="">Select patient</option>
                    {patients.map((patient) => <option key={patient.id} value={patient.id}>{getPatientLabel(patient)}</option>)}
                  </select>
                </div>
                <div>
                  <Label htmlFor="plan-title">Plan</Label>
                  <Input id="plan-title" value={planForm.title} onChange={(event) => setPlanForm({ ...planForm, title: event.target.value })} placeholder="Root canal treatment, implant plan..." />
                </div>
                <div>
                  <Label htmlFor="plan-diagnosis">Diagnosis</Label>
                  <Textarea id="plan-diagnosis" value={planForm.diagnosis} onChange={(event) => setPlanForm({ ...planForm, diagnosis: event.target.value })} />
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label htmlFor="plan-cost">Estimated cost</Label>
                    <Input id="plan-cost" type="number" min="0" value={planForm.estimatedCost} onChange={(event) => setPlanForm({ ...planForm, estimatedCost: event.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="plan-total">Sessions</Label>
                    <Input id="plan-total" type="number" min="1" value={planForm.totalSessions} onChange={(event) => setPlanForm({ ...planForm, totalSessions: event.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="plan-complete">Completed</Label>
                    <Input id="plan-complete" type="number" min="0" value={planForm.completedSessions} onChange={(event) => setPlanForm({ ...planForm, completedSessions: event.target.value })} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="plan-next">Next step</Label>
                  <Input id="plan-next" value={planForm.nextStep} onChange={(event) => setPlanForm({ ...planForm, nextStep: event.target.value })} />
                </div>
                <Button onClick={createTreatmentPlan} className="gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Save treatment plan
                </Button>
              </div>
            </div>

            <div className={panelClass}>
              <h2 className="text-xl font-semibold text-foreground">Active Plans</h2>
              <div className="mt-5 space-y-3">
                {treatmentPlans.length === 0 ? (
                  <p className={mutedTextClass}>No treatment plans saved yet.</p>
                ) : (
                  treatmentPlans.map((plan) => {
                    const percent = Math.round((plan.completedSessions / Math.max(plan.totalSessions, 1)) * 100);
                    return (
                      <div key={plan.id} className={itemRowClass}>
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex-1">
                            <p className="font-semibold text-foreground">{plan.title}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{plan.patientName} | {plan.status}</p>
                            <p className="mt-2 text-sm text-muted-foreground">{plan.diagnosis}</p>
                            <p className="mt-1 text-sm text-muted-foreground">Next: {plan.nextStep}</p>
                            <div className="mt-3 h-2 rounded-full bg-muted">
                              <div className="h-2 rounded-full bg-emerald-400" style={{ width: `${Math.min(percent, 100)}%` }} />
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground">{plan.completedSessions}/{plan.totalSessions} sessions | {formatCurrencyValue(plan.estimatedCost)}</p>
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

        <TabsContent value="payments" className="space-y-6">
          <section className={panelClass}>
            <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Pending Payments</h2>
                <p className={mutedTextClass}>Follow up with unpaid and partially paid patients.</p>
              </div>
              <p className="text-lg font-semibold text-foreground">{formatCurrencyValue(analytics.pendingDues)}</p>
            </div>
            <div className="space-y-3">
              {pendingPaymentPatients.length === 0 ? (
                <p className={mutedTextClass}>No pending payments.</p>
              ) : (
                pendingPaymentPatients.map((patient) => (
                  <div key={patient.id} className={itemRowClass}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="font-semibold text-foreground">{patient.name}</p>
                        <div className="mt-2 grid gap-x-4 gap-y-1 text-sm text-muted-foreground md:grid-cols-2">
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

        <TabsContent value="notes" className="space-y-6">
          <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className={panelClass}>
              <h2 className="text-xl font-semibold text-foreground">Clinical Notes & Case History</h2>
              <div className="mt-5 grid gap-4">
                <div>
                  <Label htmlFor="note-patient">Patient</Label>
                  <select id="note-patient" value={noteForm.patientId} onChange={(event) => setNoteForm({ ...noteForm, patientId: event.target.value })} className={nativeSelectClass}>
                    <option value="">Select patient</option>
                    {patients.map((patient) => <option key={patient.id} value={patient.id}>{getPatientLabel(patient)}</option>)}
                  </select>
                </div>
                <div>
                  <Label htmlFor="note-date">Visit date</Label>
                  <Input id="note-date" type="date" value={noteForm.visitDate} onChange={(event) => setNoteForm({ ...noteForm, visitDate: event.target.value })} />
                </div>
                <div>
                  <Label htmlFor="note-symptoms">Symptoms</Label>
                  <Textarea id="note-symptoms" value={noteForm.symptoms} onChange={(event) => setNoteForm({ ...noteForm, symptoms: event.target.value })} />
                </div>
                <div>
                  <Label htmlFor="note-diagnosis">Diagnosis</Label>
                  <Textarea id="note-diagnosis" value={noteForm.diagnosis} onChange={(event) => setNoteForm({ ...noteForm, diagnosis: event.target.value })} />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="note-allergies">Allergies</Label>
                    <Input id="note-allergies" value={noteForm.allergies} onChange={(event) => setNoteForm({ ...noteForm, allergies: event.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="note-history">Medical history</Label>
                    <Input id="note-history" value={noteForm.medicalHistory} onChange={(event) => setNoteForm({ ...noteForm, medicalHistory: event.target.value })} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="note-doctor">Doctor-only notes</Label>
                  <Textarea id="note-doctor" value={noteForm.doctorNotes} onChange={(event) => setNoteForm({ ...noteForm, doctorNotes: event.target.value })} />
                </div>
                <Button onClick={createClinicalNote} className="gap-2">
                  <NotebookPen className="h-4 w-4" />
                  Save note
                </Button>
              </div>
            </div>

            <div className={panelClass}>
              <h2 className="text-xl font-semibold text-foreground">Recent Notes</h2>
              <div className="mt-5 space-y-3">
                {clinicalNotes.length === 0 ? (
                  <p className={mutedTextClass}>No clinical notes saved yet.</p>
                ) : (
                  clinicalNotes.map((note) => (
                    <div key={note.id} className={itemRowClass}>
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="font-semibold text-foreground">{note.patientName}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{note.diagnosis}</p>
                        </div>
                        <p className="text-sm text-muted-foreground">{formatDateValue(note.visitDate)}</p>
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground">Symptoms: {note.symptoms}</p>
                      {note.allergies && <p className="text-sm text-muted-foreground">Allergies: {note.allergies}</p>}
                      {note.medicalHistory && <p className="text-sm text-muted-foreground">History: {note.medicalHistory}</p>}
                      {note.doctorNotes && <p className="text-sm text-muted-foreground">Doctor notes: {note.doctorNotes}</p>}
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="care" className="space-y-6">
          <section className={panelClass}>
            <h2 className="text-xl font-semibold text-foreground">Care & Reminders</h2>
            <p className={mutedTextClass}>Follow-up reminders, consent forms, medical reports, insurance billing, and quick-apply care templates - all in one place.</p>

            <Tabs value={careTool} onValueChange={(value) => setCareTool(value as typeof careTool)} className="mt-5 w-full">
              <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0 sm:grid-cols-5">
                {careTools.map((tool) => (
                  <TabsTrigger key={tool.value} value={tool.value} className="h-10 rounded-lg border border-border bg-background px-2 text-sm text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                    {tool.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="reminders" className="mt-5">
                <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                  <div>
                    <h3 className="font-semibold text-foreground">Create Reminder</h3>
                    <div className="mt-4 grid gap-4">
                      <div>
                        <Label htmlFor="reminder-patient">Patient</Label>
                        <select id="reminder-patient" value={reminderForm.patientId} onChange={(event) => setReminderForm({ ...reminderForm, patientId: event.target.value })} className={nativeSelectClass}>
                          <option value="">Select patient</option>
                          {allCarePatients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}{patient.phone ? ` (${patient.phone})` : ""}</option>)}
                        </select>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Label htmlFor="reminder-title">Reminder</Label>
                          <Input id="reminder-title" value={reminderForm.title} onChange={(event) => setReminderForm({ ...reminderForm, title: event.target.value })} placeholder="Cleaning recall, post-treatment checkup..." />
                        </div>
                        <div>
                          <Label htmlFor="reminder-date">Due date</Label>
                          <Input id="reminder-date" type="date" value={reminderForm.dueDate} onChange={(event) => setReminderForm({ ...reminderForm, dueDate: event.target.value })} />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="reminder-type">Type</Label>
                        <select id="reminder-type" value={reminderForm.type} onChange={(event) => setReminderForm({ ...reminderForm, type: event.target.value as FollowUp["type"] })} className={nativeSelectClass}>
                          {reminderTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label htmlFor="reminder-desc">Details</Label>
                        <Textarea id="reminder-desc" value={reminderForm.description} onChange={(event) => setReminderForm({ ...reminderForm, description: event.target.value })} />
                      </div>
                      <Button onClick={createReminder} className="gap-2">
                        <Bell className="h-4 w-4" />
                        Create reminder
                      </Button>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-foreground">Open Reminders</h3>
                    <div className="mt-4 space-y-3">
                      {activeReminders.length === 0 ? (
                        <p className={mutedTextClass}>No pending reminders.</p>
                      ) : (
                        activeReminders.map((followUp) => {
                          const patient = allCarePatients.find((item) => item.id === followUp.patientId);
                          return (
                            <div key={followUp.id} className={itemRowClass}>
                              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                  <p className="font-semibold text-foreground">{followUp.title}</p>
                                  <p className="mt-1 text-sm text-muted-foreground">{patient?.name || "Patient"} | due {formatDateValue(followUp.dueDate)} | {followUp.type}</p>
                                  <p className="mt-2 text-sm text-muted-foreground">{followUp.description || "No details added."}</p>
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
                </div>
              </TabsContent>

              <TabsContent value="consent" className="mt-5">
                <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                  <div>
                    <h3 className="flex items-center gap-2 font-semibold text-foreground">
                      <AlertCircle className="h-4 w-4" /> Create Consent Form
                    </h3>
                    <div className="mt-4 grid gap-4">
                      <div>
                        <Label htmlFor="consent-patient">Patient</Label>
                        <select id="consent-patient" value={consentForm.patientId} onChange={(event) => setConsentForm({ ...consentForm, patientId: event.target.value })} className={nativeSelectClass}>
                          <option value="">Select patient</option>
                          {allCarePatients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label htmlFor="consent-type">Form type</Label>
                        <select id="consent-type" value={consentForm.formType} onChange={(event) => setConsentForm({ ...consentForm, formType: event.target.value as ConsentForm["formType"] })} className={nativeSelectClass}>
                          {consentTypes.map((type) => <option key={type} value={type} className="capitalize">{type}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label htmlFor="consent-title">Form title</Label>
                        <Input id="consent-title" value={consentForm.title} onChange={(event) => setConsentForm({ ...consentForm, title: event.target.value })} placeholder="e.g. Surgical Procedure Consent" />
                      </div>
                      <div>
                        <Label htmlFor="consent-content">Consent text</Label>
                        <Textarea id="consent-content" value={consentForm.content} onChange={(event) => setConsentForm({ ...consentForm, content: event.target.value })} className="min-h-32" />
                      </div>
                      <Button onClick={createConsent} className="gap-2">
                        <Plus className="h-4 w-4" />
                        Create consent form
                      </Button>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-foreground">Consent Forms</h3>
                    <div className="mt-4 space-y-3">
                      {consentForms.length === 0 ? (
                        <p className={mutedTextClass}>No consent forms created yet.</p>
                      ) : (
                        consentForms.map((form) => (
                          <div key={form.id} className={itemRowClass}>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-foreground">{form.title}</p>
                                <p className="mt-1 text-sm text-muted-foreground">{form.patientName} | {form.formType}</p>
                              </div>
                              <span className={`rounded-full border px-2.5 py-1 text-xs ${form.isSigned ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>
                                {form.isSigned ? "Signed" : "Pending"}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="reports" className="mt-5">
                <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                  <div>
                    <h3 className="flex items-center gap-2 font-semibold text-foreground">
                      <FileText className="h-4 w-4" /> Add Medical Report
                    </h3>
                    <div className="mt-4 grid gap-4">
                      <div>
                        <Label htmlFor="report-patient">Patient</Label>
                        <select id="report-patient" value={reportForm.patientId} onChange={(event) => setReportForm({ ...reportForm, patientId: event.target.value })} className={nativeSelectClass}>
                          <option value="">Select patient</option>
                          {allCarePatients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label htmlFor="report-type">Report type</Label>
                        <Input id="report-type" value={reportForm.reportType} onChange={(event) => setReportForm({ ...reportForm, reportType: event.target.value })} placeholder="e.g. Blood Test, X-Ray, ECG" />
                      </div>
                      <div>
                        <Label htmlFor="report-title">Report title</Label>
                        <Input id="report-title" value={reportForm.title} onChange={(event) => setReportForm({ ...reportForm, title: event.target.value })} placeholder="e.g. Complete Blood Count Report" />
                      </div>
                      <div>
                        <Label htmlFor="report-description">Description</Label>
                        <Textarea id="report-description" value={reportForm.description} onChange={(event) => setReportForm({ ...reportForm, description: event.target.value })} placeholder="Report summary or notes" />
                      </div>
                      <Button onClick={addMedicalReport} className="gap-2">
                        <Plus className="h-4 w-4" />
                        Add report
                      </Button>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-foreground">Medical Reports</h3>
                    <div className="mt-4 space-y-3">
                      {medicalReports.length === 0 ? (
                        <p className={mutedTextClass}>No medical reports added yet.</p>
                      ) : (
                        medicalReports.map((report) => (
                          <div key={report.id} className={itemRowClass}>
                            <p className="font-semibold text-foreground">{report.title}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{report.reportType} | {formatDateValue(report.date)}</p>
                            {report.description && <p className="mt-2 text-sm text-muted-foreground">{report.description}</p>}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="billing" className="mt-5">
                <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                  <div>
                    <h3 className="flex items-center gap-2 font-semibold text-foreground">
                      <AlertCircle className="h-4 w-4" /> Insurance Claim Submission
                    </h3>
                    <div className="mt-4 grid gap-4">
                      <div>
                        <Label htmlFor="billing-patient">Patient</Label>
                        <select id="billing-patient" value={billingForm.patientId} onChange={(event) => setBillingForm({ ...billingForm, patientId: event.target.value })} className={nativeSelectClass}>
                          <option value="">Select patient</option>
                          {allCarePatients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}
                        </select>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Label htmlFor="claim-id">Claim ID</Label>
                          <Input id="claim-id" value={billingForm.claimId} onChange={(event) => setBillingForm({ ...billingForm, claimId: event.target.value })} placeholder="CLM-2026-001" />
                        </div>
                        <div>
                          <Label htmlFor="insurance-provider">Insurance provider</Label>
                          <Input id="insurance-provider" value={billingForm.insuranceProvider} onChange={(event) => setBillingForm({ ...billingForm, insuranceProvider: event.target.value })} placeholder="e.g. HDFC Insurance" />
                        </div>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Label htmlFor="policy-number">Policy number</Label>
                          <Input id="policy-number" value={billingForm.policyNumber} onChange={(event) => setBillingForm({ ...billingForm, policyNumber: event.target.value })} placeholder="POL-123456" />
                        </div>
                        <div>
                          <Label htmlFor="treatment-date">Treatment date</Label>
                          <Input id="treatment-date" type="date" value={billingForm.treatmentDate} onChange={(event) => setBillingForm({ ...billingForm, treatmentDate: event.target.value })} />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="billing-amount">Claim amount (INR)</Label>
                        <Input id="billing-amount" type="number" value={billingForm.amount} onChange={(event) => setBillingForm({ ...billingForm, amount: event.target.value })} placeholder="50000" />
                      </div>
                      <div>
                        <Label htmlFor="billing-notes">Notes</Label>
                        <Textarea id="billing-notes" value={billingForm.notes} onChange={(event) => setBillingForm({ ...billingForm, notes: event.target.value })} placeholder="Any additional notes about the claim" />
                      </div>
                      <Button onClick={addInsuranceBilling} className="gap-2">
                        <Plus className="h-4 w-4" />
                        Submit billing
                      </Button>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-foreground">Insurance Claims</h3>
                    <div className="mt-4 space-y-3">
                      {insuranceBillings.length === 0 ? (
                        <p className={mutedTextClass}>No insurance claims submitted yet.</p>
                      ) : (
                        insuranceBillings.map((billing) => (
                          <div key={billing.id} className={itemRowClass}>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-foreground">Claim {billing.claimId}</p>
                                <p className="mt-1 text-sm text-muted-foreground">{billing.insuranceProvider} | {formatCurrencyValue(billing.amount)}</p>
                              </div>
                              <span className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs capitalize text-secondary-foreground">{billing.status}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="templates" className="mt-5">
                <div className={itemRowClass}>
                  <h3 className="flex items-center gap-2 font-semibold text-foreground">
                    <Check className="h-4 w-4" /> Apply Care Template
                  </h3>
                  <p className={`mt-1 ${mutedTextClass}`}>
                    Quick-apply pre-configured follow-ups and consent forms. Select a patient from the Reminders or Consent tab first, then choose a template.
                  </p>
                  <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                    <div>
                      <Label htmlFor="template-select">Template</Label>
                      <select id="template-select" value={selectedTemplate} onChange={(event) => setSelectedTemplate(event.target.value)} className={nativeSelectClass}>
                        <option value="">Choose a template...</option>
                        {PATIENT_TEMPLATES.map((template) => (
                          <option key={template.id} value={template.id}>{template.name} ({template.followUpItems.length} follow-ups)</option>
                        ))}
                      </select>
                    </div>
                    <Button onClick={applyTemplate} disabled={!selectedTemplate} className="gap-2">
                      <Check className="h-4 w-4" />
                      Apply template
                    </Button>
                  </div>
                  {selectedTemplate && (
                    <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">
                      {(() => {
                        const template = PATIENT_TEMPLATES.find((item) => item.id === selectedTemplate);
                        if (!template) return null;
                        return (
                          <div className="space-y-1">
                            <p className="font-medium">Template includes {template.followUpItems.length} follow-up tasks</p>
                            <p>{template.consentForms.length} consent forms</p>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </section>
        </TabsContent>

        <TabsContent value="staff" className="space-y-6">
          <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className={panelClass}>
              <h2 className="text-xl font-semibold text-foreground">Staff & Role Access</h2>
              <div className="mt-5 grid gap-4">
                <div>
                  <Label htmlFor="staff-name">Name</Label>
                  <Input id="staff-name" value={staffForm.name} onChange={(event) => setStaffForm({ ...staffForm, name: event.target.value })} />
                </div>
                <div>
                  <Label htmlFor="staff-role">Role</Label>
                  <select id="staff-role" value={staffForm.role} onChange={(event) => setStaffForm({ ...staffForm, role: event.target.value as StaffMember["role"] })} className={nativeSelectClass}>
                    <option value="doctor">Doctor</option>
                    <option value="receptionist">Receptionist</option>
                    <option value="assistant">Assistant</option>
                  </select>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="staff-email">Email</Label>
                    <Input id="staff-email" value={staffForm.email} onChange={(event) => setStaffForm({ ...staffForm, email: event.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="staff-phone">Phone</Label>
                    <Input id="staff-phone" value={staffForm.phone} onChange={(event) => setStaffForm({ ...staffForm, phone: event.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Permissions</Label>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {staffPermissionOptions.map((permission) => (
                      <label key={permission} className={`flex items-center gap-2 ${itemRowClass} py-2 text-sm text-foreground`}>
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
              <h2 className="text-xl font-semibold text-foreground">Team Access</h2>
              <div className="mt-5 space-y-3">
                {staffMembers.length === 0 ? (
                  <p className={mutedTextClass}>No staff records saved yet.</p>
                ) : (
                  staffMembers.map((member) => (
                    <div key={member.id} className={itemRowClass}>
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-foreground">{member.name}</p>
                            <span className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs capitalize text-secondary-foreground">{member.role}</span>
                            <span className={`rounded-full border px-2.5 py-1 text-xs ${member.active ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-muted-foreground/30 bg-muted text-muted-foreground"}`}>
                              {member.active ? "Active" : "Inactive"}
                            </span>
                          </div>
                          <div className="mt-3 grid gap-x-4 gap-y-1 text-sm text-muted-foreground md:grid-cols-2">
                            <p>Email: {member.email || "-"}</p>
                            <p>Phone: {member.phone || "-"}</p>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">Permissions: {member.permissions.join(", ") || "-"}</p>
                        </div>
                        <Button size="sm" variant="secondary" onClick={() => saveStaffList(staffMembers.map((item) => (item.id === member.id ? { ...item, active: !item.active } : item)))}>
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

        <TabsContent value="analytics" className="space-y-6">
          <section className={panelClass}>
            <h2 className="text-xl font-semibold text-foreground">Reports & Analytics</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className={itemRowClass}>
                <p className="text-sm text-muted-foreground">Monthly Revenue</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{formatCurrencyValue(analytics.paidThisMonth)}</p>
              </div>
              <div className={itemRowClass}>
                <p className="text-sm text-muted-foreground">Pending Dues</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{formatCurrencyValue(analytics.pendingDues)}</p>
              </div>
              <div className={itemRowClass}>
                <p className="text-sm text-muted-foreground">Monthly Patients</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{analytics.monthPatients}</p>
              </div>
              <div className={itemRowClass}>
                <p className="text-sm text-muted-foreground">Appointments Done</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{analytics.completedAppointments}/{analytics.scheduledAppointments}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <div>
                <h3 className="font-semibold text-foreground">Common Treatments</h3>
                <div className="mt-4 space-y-3">
                  {analytics.commonTreatments.length === 0 ? (
                    <p className={mutedTextClass}>No treatment data yet.</p>
                  ) : (
                    analytics.commonTreatments.map(([label, count]) => {
                      const max = Math.max(...analytics.commonTreatments.map((item) => item[1]), 1);
                      return (
                        <div key={label}>
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span className="text-foreground">{label}</span>
                            <span className="text-muted-foreground">{count}</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted">
                            <div className="h-2 rounded-full bg-sky-400" style={{ width: `${(count / max) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-foreground">Appointment Status</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {appointmentStatuses.map((status) => (
                    <div key={status} className={itemRowClass}>
                      <p className="capitalize text-foreground">{status}</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{appointments.filter((appointment) => appointment.status === status).length}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <section className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
            <div className={panelClass}>
              <h2 className="text-xl font-semibold text-foreground">Clinic Settings</h2>
              <div className="mt-5 grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="settings-clinic">Clinic name</Label>
                    <Input id="settings-clinic" value={settingsForm.clinicName} onChange={(event) => setSettingsForm({ ...settingsForm, clinicName: event.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="settings-doctor">Doctor name</Label>
                    <Input id="settings-doctor" value={settingsForm.doctorName} onChange={(event) => setSettingsForm({ ...settingsForm, doctorName: event.target.value })} />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label htmlFor="settings-phone">Phone</Label>
                    <Input id="settings-phone" value={settingsForm.phone} onChange={(event) => setSettingsForm({ ...settingsForm, phone: event.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="settings-whatsapp">WhatsApp</Label>
                    <Input id="settings-whatsapp" value={settingsForm.whatsappNumber} onChange={(event) => setSettingsForm({ ...settingsForm, whatsappNumber: event.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="settings-email">Email</Label>
                    <Input id="settings-email" value={settingsForm.email} onChange={(event) => setSettingsForm({ ...settingsForm, email: event.target.value })} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="settings-address">Address</Label>
                  <Textarea id="settings-address" value={settingsForm.address} onChange={(event) => setSettingsForm({ ...settingsForm, address: event.target.value })} />
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label htmlFor="settings-open">Opening time</Label>
                    <Input id="settings-open" type="time" value={settingsForm.openingTime} onChange={(event) => setSettingsForm({ ...settingsForm, openingTime: event.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="settings-close">Closing time</Label>
                    <Input id="settings-close" type="time" value={settingsForm.closingTime} onChange={(event) => setSettingsForm({ ...settingsForm, closingTime: event.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="settings-reminder">Reminder lead hours</Label>
                    <Input id="settings-reminder" type="number" min="1" value={settingsForm.reminderLeadHours} onChange={(event) => setSettingsForm({ ...settingsForm, reminderLeadHours: event.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Working days</Label>
                  <div className="mt-2 grid gap-2 sm:grid-cols-4">
                    {dayOptions.map((day) => (
                      <label key={day} className={`flex items-center gap-2 ${itemRowClass} py-2 text-sm text-foreground`}>
                        <input type="checkbox" checked={settingsForm.workingDays.includes(day)} onChange={() => toggleWorkingDay(day)} />
                        {day}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <Label htmlFor="settings-footer">Prescription footer</Label>
                  <Textarea id="settings-footer" value={settingsForm.prescriptionFooter} onChange={(event) => setSettingsForm({ ...settingsForm, prescriptionFooter: event.target.value })} />
                </div>
              </div>
            </div>

            <div className={panelClass}>
              <h2 className="text-xl font-semibold text-foreground">Admin Login</h2>
              <div className="mt-5 grid gap-4">
                <div>
                  <Label htmlFor="admin-username">Username</Label>
                  <Input id="admin-username" value={credentialForm.username} onChange={(event) => setCredentialForm({ ...credentialForm, username: event.target.value })} />
                </div>
                <div>
                  <Label htmlFor="admin-password">New password</Label>
                  <Input id="admin-password" type="password" value={credentialForm.password} onChange={(event) => setCredentialForm({ ...credentialForm, password: event.target.value })} />
                </div>
                <div>
                  <Label htmlFor="admin-confirm">Confirm password</Label>
                  <Input id="admin-confirm" type="password" value={credentialForm.confirmPassword} onChange={(event) => setCredentialForm({ ...credentialForm, confirmPassword: event.target.value })} />
                </div>
                <Button onClick={saveSettings} className="gap-2">
                  <Save className="h-4 w-4" />
                  Save settings
                </Button>
                <div className={itemRowClass}>
                  <p className="font-semibold text-foreground">{settingsForm.clinicName}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{settingsForm.doctorName}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{settingsForm.openingTime} to {settingsForm.closingTime}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{settingsForm.workingDays.join(", ")}</p>
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
