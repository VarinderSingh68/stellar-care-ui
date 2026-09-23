import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ScrollToTop from "@/components/ScrollToTop";
import Index from "./pages/Index";
import ServicesPage from "./pages/ServicesPage";
import AboutPage from "./pages/AboutPage";
import BookingPage from "./pages/BookingPage";
import TestimonialsPage from "./pages/TestimonialsPage";
import ContactPage from "./pages/ContactPage";
import NotFound from "./pages/NotFound";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminDashboard from "./pages/AdminDashboard";
import PatientPortalLoginPage from "./pages/PatientPortalLoginPage";
import PatientPortalDashboard from "./pages/PatientPortalDashboard";
import Chatbot from "@/components/Chatbot";
import { clearAdminToken, clearPatientToken, isAuthError } from "@/lib/api";

// Admin tokens expire after 12h, patient tokens after 30d (see
// server/auth.cjs), and either can also go invalid if the admin logs out in
// another tab, clears storage, etc. Without this, a query/mutation that hits
// a stale token would 401, react-query would retry it a few times, and the
// page would just sit there silently broken -- no "please log in again",
// nothing -- since isAdminLoggedIn()/isPatientAuthenticated() only check
// whether *a* token is present, not whether it still works. This bounces
// back to the matching login screen as soon as any request comes back 401.
function handleSessionExpired(error: unknown) {
  if (!isAuthError(error) || typeof window === "undefined") return;
  const { pathname } = window.location;
  if (pathname.startsWith("/admin") && pathname !== "/admin") {
    clearAdminToken();
    window.location.href = "/admin";
  } else if (pathname.startsWith("/patient-portal") && pathname !== "/patient-portal") {
    clearPatientToken();
    window.location.href = "/patient-portal";
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleSessionExpired }),
  mutationCache: new MutationCache({ onError: handleSessionExpired }),
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <Chatbot />
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/booking" element={<BookingPage />} />
          <Route path="/testimonials" element={<TestimonialsPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/admin" element={<AdminLoginPage />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/patient-portal" element={<PatientPortalLoginPage />} />
          <Route path="/patient-portal/dashboard" element={<PatientPortalDashboard />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
