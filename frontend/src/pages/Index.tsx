import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import ServicesSection from "@/components/ServicesSection";
import AboutSection from "@/components/AboutSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import TechnologySection from "@/components/TechnologySection";
import ContactSection from "@/components/ContactSection";
import Footer from "@/components/Footer";

const Index = () => (
  <div className="min-h-screen page-enter">
    <Navbar />
    <HeroSection />
    <ServicesSection />
    <AboutSection />
    <TestimonialsSection />
    <TechnologySection />
    <ContactSection />
    <Footer />
  </div>
);

export default Index;
