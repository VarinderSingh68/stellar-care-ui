import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminShell from "@/components/admin/AdminShell";
import AdminOverview from "@/components/admin/AdminOverview";
import AdminPatientsSection from "@/components/admin/AdminPatientsSection";
import AdminMediaSection from "@/components/admin/AdminMediaSection";
import AdminOperationsPanel from "@/components/admin/AdminOperationsPanel";
import { AdminSectionId } from "@/components/admin/adminNav";
import { getClinicSettings, isAdminLoggedIn, logoutAdmin } from "@/lib/admin";

const operationsPanelSections: AdminSectionId[] = [
  "appointments",
  "timeline",
  "plans",
  "payments",
  "notes",
  "care",
  "staff",
  "analytics",
  "settings",
];

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<AdminSectionId>("overview");
  const [clinicName, setClinicName] = useState(() => getClinicSettings().clinicName);

  useEffect(() => {
    if (!isAdminLoggedIn()) {
      navigate("/admin");
    }
  }, [navigate]);

  useEffect(() => {
    const refreshSettings = () => setClinicName(getClinicSettings().clinicName);
    window.addEventListener("clinicSettingsUpdated", refreshSettings);
    return () => window.removeEventListener("clinicSettingsUpdated", refreshSettings);
  }, []);

  const handleLogout = () => {
    logoutAdmin();
    navigate("/admin");
  };

  return (
    <AdminShell activeSection={activeSection} onSectionChange={setActiveSection} clinicName={clinicName} onLogout={handleLogout}>
      {activeSection === "overview" && <AdminOverview clinicName={clinicName} onNavigate={setActiveSection} />}
      {activeSection === "patients" && <AdminPatientsSection />}
      {activeSection === "media" && <AdminMediaSection />}
      {operationsPanelSections.includes(activeSection) && (
        <AdminOperationsPanel activeTool={activeSection} onToolChange={setActiveSection} />
      )}
    </AdminShell>
  );
};

export default AdminDashboard;
