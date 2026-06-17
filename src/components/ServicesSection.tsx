import { Heart, Activity, Stethoscope, Brain, Zap, Pill, ShieldPlus, Sparkles, ScanLine } from "lucide-react";
import { useScrollAnimation, useStaggeredAnimation } from "@/hooks/useScrollAnimation";
import { cn } from "@/lib/utils";

const services = [
  { icon: Heart, title: "Teeth Cleaning", description: "Professional teeth cleaning and dental scaling from Rs. 1,000." },
  { icon: Activity, title: "Fillings and Sealants", description: "Tooth repair and protective fillings from Rs. 1,000." },
  { icon: Stethoscope, title: "Extractions", description: "Safe tooth extraction services from Rs. 800." },
  { icon: Brain, title: "Root Canals", description: "Root canal treatment to save damaged teeth from Rs. 3,000." },
  { icon: Zap, title: "Cosmetic Procedures", description: "Smile improvement and cosmetic dental procedures from Rs. 1,500." },
  { icon: Pill, title: "Oral Surgery", description: "Oral surgery procedures and treatment planning from Rs. 5,000." },
  { icon: ShieldPlus, title: "Dental Implants", description: "Dental implant solutions from Rs. 20,000." },
  { icon: Sparkles, title: "Veneers and Crowns", description: "Veneers, crowns, dentures, and bridges from Rs. 3,000 and Rs. 15,000." },
  { icon: ScanLine, title: "X-Ray and Periodontal Care", description: "Dental X-ray at Rs. 300 and periodontal surgeries from Rs. 4,500." },
];

const ServicesSection = () => {
  const { ref: headerRef, isVisible: headerVisible } = useScrollAnimation();
  const { ref: cardsRef, isVisible: cardsVisible, getDelay } = useStaggeredAnimation(services.length, 100);

  return (
    <section className="py-24 lg:py-32">
      <div className="container mx-auto px-4 lg:px-8">
        <div ref={headerRef} className={cn("text-center max-w-2xl mx-auto mb-16 scroll-hidden", headerVisible && "scroll-visible")}>
          <p className="text-sm font-semibold text-primary tracking-wider uppercase mb-3">Our Services</p>
          <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">Services At Dr. Rana Dental Clinic</h2>
          <p className="text-muted-foreground leading-relaxed">
            Based on the clinic service list, we provide cosmetic procedures, implants, dentures and bridges, emergency care, extractions, fillings, oral surgery, pediatrics, root canals, teeth cleaning, veneers, crowns, and more.
          </p>
        </div>

        <div ref={cardsRef} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service, i) => (
            <div
              key={service.title}
              className={cn(
                "group relative bg-card rounded-2xl p-8 shadow-soft border border-border/50 hover-lift cursor-default scroll-scale",
                cardsVisible && "scroll-visible"
              )}
              style={{ transitionDelay: getDelay(i) }}
            >
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-6 transition-all duration-300 group-hover:bg-primary/20 group-hover:scale-110">
                <service.icon className="w-7 h-7 text-primary transition-transform duration-300 group-hover:scale-110" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-3 transition-colors duration-200 group-hover:text-primary">{service.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{service.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ServicesSection;
