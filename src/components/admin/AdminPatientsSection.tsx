import { useEffect, useState } from "react";
import { Search, Send, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AdminPatient,
  getPatients,
  sendPrescriptionEmail,
  setPatients,
} from "@/lib/admin";
import {
  formatCurrencyValue,
  formatDateValue,
  getBalanceDueAmount,
  getPrescriptionBadge,
  getTodayInputValue,
  mutedTextClass,
  nativeSelectClass,
  panelClass,
} from "./adminFormatters";

const createDefaultPatientState = () => ({
  name: "",
  visitDate: getTodayInputValue(),
  gender: "",
  age: "",
  email: "",
  phone: "",
  address: "",
  suffering: "",
  prescription: "",
  totalFees: "",
  amountPaid: "",
  paymentStatus: "unpaid",
  nextAppointmentDate: "",
  notes: "",
});

const normalizeWhatsAppNumber = (value?: string) => {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `91${digits.slice(1)}`;
  return digits;
};

const buildManualPrescriptionWhatsAppUrl = (patient: AdminPatient) => {
  const number = normalizeWhatsAppNumber(patient.phone);
  if (!number) return "";

  const message = [
    `Dear ${patient.name}, your prescription from Dr. Rana Dental Clinic has been sent to your email.`,
    "Please find the same prescription PDF attached here on WhatsApp.",
    "For help, please contact the clinic.",
  ].join("\n\n");

  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
};

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

const AdminPatientsSection = () => {
  const [patients, setPatientsState] = useState<AdminPatient[]>([]);
  const [newPatient, setNewPatient] = useState(createDefaultPatientState);
  const [message, setMessage] = useState("");
  const [patientSearch, setPatientSearch] = useState("");

  useEffect(() => {
    setPatientsState(getPatients());
    const refreshPatients = () => setPatientsState(getPatients());
    window.addEventListener("patientsUpdated", refreshPatients);
    return () => window.removeEventListener("patientsUpdated", refreshPatients);
  }, []);

  const savePatients = (updated: AdminPatient[]) => {
    setPatients(updated);
    setPatientsState(updated);
  };

  const markPrescriptionSent = (patientId: string, patientList: AdminPatient[] = patients) => {
    const sentAt = new Date().toISOString();
    const updated = patientList.map((patient) => (patient.id === patientId ? { ...patient, prescriptionSentAt: sentAt } : patient));
    savePatients(updated);
    return sentAt;
  };

  const createPatient = async () => {
    const trimmedName = newPatient.name.trim();
    const trimmedSuffering = newPatient.suffering.trim();
    const trimmedPrescription = newPatient.prescription.trim();
    const trimmedEmail = newPatient.email.trim();
    if (!trimmedName || !trimmedSuffering || !trimmedPrescription) {
      setMessage("Please add patient, suffering, and prescription details.");
      return;
    }

    if (trimmedEmail && !isValidEmail(trimmedEmail)) {
      setMessage("Please enter a valid patient email address.");
      return;
    }

    const prescriptionDate = new Date().toISOString();
    const patient: AdminPatient = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmedName,
      visitDate: newPatient.visitDate || prescriptionDate,
      gender: newPatient.gender || undefined,
      age: newPatient.age.trim() || undefined,
      suffering: trimmedSuffering,
      email: trimmedEmail || undefined,
      phone: newPatient.phone.trim() || undefined,
      address: newPatient.address.trim() || undefined,
      prescription: trimmedPrescription,
      prescriptionDate,
      totalFees: newPatient.totalFees.trim() || undefined,
      amountPaid: newPatient.amountPaid.trim() || undefined,
      paymentStatus: newPatient.paymentStatus as AdminPatient["paymentStatus"],
      nextAppointmentDate: newPatient.nextAppointmentDate || undefined,
      notes: newPatient.notes.trim() || undefined,
    };

    const updated = [patient, ...patients];
    savePatients(updated);
    setNewPatient(createDefaultPatientState());

    if (patient.email) {
      const notificationResult = await sendPrescriptionEmail({
        patientName: patient.name,
        patientEmail: patient.email,
        patientPhone: patient.phone,
        gender: patient.gender,
        age: patient.age,
        address: patient.address,
        suffering: patient.suffering,
        prescription: patient.prescription,
        prescriptionDate: patient.prescriptionDate,
        visitDate: patient.visitDate,
        totalFees: patient.totalFees,
        amountPaid: patient.amountPaid,
        paymentStatus: patient.paymentStatus,
        nextAppointmentDate: patient.nextAppointmentDate,
        notes: patient.notes,
      });

      if (notificationResult.success) {
        markPrescriptionSent(patient.id, updated);
        setMessage(`Patient saved. ${notificationResult.message}`);
      } else {
        setMessage(`${notificationResult.message} You can retry from "Send prescription".`);
      }
      return;
    }

    setMessage("Patient record added successfully. Add an email to send the prescription PDF.");
  };

  const sendPrescription = async (patient: AdminPatient) => {
    if (!patient.email) {
      setMessage(`No email found for ${patient.name}. Add an email to send the prescription PDF.`);
      return;
    }

    if (patient.email && !isValidEmail(patient.email)) {
      setMessage(`The email address for ${patient.name} is invalid. Update the patient email and try again.`);
      return;
    }

    const whatsappWindow = patient.phone ? window.open("", "_blank") : null;
    const pdfWindow = window.open("", "_blank");

    const notificationResult = await sendPrescriptionEmail({
      patientName: patient.name,
      patientEmail: patient.email,
      patientPhone: patient.phone,
      gender: patient.gender,
      age: patient.age,
      address: patient.address,
      suffering: patient.suffering,
      prescription: patient.prescription,
      prescriptionDate: patient.prescriptionDate,
      visitDate: patient.visitDate,
      totalFees: patient.totalFees,
      amountPaid: patient.amountPaid,
      paymentStatus: patient.paymentStatus,
      nextAppointmentDate: patient.nextAppointmentDate,
      notes: patient.notes,
    });

    if (notificationResult.success) {
      markPrescriptionSent(patient.id);
      const pdfUrl = notificationResult.prescriptionPdf?.localUrl;
      const whatsappUrl = buildManualPrescriptionWhatsAppUrl(patient);

      if (pdfUrl && pdfWindow) {
        pdfWindow.location.href = pdfUrl;
      } else if (pdfWindow) {
        pdfWindow.close();
      }

      if (whatsappUrl && whatsappWindow) {
        whatsappWindow.location.href = whatsappUrl;
      } else if (whatsappWindow) {
        whatsappWindow.close();
      }

      const manualShareMessage = whatsappUrl
        ? `WhatsApp opened for ${patient.phone}. Attach the PDF tab there.`
        : "PDF opened in a new tab for manual sharing.";

      setMessage(
        patient.prescriptionSentAt
          ? `Prescription email resent. ${manualShareMessage}`
          : `Prescription email sent. ${manualShareMessage}`,
      );
      return;
    }

    if (pdfWindow) pdfWindow.close();
    if (whatsappWindow) whatsappWindow.close();
    setMessage(`${notificationResult.message} Please check the notification server and try again.`);
  };

  const normalizedSearch = patientSearch.trim().toLowerCase();
  const filteredPatients = patients.filter((patient) => {
    if (!normalizedSearch) return true;
    const searchableText = [
      patient.name,
      patient.suffering,
      patient.email ?? "",
      patient.phone ?? "",
      patient.gender ?? "",
      patient.age ?? "",
      patient.address ?? "",
      patient.prescription,
      patient.visitDate ?? "",
      patient.totalFees ?? "",
      patient.amountPaid ?? "",
      patient.paymentStatus ?? "",
      patient.nextAppointmentDate ?? "",
      patient.notes ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return searchableText.includes(normalizedSearch);
  });

  return (
    <div className="space-y-6">
      {message && <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">{message}</div>}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserPlus className="h-5 w-5 text-primary" />
              Add new patient
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div>
              <Label htmlFor="patient-name">Patient Name</Label>
              <Input id="patient-name" value={newPatient.name} onChange={(event) => setNewPatient({ ...newPatient, name: event.target.value })} placeholder="e.g. Priya Sharma" />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label htmlFor="patient-visit-date">Visit date</Label>
                <Input id="patient-visit-date" type="date" value={newPatient.visitDate} onChange={(event) => setNewPatient({ ...newPatient, visitDate: event.target.value })} />
              </div>
              <div>
                <Label htmlFor="patient-gender">Gender</Label>
                <select id="patient-gender" value={newPatient.gender} onChange={(event) => setNewPatient({ ...newPatient, gender: event.target.value })} className={nativeSelectClass}>
                  <option value="">Select gender</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <Label htmlFor="patient-age">Age</Label>
                <Input id="patient-age" type="number" min="0" value={newPatient.age} onChange={(event) => setNewPatient({ ...newPatient, age: event.target.value })} placeholder="e.g. 32" />
              </div>
            </div>
            <div>
              <Label htmlFor="patient-suffering">Suffering / diagnosis</Label>
              <Textarea id="patient-suffering" value={newPatient.suffering} onChange={(event) => setNewPatient({ ...newPatient, suffering: event.target.value })} placeholder="e.g. Hypertension with chest discomfort" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="patient-email">Email</Label>
                <Input id="patient-email" type="email" value={newPatient.email} onChange={(event) => setNewPatient({ ...newPatient, email: event.target.value })} placeholder="patient@example.com" />
              </div>
              <div>
                <Label htmlFor="patient-phone">WhatsApp / phone</Label>
                <Input id="patient-phone" value={newPatient.phone} onChange={(event) => setNewPatient({ ...newPatient, phone: event.target.value })} placeholder="+919876543210" />
              </div>
            </div>
            <div>
              <Label htmlFor="patient-address">Address</Label>
              <Textarea id="patient-address" value={newPatient.address} onChange={(event) => setNewPatient({ ...newPatient, address: event.target.value })} placeholder="House no., street, city" />
            </div>
            <div>
              <Label htmlFor="patient-prescription">Prescription</Label>
              <Textarea id="patient-prescription" value={newPatient.prescription} onChange={(event) => setNewPatient({ ...newPatient, prescription: event.target.value })} placeholder="e.g. Take aspirin 75mg once daily, follow-up in 2 weeks" />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label htmlFor="patient-total-fees">Total fees</Label>
                <Input id="patient-total-fees" type="number" min="0" value={newPatient.totalFees} onChange={(event) => setNewPatient({ ...newPatient, totalFees: event.target.value })} placeholder="e.g. 2500" />
              </div>
              <div>
                <Label htmlFor="patient-amount-paid">Amount paid</Label>
                <Input id="patient-amount-paid" type="number" min="0" value={newPatient.amountPaid} onChange={(event) => setNewPatient({ ...newPatient, amountPaid: event.target.value })} placeholder="e.g. 1000" />
              </div>
              <div>
                <Label htmlFor="patient-payment-status">Payment status</Label>
                <select id="patient-payment-status" value={newPatient.paymentStatus} onChange={(event) => setNewPatient({ ...newPatient, paymentStatus: event.target.value })} className={nativeSelectClass}>
                  <option value="unpaid">Unpaid</option>
                  <option value="partial">Partial</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="patient-next-appointment">Next appointment</Label>
                <Input id="patient-next-appointment" type="date" value={newPatient.nextAppointmentDate} onChange={(event) => setNewPatient({ ...newPatient, nextAppointmentDate: event.target.value })} />
              </div>
              <div>
                <Label htmlFor="patient-notes">Internal notes</Label>
                <Input id="patient-notes" value={newPatient.notes} onChange={(event) => setNewPatient({ ...newPatient, notes: event.target.value })} placeholder="Allergies, payment note, priority..." />
              </div>
            </div>
            <Button onClick={createPatient} className="gap-2">
              <UserPlus className="h-4 w-4" />
              Save patient record
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Patient list</CardTitle>
            <p className={mutedTextClass}>Review patient details and send prescriptions by email or WhatsApp.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="patient-search"
                value={patientSearch}
                onChange={(event) => setPatientSearch(event.target.value)}
                placeholder="Search by name, phone, email, diagnosis..."
                className="pl-9"
              />
              {patientSearch && (
                <p className="mt-2 text-sm font-medium text-primary">
                  Found {filteredPatients.length} patient{filteredPatients.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>

            {patients.length === 0 ? (
              <p className={mutedTextClass}>No patients saved yet.</p>
            ) : filteredPatients.length === 0 ? (
              <p className={mutedTextClass}>No patients match your search.</p>
            ) : (
              <div className="max-h-[36rem] space-y-3 overflow-y-auto pr-1">
                {filteredPatients.map((patient) => (
                  <div key={patient.id} className={panelClass}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-foreground">{patient.name}</p>
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getPrescriptionBadge(patient).className}`}>
                            {getPrescriptionBadge(patient).label}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-x-4 gap-y-1 text-sm text-muted-foreground md:grid-cols-2">
                          <p>Visit date: {formatDateValue(patient.visitDate ?? patient.prescriptionDate)}</p>
                          <p>Gender: {patient.gender ?? "-"}</p>
                          <p>Age: {patient.age ?? "-"}</p>
                          <p>WhatsApp: {patient.phone ?? "-"}</p>
                          <p>Email: {patient.email ?? "-"}</p>
                          <p>Next appointment: {formatDateValue(patient.nextAppointmentDate)}</p>
                          <p>Total fees: {formatCurrencyValue(patient.totalFees)}</p>
                          <p>Paid: {formatCurrencyValue(patient.amountPaid)}</p>
                          <p>Balance due: {formatCurrencyValue(getBalanceDueAmount(patient))}</p>
                          <p>Payment: {patient.paymentStatus ?? "-"}</p>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">Address: {patient.address ?? "-"}</p>
                        <p className="text-sm text-muted-foreground">Suffering: {patient.suffering}</p>
                        <p className="text-sm text-muted-foreground">Prescription: {patient.prescription}</p>
                        <p className="text-sm text-muted-foreground">Notes: {patient.notes ?? "-"}</p>
                        <p className="text-sm text-muted-foreground">
                          Prescription notification: {patient.prescriptionSentAt ? `Sent on ${new Date(patient.prescriptionSentAt).toLocaleString()}` : "Not sent yet"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:mt-0">
                        <Button variant="secondary" size="sm" className="gap-2" onClick={() => sendPrescription(patient)}>
                          <Send className="h-3.5 w-3.5" />
                          {patient.prescriptionSentAt ? "Resend" : "Send"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminPatientsSection;
