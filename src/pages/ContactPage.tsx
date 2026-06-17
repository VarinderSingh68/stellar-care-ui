import Navbar from "@/components/Navbar";
import ContactSection from "@/components/ContactSection";
import Footer from "@/components/Footer";

const ContactPage = () => (
  <div className="min-h-screen page-enter">
    <Navbar />
    <section className="pt-32 pb-12">
      <div className="container mx-auto px-4 lg:px-8 text-center">
        <p className="text-sm font-semibold text-primary tracking-wider uppercase mb-3 animate-fade-up opacity-0" style={{ animationDelay: "0.1s", animationFillMode: "forwards" }}>Reach Out</p>
        <h1 className="text-4xl lg:text-5xl font-bold text-foreground mb-4 animate-fade-up opacity-0" style={{ animationDelay: "0.2s", animationFillMode: "forwards" }}>
          Contact <span className="text-gradient">Us</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto animate-fade-up opacity-0" style={{ animationDelay: "0.3s", animationFillMode: "forwards" }}>
          Questions, treatment inquiries, or appointment requests for Dr. Rana Dental Clinic are always welcome.
        </p>
      </div>
    </section>
    <ContactSection />
    <Footer />
  </div>
);

export default ContactPage;
