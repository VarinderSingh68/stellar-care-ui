import Navbar from "@/components/Navbar";
import ServicesSection from "@/components/ServicesSection";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

const ServicesPage = () => (
  <div className="min-h-screen page-enter">
    <Navbar />
    <section className="pt-32 pb-12 hero-gradient">
      <div className="container mx-auto px-4 lg:px-8 text-center">
        <p className="text-sm font-semibold text-primary tracking-wider uppercase mb-3 animate-fade-up opacity-0" style={{ animationDelay: "0.1s", animationFillMode: "forwards" }}>What We Offer</p>
        <h1 className="text-4xl lg:text-5xl font-bold text-foreground mb-4 animate-fade-up opacity-0" style={{ animationDelay: "0.2s", animationFillMode: "forwards" }}>
          Dental <span className="text-gradient">Services</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto animate-fade-up opacity-0" style={{ animationDelay: "0.3s", animationFillMode: "forwards" }}>
          Explore the treatments offered at Dr. Rana Dental Clinic in Janta Nagar, Kharar, including pricing highlights from the clinic service list.
        </p>
      </div>
    </section>
    <ServicesSection />
    <section className="py-16">
      <div className="container mx-auto px-4 lg:px-8 text-center">
        <Button size="lg" className="gap-2 shadow-glow hover-scale group" asChild>
          <Link to="/booking">
            Book an Appointment <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </Button>
      </div>
    </section>
    <Footer />
  </div>
);

export default ServicesPage;
