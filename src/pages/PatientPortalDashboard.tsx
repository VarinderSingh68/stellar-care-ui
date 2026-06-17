import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, FileText, CheckCircle, Clock, AlertCircle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  getFollowUpsByPatientId,
  getConsentFormsByPatientId,
  getMedicalReportsByPatientId,
  getInsuranceBillingsByPatientId,
  updateFollowUp,
  signConsentForm,
  type PatientRecord,
  type FollowUp,
  type ConsentForm,
} from "@/lib/patient-portal";

const PatientPortalDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [consentForms, setConsentForms] = useState<ConsentForm[]>([]);

  useEffect(() => {
    const auth = localStorage.getItem("cardiovita.patient-auth");
    if (!auth) {
      navigate("/patient-portal");
      return;
    }

    const patientData = JSON.parse(auth) as PatientRecord;
    setPatient(patientData);

    // Load follow-ups
    setFollowUps(getFollowUpsByPatientId(patientData.id));

    // Load consent forms
    setConsentForms(getConsentFormsByPatientId(patientData.id));
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("cardiovita.patient-auth");
    navigate("/patient-portal");
    toast({
      title: "Logged out",
      description: "You have been logged out successfully.",
    });
  };

  const handleMarkComplete = (followUpId: string) => {
    updateFollowUp(followUpId, {
      status: "completed",
      completedDate: new Date().toISOString(),
    });
    setFollowUps(getFollowUpsByPatientId(patient!.id));
    toast({
      title: "Success",
      description: "Follow-up marked as completed",
    });
  };

  const handleSignConsent = (consentId: string) => {
    signConsentForm(consentId);
    setConsentForms(getConsentFormsByPatientId(patient!.id));
    toast({
      title: "Success",
      description: "Consent form signed successfully",
    });
  };

  const getFollowUpIcon = (type: FollowUp["type"]) => {
    const icons: Record<FollowUp["type"], JSX.Element> = {
      medication: <AlertCircle className="w-5 h-5" />,
      test: <FileText className="w-5 h-5" />,
      appointment: <Clock className="w-5 h-5" />,
      exercise: <AlertCircle className="w-5 h-5" />,
      diet: <AlertCircle className="w-5 h-5" />,
    };
    return icons[type];
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800",
      completed: "bg-green-100 text-green-800",
      missed: "bg-red-100 text-red-800",
      submitted: "bg-blue-100 text-blue-800",
      processing: "bg-yellow-100 text-yellow-800",
      approved: "bg-green-100 text-green-800",
      rejected: "bg-red-100 text-red-800",
      paid: "bg-green-100 text-green-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  if (!patient) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen page-enter flex flex-col">
      <Navbar />

      <div className="flex-1 py-12 px-4 lg:px-8">
        <div className="container mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-4xl font-bold text-foreground mb-2">
                Welcome, {patient.patientName}!
              </h1>
              <p className="text-muted-foreground">Manage your health records and appointments</p>
            </div>
            <Button onClick={handleLogout} variant="outline">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>

          {/* Patient Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Age</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{patient.age || "N/A"}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Gender</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold capitalize">{patient.gender || "N/A"}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Phone</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold">{patient.patientPhone}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active Follow-ups</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {followUps.filter((f) => f.status === "pending").length}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Tabs */}
          <Tabs defaultValue="follow-ups" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="follow-ups">Follow-ups</TabsTrigger>
              <TabsTrigger value="consent">Consent Forms</TabsTrigger>
              <TabsTrigger value="reports">Medical Reports</TabsTrigger>
              <TabsTrigger value="billing">Billing</TabsTrigger>
            </TabsList>

            {/* Follow-ups Tab */}
            <TabsContent value="follow-ups" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Your Follow-ups</CardTitle>
                  <CardDescription>Tasks assigned to you for your care and treatment</CardDescription>
                </CardHeader>
                <CardContent>
                  {followUps.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">No follow-ups assigned yet</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {followUps.map((followUp) => (
                        <div
                          key={followUp.id}
                          className="flex items-start gap-4 p-4 border rounded-lg hover:bg-accent transition"
                        >
                          <div className="mt-1">{getFollowUpIcon(followUp.type)}</div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-foreground">{followUp.title}</h3>
                              <span className={`text-xs px-2 py-1 rounded capitalize ${getStatusColor(followUp.status)}`}>
                                {followUp.status}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">{followUp.description}</p>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">
                                Due: {new Date(followUp.dueDate).toLocaleDateString()}
                              </span>
                              {followUp.status === "pending" && (
                                <Button
                                  size="sm"
                                  onClick={() => handleMarkComplete(followUp.id)}
                                >
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                  Mark Complete
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Consent Forms Tab */}
            <TabsContent value="consent" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Digital Consent Forms</CardTitle>
                  <CardDescription>Review and sign treatment consent forms</CardDescription>
                </CardHeader>
                <CardContent>
                  {consentForms.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">No consent forms pending</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {consentForms.map((form) => (
                        <div
                          key={form.id}
                          className="p-4 border rounded-lg hover:bg-accent transition"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h3 className="font-semibold text-foreground">{form.title}</h3>
                              <span className={`inline-block text-xs px-2 py-1 rounded mt-1 capitalize ${
                                form.isSigned
                                  ? "bg-green-100 text-green-800"
                                  : "bg-yellow-100 text-yellow-800"
                              }`}>
                                {form.isSigned ? "Signed" : "Pending"}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground capitalize bg-blue-100 text-blue-800 px-2 py-1 rounded">
                              {form.formType}
                            </span>
                          </div>
                          <p className="text-sm text-foreground mb-4 bg-muted p-3 rounded">
                            {form.content}
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">
                              {form.isSigned && form.signatureDate
                                ? `Signed on ${new Date(form.signatureDate).toLocaleDateString()}`
                                : "Not yet signed"}
                            </span>
                            {!form.isSigned && (
                              <Button
                                size="sm"
                                onClick={() => handleSignConsent(form.id)}
                              >
                                <FileText className="w-4 h-4 mr-1" />
                                Sign Consent
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Medical Reports Tab */}
            <TabsContent value="reports" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Medical Reports</CardTitle>
                  <CardDescription>View your lab reports and medical records</CardDescription>
                </CardHeader>
                <CardContent>
                  {getMedicalReportsByPatientId(patient.id).length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">No reports available yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {getMedicalReportsByPatientId(patient.id).map((report) => (
                        <div key={report.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent">
                          <div className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-primary" />
                            <div>
                              <p className="font-medium">{report.title}</p>
                              <p className="text-xs text-muted-foreground">{new Date(report.date).toLocaleDateString()}</p>
                            </div>
                          </div>
                          {report.fileUrl && (
                            <Button size="sm" variant="outline">
                              <Download className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Billing Tab */}
            <TabsContent value="billing" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Insurance & Billing</CardTitle>
                  <CardDescription>Track your insurance claims and billing status</CardDescription>
                </CardHeader>
                <CardContent>
                  {getInsuranceBillingsByPatientId(patient.id).length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">No billing records yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {getInsuranceBillingsByPatientId(patient.id).map((billing) => (
                        <div key={billing.id} className="p-3 border rounded-lg">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="font-medium">{billing.insuranceProvider}</p>
                              <p className="text-sm text-muted-foreground">Claim ID: {billing.claimId}</p>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded capitalize ${getStatusColor(billing.status)}`}>
                              {billing.status}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span>₹{billing.amount.toLocaleString()}</span>
                            <span className="text-muted-foreground">
                              {new Date(billing.submissionDate).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default PatientPortalDashboard;
