import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<AdminSectionId>("overview");

  useEffect(() => {
    if (!isAdminLoggedIn()) {
      navigate("/admin");
    }
  }, [navigate]);

  const { data: settings } = useQuery({
    queryKey: ["clinicSettings"],
    queryFn: getClinicSettings,
    enabled: isAdminLoggedIn(),
  });
  const clinicName = settings?.clinicName || "Dr. Rana Dental Clinic";

  useEffect(() => {
    const refreshSettings = () => queryClient.invalidateQueries({ queryKey: ["clinicSettings"] });
    window.addEventListener("clinicSettingsUpdated", refreshSettings);
    return () => window.removeEventListener("clinicSettingsUpdated", refreshSettings);
  }, [queryClient]);

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
