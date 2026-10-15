import Navbar from "@/components/Navbar";
import AboutSection from "@/components/AboutSection";
import TechnologySection from "@/components/TechnologySection";
import Footer from "@/components/Footer";

const AboutPage = () => (
  <div className="min-h-screen page-enter">
    <Navbar />
    <section className="pt-32 pb-12 hero-gradient">
      <div className="container mx-auto px-4 lg:px-8 text-center">
        <p className="text-sm font-semibold text-primary tracking-wider uppercase mb-3 animate-fade-up opacity-0" style={{ animationDelay: "0.1s", animationFillMode: "forwards" }}>About Us</p>
        <h1 className="text-4xl lg:text-5xl font-bold text-foreground mb-4 animate-fade-up opacity-0" style={{ animationDelay: "0.2s", animationFillMode: "forwards" }}>
          About <span className="text-gradient">Dr. Rana Dental Clinic</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto animate-fade-up opacity-0" style={{ animationDelay: "0.3s", animationFillMode: "forwards" }}>
          Local dental care in Janta Nagar, Kharar with preventive, restorative, cosmetic, and surgical treatment options.
        </p>
      </div>
    </section>
    <AboutSection />
    <TechnologySection />
    <Footer />
  </div>
);

export default AboutPage;
