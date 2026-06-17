import { useState, useEffect } from "react";
import { Plus, Trash2, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  createFollowUp,
  createConsentForm,
  createMedicalReport,
  createInsuranceBilling,
  getFollowUps,
  getConsentForms,
  getPatientPortalRecords,
  sendFollowUpEmail,
  sendReportEmail,
  sendBillingEmail,
  PATIENT_TEMPLATES,
  type PatientRecord,
} from "@/lib/patient-portal";
import { getPatients, type AdminPatient } from "@/lib/admin";

interface AdminPatientManagementProps {
  onClose?: () => void;
}

export const AdminPatientManagement = ({ onClose }: AdminPatientManagementProps) => {
  const [activeTab, setActiveTab] = useState("follow-ups");
  const [patients, setPatients] = useState<AdminPatient[]>([]);
  const [portalPatients, setPortalPatients] = useState<PatientRecord[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<string>("");
  const [message, setMessage] = useState("");

  // Follow-up form
  const [followUpForm, setFollowUpForm] = useState({
    title: "",
    description: "",
    dueDate: "",
    type: "medication" as "medication" | "test" | "appointment" | "exercise" | "diet",
  });

  // Consent form
  const [consentForm, setConsentForm] = useState({
    formType: "treatment" as "treatment" | "surgery" | "procedure" | "research" | "imaging",
    title: "",
    content: "",
  });

  // Medical report
  const [reportForm, setReportForm] = useState({
    reportType: "",
    title: "",
    description: "",
  });

  // Insurance billing
  const [billingForm, setBillingForm] = useState({
    claimId: "",
    insuranceProvider: "",
    policyNumber: "",
    treatmentDate: "",
    amount: "",
    notes: "",
  });

  // Template application
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const { toast } = useToast();

  useEffect(() => {
    setPatients(getPatients());
    setPortalPatients(getPatientPortalRecords());
  }, []);

  const allPatients = [
    ...patients.map((p) => ({ id: p.id, name: p.name, email: p.email || "", phone: p.phone || "" })),
    ...portalPatients.map((p) => ({
      id: p.id,
      name: p.patientName,
      email: p.patientEmail,
      phone: p.patientPhone || "",
    })),
  ];

  const createFollowUpTask = async () => {
    if (!selectedPatient) {
      setMessage("Please select a patient");
      return;
    }
    if (!followUpForm.title.trim() || !followUpForm.dueDate) {
      setMessage("Please fill in all follow-up details");
      return;
    }

    createFollowUp({
      patientId: selectedPatient,
      title: followUpForm.title,
      description: followUpForm.description,
      dueDate: followUpForm.dueDate,
      type: followUpForm.type,
      status: "pending",
      createdDate: new Date().toISOString(),
    });

    const patient = allPatients.find((p) => p.id === selectedPatient);
    if (patient?.email) {
      const result = await sendFollowUpEmail({
        patientName: patient.name,
        patientEmail: patient.email,
        patientPhone: patient.phone,
        title: followUpForm.title,
        description: followUpForm.description,
        dueDate: followUpForm.dueDate,
        type: followUpForm.type,
      });
      const message = result.success
        ? `✓ Follow-up created and email sent to ${patient.name}`
        : `✓ Follow-up created for ${patient.name}. Email failed: ${result.message}`;
      setMessage(message);
      toast({
        title: result.success ? "Follow-up sent" : "Follow-up created",
        description: result.success ? `Email sent to ${patient.name}` : message,
      });
    } else {
      const message = `✓ Follow-up created for ${patient?.name}. No patient email available to send notification.`;
      setMessage(message);
      toast({
        title: "Follow-up created",
        description: message,
      });
    }

    setFollowUpForm({ title: "", description: "", dueDate: "", type: "medication" });
  };

  const createConsent = () => {
    if (!selectedPatient) {
      setMessage("Please select a patient");
      return;
    }
    if (!consentForm.title.trim() || !consentForm.content.trim()) {
      setMessage("Please fill in all consent form details");
      return;
    }

    const patient = allPatients.find((p) => p.id === selectedPatient);
    createConsentForm({
      patientId: selectedPatient,
      patientName: patient?.name || "",
      patientEmail: patient?.email || "",
      formType: consentForm.formType,
      title: consentForm.title,
      content: consentForm.content,
      isSigned: false,
      createdDate: new Date().toISOString(),
    });

    const message = `✓ Consent form created for ${patient?.name}`;
    setMessage(message);
    toast({
      title: "Consent form created",
      description: message,
    });
    setConsentForm({ formType: "treatment", title: "", content: "" });
  };

  const addMedicalReport = async () => {
    if (!selectedPatient) {
      setMessage("Please select a patient");
      return;
    }
    if (!reportForm.title.trim() || !reportForm.reportType.trim()) {
      setMessage("Please fill in all report details");
      return;
    }

    createMedicalReport({
      patientId: selectedPatient,
      reportType: reportForm.reportType,
      title: reportForm.title,
      date: new Date().toISOString().split("T")[0],
      description: reportForm.description,
    });

    const patient = allPatients.find((p) => p.id === selectedPatient);
    if (patient?.email) {
      const result = await sendReportEmail({
        patientName: patient.name,
        patientEmail: patient.email,
        patientPhone: patient.phone,
        reportType: reportForm.reportType,
        title: reportForm.title,
        description: reportForm.description,
        date: new Date().toISOString().split("T")[0],
      });
      const message = result.success
        ? `✓ Medical report added and email sent to ${patient.name}`
        : `✓ Medical report added for ${patient.name}. Email failed: ${result.message}`;
      setMessage(message);
      toast({
        title: result.success ? "Report sent" : "Report added",
        description: result.success ? `Email sent to ${patient.name}` : message,
      });
    } else {
      const message = `✓ Medical report added for ${patient?.name}. No patient email available to send notification.`;
      setMessage(message);
      toast({
        title: "Report added",
        description: message,
      });
    }

    setReportForm({ reportType: "", title: "", description: "" });
  };

  const addInsuranceBilling = async () => {
    if (!selectedPatient) {
      setMessage("Please select a patient");
      return;
    }
    if (
      !billingForm.claimId.trim() ||
      !billingForm.insuranceProvider.trim() ||
      !billingForm.amount.trim()
    ) {
      setMessage("Please fill in all billing details");
      return;
    }

    createInsuranceBilling({
      patientId: selectedPatient,
      claimId: billingForm.claimId,
      insuranceProvider: billingForm.insuranceProvider,
      policyNumber: billingForm.policyNumber,
      treatmentDate: billingForm.treatmentDate || new Date().toISOString().split("T")[0],
      amount: Number(billingForm.amount),
      status: "submitted",
      submissionDate: new Date().toISOString(),
      notes: billingForm.notes,
    });

    const patient = allPatients.find((p) => p.id === selectedPatient);
    if (patient?.email) {
      const result = await sendBillingEmail({
        patientName: patient.name,
        patientEmail: patient.email,
        patientPhone: patient.phone,
        claimId: billingForm.claimId,
        insuranceProvider: billingForm.insuranceProvider,
        policyNumber: billingForm.policyNumber,
        treatmentDate: billingForm.treatmentDate || new Date().toISOString().split("T")[0],
        amount: Number(billingForm.amount),
        status: "submitted",
        notes: billingForm.notes,
        submissionDate: new Date().toISOString(),
      });
      const message = result.success
        ? `✓ Billing record created and email sent to ${patient.name}`
        : `✓ Billing record created. Email failed: ${result.message}`;
      setMessage(message);
      toast({
        title: result.success ? "Billing sent" : "Billing created",
        description: result.success ? `Email sent to ${patient.name}` : message,
      });
    } else {
      const message = `✓ Billing record created. No patient email available to send notification.`;
      setMessage(message);
      toast({
        title: "Billing created",
        description: message,
      });
    }

    setBillingForm({
      claimId: "",
      insuranceProvider: "",
      policyNumber: "",
      treatmentDate: "",
      amount: "",
      notes: "",
    });
  };

  const applyTemplate = () => {
    if (!selectedPatient || !selectedTemplate) {
      setMessage("Please select a patient and template");
      return;
    }

    const template = PATIENT_TEMPLATES.find((t) => t.id === selectedTemplate);
    if (!template) return;

    const patient = allPatients.find((p) => p.id === selectedPatient);
    const createdDate = new Date().toISOString();

    // Create follow-ups from template
    template.followUpItems.forEach((item) => {
      createFollowUp({
        patientId: selectedPatient,
        ...item,
        status: "pending",
        createdDate,
      });
    });

    // Create consent forms from template
    template.consentForms.forEach((form) => {
      createConsentForm({
        patientId: selectedPatient,
        patientName: patient?.name || "",
        patientEmail: patient?.email || "",
        ...form,
        isSigned: false,
        createdDate,
      });
    });

    const message = `✓ Template "${template.name}" applied successfully!`;
    setMessage(message);
    toast({
      title: "Template applied",
      description: message,
    });
    setSelectedTemplate("");
  };

  return (
    <div className="space-y-6">
      {message && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-600">
          {message}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Select Patient</CardTitle>
          <CardDescription>Choose a patient to manage their care</CardDescription>
        </CardHeader>
        <CardContent>
          <select
            value={selectedPatient}
            onChange={(e) => setSelectedPatient(e.target.value)}
            className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
          >
            <option value="">Select a patient...</option>
            {allPatients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.name} ({patient.email})
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {selectedPatient && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="follow-ups">Follow-ups</TabsTrigger>
            <TabsTrigger value="consent">Consent</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
          </TabsList>

          {/* Follow-ups Tab */}
          <TabsContent value="follow-ups" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  Create Follow-up Task
                </CardTitle>
                <CardDescription>
                  Set reminders for the patient to take medications, complete tests, or keep appointments
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="followup-title">Task Title *</Label>
                  <Input
                    id="followup-title"
                    value={followUpForm.title}
                    onChange={(e) => setFollowUpForm({ ...followUpForm, title: e.target.value })}
                    placeholder="e.g., Take blood pressure medication"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="followup-description">Description</Label>
                  <Textarea
                    id="followup-description"
                    value={followUpForm.description}
                    onChange={(e) =>
                      setFollowUpForm({ ...followUpForm, description: e.target.value })
                    }
                    placeholder="Additional details for the patient"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="followup-type">Type *</Label>
                    <select
                      id="followup-type"
                      value={followUpForm.type}
                      onChange={(e) =>
                        setFollowUpForm({
                          ...followUpForm,
                          type: e.target.value as typeof followUpForm.type,
                        })
                      }
                      className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
                    >
                      <option value="medication">Medication</option>
                      <option value="test">Test</option>
                      <option value="appointment">Appointment</option>
                      <option value="exercise">Exercise</option>
                      <option value="diet">Diet</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="followup-date">Due Date *</Label>
                    <Input
                      id="followup-date"
                      type="date"
                      value={followUpForm.dueDate}
                      onChange={(e) => setFollowUpForm({ ...followUpForm, dueDate: e.target.value })}
                    />
                  </div>
                </div>

                <Button onClick={createFollowUpTask} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Follow-up
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Consent Forms Tab */}
          <TabsContent value="consent" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Create Consent Form
                </CardTitle>
                <CardDescription>Patient must sign this form before treatment</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="consent-type">Form Type *</Label>
                  <select
                    id="consent-type"
                    value={consentForm.formType}
                    onChange={(e) =>
                      setConsentForm({
                        ...consentForm,
                        formType: e.target.value as typeof consentForm.formType,
                      })
                    }
                    className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
                  >
                    <option value="treatment">Treatment</option>
                    <option value="surgery">Surgery</option>
                    <option value="procedure">Procedure</option>
                    <option value="research">Research</option>
                    <option value="imaging">Imaging</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="consent-title">Form Title *</Label>
                  <Input
                    id="consent-title"
                    value={consentForm.title}
                    onChange={(e) => setConsentForm({ ...consentForm, title: e.target.value })}
                    placeholder="e.g., Surgical Procedure Consent"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="consent-content">Consent Text *</Label>
                  <Textarea
                    id="consent-content"
                    value={consentForm.content}
                    onChange={(e) => setConsentForm({ ...consentForm, content: e.target.value })}
                    placeholder="Enter the consent form text..."
                    className="min-h-32"
                  />
                </div>

                <Button onClick={createConsent} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Consent Form
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Medical Reports Tab */}
          <TabsContent value="reports" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Add Medical Report
                </CardTitle>
                <CardDescription>Upload lab results or medical test reports</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="report-type">Report Type *</Label>
                  <Input
                    id="report-type"
                    value={reportForm.reportType}
                    onChange={(e) => setReportForm({ ...reportForm, reportType: e.target.value })}
                    placeholder="e.g., Blood Test, X-Ray, ECG"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="report-title">Report Title *</Label>
                  <Input
                    id="report-title"
                    value={reportForm.title}
                    onChange={(e) => setReportForm({ ...reportForm, title: e.target.value })}
                    placeholder="e.g., Complete Blood Count Report"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="report-description">Description</Label>
                  <Textarea
                    id="report-description"
                    value={reportForm.description}
                    onChange={(e) => setReportForm({ ...reportForm, description: e.target.value })}
                    placeholder="Report summary or notes"
                  />
                </div>

                <Button onClick={addMedicalReport} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Report
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Insurance Billing Tab */}
          <TabsContent value="billing" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  Insurance Claim Submission
                </CardTitle>
                <CardDescription>
                  Track insurance claims and billing status for the patient
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="claim-id">Claim ID *</Label>
                    <Input
                      id="claim-id"
                      value={billingForm.claimId}
                      onChange={(e) => setBillingForm({ ...billingForm, claimId: e.target.value })}
                      placeholder="CLM-2024-001"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="insurance-provider">Insurance Provider *</Label>
                    <Input
                      id="insurance-provider"
                      value={billingForm.insuranceProvider}
                      onChange={(e) =>
                        setBillingForm({ ...billingForm, insuranceProvider: e.target.value })
                      }
                      placeholder="e.g., HDFC Insurance"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="policy-number">Policy Number</Label>
                    <Input
                      id="policy-number"
                      value={billingForm.policyNumber}
                      onChange={(e) =>
                        setBillingForm({ ...billingForm, policyNumber: e.target.value })
                      }
                      placeholder="POL-123456"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="treatment-date">Treatment Date</Label>
                    <Input
                      id="treatment-date"
                      type="date"
                      value={billingForm.treatmentDate}
                      onChange={(e) =>
                        setBillingForm({ ...billingForm, treatmentDate: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="amount">Claim Amount (₹) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    value={billingForm.amount}
                    onChange={(e) => setBillingForm({ ...billingForm, amount: e.target.value })}
                    placeholder="50000"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="billing-notes">Notes</Label>
                  <Textarea
                    id="billing-notes"
                    value={billingForm.notes}
                    onChange={(e) => setBillingForm({ ...billingForm, notes: e.target.value })}
                    placeholder="Any additional notes about the claim"
                  />
                </div>

                <Button onClick={addInsuranceBilling} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Submit Billing
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Template Application */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Check className="w-5 h-5" />
            Apply Care Templates
          </CardTitle>
          <CardDescription>
            Quick-apply pre-configured follow-ups and forms based on condition type
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="template-select">Select Template *</Label>
            <select
              id="template-select"
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
            >
              <option value="">Choose a template...</option>
              {PATIENT_TEMPLATES.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} ({template.followUpItems.length} follow-ups)
                </option>
              ))}
            </select>
          </div>

          {selectedTemplate && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              {PATIENT_TEMPLATES.find((t) => t.id === selectedTemplate) && (
                <div className="text-sm space-y-2">
                  <p className="font-medium">
                    Template includes:
                    {PATIENT_TEMPLATES.find((t) => t.id === selectedTemplate)?.followUpItems.length} follow-up tasks
                  </p>
                  <p>
                    {PATIENT_TEMPLATES.find((t) => t.id === selectedTemplate)?.consentForms.length}{" "}
                    consent forms
                  </p>
                </div>
              )}
            </div>
          )}

          <Button
            onClick={applyTemplate}
            disabled={!selectedPatient || !selectedTemplate}
            className="w-full"
          >
            <Check className="w-4 h-4 mr-2" />
            Apply Template
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

import { FileText } from "lucide-react";

export default AdminPatientManagement;
