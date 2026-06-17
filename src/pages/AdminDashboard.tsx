import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminPatientManagement from "@/components/AdminPatientManagement";
import AdminOperationsPanel from "@/components/AdminOperationsPanel";
import {
  AdminMediaItem,
  AdminPatient,
  getMediaItems,
  getPatients,
  isAdminLoggedIn,
  logoutAdmin,
  sendPrescriptionEmail,
  setMediaItems,
  setPatients,
} from "@/lib/admin";

const getTodayInputValue = () => new Date().toISOString().slice(0, 10);

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

const defaultMediaState = {
  title: "",
  url: "",
  type: "image" as "image" | "video",
};

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

const formatDateValue = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
};

const formatCurrencyValue = (value?: string) => {
  if (!value) return "-";
  const amount = Number(value);
  if (Number.isNaN(amount)) return value;
  return `INR ${amount.toLocaleString("en-IN")}`;
};

const getBalanceDue = (patient: AdminPatient) => {
  const total = Number(patient.totalFees || 0);
  const paid = Number(patient.amountPaid || 0);
  if (!total && !paid) return "-";
  return formatCurrencyValue(String(Math.max(total - paid, 0)));
};

const getPrescriptionBadge = (patient: AdminPatient) => {
  if (!patient.prescriptionSentAt) {
    return {
      label: "Not sent",
      className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    };
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

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [patients, setPatientsState] = useState<AdminPatient[]>([]);
  const [mediaItems, setMediaState] = useState<AdminMediaItem[]>([]);
  const [newPatient, setNewPatient] = useState(createDefaultPatientState);
  const [newMedia, setNewMedia] = useState(defaultMediaState);
  const [message, setMessage] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [activeTab, setActiveTab] = useState("patients");

  useEffect(() => {
    if (!isAdminLoggedIn()) {
      navigate("/admin");
      return;
    }
    setPatientsState(getPatients());
    setMediaState(getMediaItems());

    const refreshPatients = () => setPatientsState(getPatients());
    window.addEventListener("patientsUpdated", refreshPatients);
    return () => window.removeEventListener("patientsUpdated", refreshPatients);
  }, [navigate]);

  const savePatients = (updated: AdminPatient[]) => {
    setPatients(updated);
    setPatientsState(updated);
  };

  const saveMedia = (updated: AdminMediaItem[]) => {
    setMediaItems(updated);
    setMediaState(updated);
  };

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const markPrescriptionSent = (patientId: string, patientList: AdminPatient[] = patients) => {
    const sentAt = new Date().toISOString();
    const updated = patientList.map((patient) =>
      patient.id === patientId ? { ...patient, prescriptionSentAt: sentAt } : patient,
    );
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

  const createMedia = () => {
    const trimmedTitle = newMedia.title.trim();
    const trimmedUrl = newMedia.url.trim();
    if (!trimmedTitle || !trimmedUrl) {
      setMessage("Please add a title and URL for the media item.");
      return;
    }

    const mediaItem: AdminMediaItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: trimmedTitle,
      url: trimmedUrl,
      type: newMedia.type,
    };

    const updated = [mediaItem, ...mediaItems];
    saveMedia(updated);
    setNewMedia(defaultMediaState);
    setMessage("Media item saved. It will appear on the review page.");
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setNewMedia((prev) => ({
        ...prev,
        url: dataUrl,
      }));
      setMessage("Image/video loaded. Click 'Publish media' to save it.");
    };
    reader.readAsDataURL(file);
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

  const handleLogout = () => {
    logoutAdmin();
    navigate("/admin");
  };

  const deleteMedia = (mediaId: string) => {
    const updated = mediaItems.filter((item) => item.id !== mediaId);
    saveMedia(updated);
    setMessage("Media item deleted and removed from the testimonials page.");
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
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="container mx-auto px-4 py-12">
        <div className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-primary">Admin Dashboard</p>
              <h1 className="mt-2 text-3xl font-semibold text-white">Clinic admin panel</h1>
              <p className="mt-2 text-sm text-slate-400">Manage patients, appointments, treatment plans, payments, notes, staff, analytics, and clinic settings.</p>
            </div>
            <Button variant="outline" onClick={handleLogout}>Logout</Button>
          </div>

          {message && <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">{message}</div>}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="patients">Patient Records</TabsTrigger>
              <TabsTrigger value="care">Care Management</TabsTrigger>
              <TabsTrigger value="operations">Doctor Tools</TabsTrigger>
            </TabsList>

            <TabsContent value="patients" className="space-y-6">
          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
              <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-6">
                <h2 className="text-xl font-semibold">Add new patient</h2>
                <div className="grid gap-4 mt-5">
                  <div>
                    <Label htmlFor="patient-name">Patient Name</Label>
                    <Input
                      id="patient-name"
                      value={newPatient.name}
                      onChange={(event) => setNewPatient({ ...newPatient, name: event.target.value })}
                      placeholder="e.g. Priya Sharma"
                      className="text-black"
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <Label htmlFor="patient-visit-date">Visit date</Label>
                      <Input
                        id="patient-visit-date"
                        type="date"
                        value={newPatient.visitDate}
                        onChange={(event) => setNewPatient({ ...newPatient, visitDate: event.target.value })}
                        className="text-black"
                      />
                    </div>
                    <div>
                      <Label htmlFor="patient-gender">Gender</Label>
                      <select
                        id="patient-gender"
                        value={newPatient.gender}
                        onChange={(event) => setNewPatient({ ...newPatient, gender: event.target.value })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-base text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <option value="">Select gender</option>
                        <option value="Female">Female</option>
                        <option value="Male">Male</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="patient-age">Age</Label>
                      <Input
                        id="patient-age"
                        type="number"
                        min="0"
                        value={newPatient.age}
                        onChange={(event) => setNewPatient({ ...newPatient, age: event.target.value })}
                        placeholder="e.g. 32"
                        className="text-black"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="patient-suffering">Suffering / diagnosis</Label>
                    <Textarea
                      id="patient-suffering"
                      value={newPatient.suffering}
                      onChange={(event) => setNewPatient({ ...newPatient, suffering: event.target.value })}
                      placeholder="e.g. Hypertension with chest discomfort"
                      className="text-black"
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="patient-email">Email</Label>
                      <Input
                        id="patient-email"
                        type="email"
                        value={newPatient.email}
                        onChange={(event) => setNewPatient({ ...newPatient, email: event.target.value })}
                        placeholder="patient@example.com"
                        className="text-black"
                      />
                    </div>
                    <div>
                      <Label htmlFor="patient-phone">WhatsApp / phone</Label>
                      <Input
                        id="patient-phone"
                        value={newPatient.phone}
                        onChange={(event) => setNewPatient({ ...newPatient, phone: event.target.value })}
                        placeholder="+919876543210"
                        className="text-black"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="patient-address">Address</Label>
                    <Textarea
                      id="patient-address"
                      value={newPatient.address}
                      onChange={(event) => setNewPatient({ ...newPatient, address: event.target.value })}
                      placeholder="House no., street, city"
                      className="text-black"
                    />
                  </div>
                  <div>
                    <Label htmlFor="patient-prescription">Prescription</Label>
                    <Textarea
                      id="patient-prescription"
                      value={newPatient.prescription}
                      onChange={(event) => setNewPatient({ ...newPatient, prescription: event.target.value })}
                      placeholder="e.g. Take aspirin 75mg once daily, follow-up in 2 weeks"
                      className="text-black"
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <Label htmlFor="patient-total-fees">Total fees</Label>
                      <Input
                        id="patient-total-fees"
                        type="number"
                        min="0"
                        value={newPatient.totalFees}
                        onChange={(event) => setNewPatient({ ...newPatient, totalFees: event.target.value })}
                        placeholder="e.g. 2500"
                        className="text-black"
                      />
                    </div>
                    <div>
                      <Label htmlFor="patient-amount-paid">Amount paid</Label>
                      <Input
                        id="patient-amount-paid"
                        type="number"
                        min="0"
                        value={newPatient.amountPaid}
                        onChange={(event) => setNewPatient({ ...newPatient, amountPaid: event.target.value })}
                        placeholder="e.g. 1000"
                        className="text-black"
                      />
                    </div>
                    <div>
                      <Label htmlFor="patient-payment-status">Payment status</Label>
                      <select
                        id="patient-payment-status"
                        value={newPatient.paymentStatus}
                        onChange={(event) => setNewPatient({ ...newPatient, paymentStatus: event.target.value })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-base text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <option value="unpaid">Unpaid</option>
                        <option value="partial">Partial</option>
                        <option value="paid">Paid</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="patient-next-appointment">Next appointment</Label>
                      <Input
                        id="patient-next-appointment"
                        type="date"
                        value={newPatient.nextAppointmentDate}
                        onChange={(event) => setNewPatient({ ...newPatient, nextAppointmentDate: event.target.value })}
                        className="text-black"
                      />
                    </div>
                    <div>
                      <Label htmlFor="patient-notes">Internal notes</Label>
                      <Input
                        id="patient-notes"
                        value={newPatient.notes}
                        onChange={(event) => setNewPatient({ ...newPatient, notes: event.target.value })}
                        placeholder="Allergies, payment note, priority..."
                        className="text-black"
                      />
                    </div>
                  </div>
                  <Button onClick={createPatient}>Save patient record</Button>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-6">
                <h2 className="text-xl font-semibold">Publish review media</h2>
                <p className="mt-2 text-sm text-slate-400">Add images or videos from your computer or provide a URL. They will show on the review page.</p>
                <div className="grid gap-4 mt-5">
                  <div>
                    <Label htmlFor="media-title">Title</Label>
                    <Input
                      id="media-title"
                      value={newMedia.title}
                      onChange={(event) => setNewMedia({ ...newMedia, title: event.target.value })}
                      placeholder="e.g. Smile makeover before and after"
                      className="text-black"
                    />
                  </div>
                  <div>
                    <Label htmlFor="media-type">Type</Label>
                    <select
                      id="media-type"
                      value={newMedia.type}
                      onChange={(event) => setNewMedia({ ...newMedia, type: event.target.value as "image" | "video" })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-base text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="media-file">Upload from computer</Label>
                    <input
                      id="media-file"
                      type="file"
                      accept={newMedia.type === "image" ? "image/*" : "video/*"}
                      onChange={handleFileUpload}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-base text-slate-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                    />
                  </div>
                  <div>
                    <Label htmlFor="media-url">Or paste image/video URL</Label>
                    <Input
                      id="media-url"
                      value={newMedia.url}
                      onChange={(event) => setNewMedia({ ...newMedia, url: event.target.value })}
                      placeholder="https://example.com/path/to/file.jpg"
                      className="text-black"
                    />
                  </div>
                  <Button onClick={createMedia}>Publish media</Button>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">Patient list</h2>
                    <p className="mt-1 text-sm text-slate-400">Review patient details and send prescriptions by email or WhatsApp.</p>
                  </div>
                </div>
                <div className="mt-5 space-y-4">
                  <div className="rounded-2xl border-2 border-primary/40 bg-gradient-to-r from-primary/10 to-primary/5 p-5 shadow-lg shadow-primary/10">
                    <Label htmlFor="patient-search" className="text-base font-semibold mb-3 block text-primary flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                      Search Patients
                    </Label>
                    <Input
                      id="patient-search"
                      value={patientSearch}
                      onChange={(event) => setPatientSearch(event.target.value)}
                      placeholder="Search by name, phone, email, diagnosis, or prescription..."
                      className="w-full h-12 text-base bg-white border-2 border-primary/30 text-slate-900 placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/30"
                    />
                    {patientSearch && (
                      <p className="mt-2 text-sm text-primary font-medium">
                        Found {filteredPatients.length} patient{filteredPatients.length !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                  {patients.length === 0 ? (
                    <p className="text-sm text-slate-400">No patients saved yet.</p>
                  ) : filteredPatients.length === 0 ? (
                    <p className="text-sm text-slate-400">No patients match your search.</p>
                  ) : (
                    filteredPatients.map((patient) => (
                      <div key={patient.id} className="rounded-3xl border border-white/10 bg-slate-950/90 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-white">{patient.name}</p>
                              <span
                                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getPrescriptionBadge(patient).className}`}
                              >
                                {getPrescriptionBadge(patient).label}
                              </span>
                            </div>
                            <div className="mt-3 grid gap-x-4 gap-y-1 text-sm text-slate-400 md:grid-cols-2">
                              <p>Visit date: {formatDateValue(patient.visitDate ?? patient.prescriptionDate)}</p>
                              <p>Gender: {patient.gender ?? "-"}</p>
                              <p>Age: {patient.age ?? "-"}</p>
                              <p>WhatsApp: {patient.phone ?? "-"}</p>
                              <p>Email: {patient.email ?? "-"}</p>
                              <p>Next appointment: {formatDateValue(patient.nextAppointmentDate)}</p>
                              <p>Total fees: {formatCurrencyValue(patient.totalFees)}</p>
                              <p>Paid: {formatCurrencyValue(patient.amountPaid)}</p>
                              <p>Balance due: {getBalanceDue(patient)}</p>
                              <p>Payment: {patient.paymentStatus ?? "-"}</p>
                            </div>
                            <p className="mt-2 text-sm text-slate-400">Address: {patient.address ?? "-"}</p>
                            <p className="text-sm text-slate-400">Suffering: {patient.suffering}</p>
                            <p className="text-sm text-slate-400">Prescription: {patient.prescription}</p>
                            <p className="text-sm text-slate-400">Notes: {patient.notes ?? "-"}</p>
                            <p className="text-sm text-slate-400">
                              Prescription notification:{" "}
                              {patient.prescriptionSentAt
                                ? `Sent on ${new Date(patient.prescriptionSentAt).toLocaleString()}`
                                : "Not sent yet"}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-4 sm:mt-0">
                            <Button variant="secondary" size="sm" onClick={() => sendPrescription(patient)}>
                              {patient.prescriptionSentAt ? "Resend prescription" : "Send prescription"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-6">
                <h2 className="text-xl font-semibold">Published review media</h2>
                <p className="mt-2 text-sm text-slate-400">Media added here will appear on the testimonials/review page.</p>
                {mediaItems.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-400">No media items added yet.</p>
                ) : (
                  <div className="mt-4 grid gap-4">
                    {mediaItems.map((item) => (
                      <div key={item.id} className="rounded-3xl border border-white/10 bg-slate-950/90 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <p className="font-semibold text-white">{item.title}</p>
                            <p className="text-sm text-slate-400">Type: {item.type}</p>
                            <a href={item.url} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
                              Open media URL
                            </a>
                          </div>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteMedia(item.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
            </TabsContent>

            <TabsContent value="care" className="space-y-6">
              <AdminPatientManagement />
            </TabsContent>

            <TabsContent value="operations" className="space-y-6">
              <AdminOperationsPanel />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
