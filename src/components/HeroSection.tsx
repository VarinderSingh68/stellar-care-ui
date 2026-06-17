import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { cn } from "@/lib/utils";
import { Shield, Award, Clock, ArrowRight } from "lucide-react";

const trustBadges = [
  { icon: Shield, label: "Clinic Type", value: "Dentists" },
  { icon: Award, label: "Location", value: "Janta Nagar, Kharar" },
  { icon: Clock, label: "Appointments", value: "Quick Booking" },
];

const heroImage =
  "https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=1920&q=80";

const HeroSection = () => {
  const { ref: badgesRef, isVisible: badgesVisible } = useScrollAnimation();

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      <div className="absolute inset-0">
        <img src={heroImage} alt="Modern dental clinic interior" width={1920} height={1080} className="w-full h-full object-cover scale-105 animate-[scale-in_1.2s_ease-out_forwards]" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/80 to-background/40" />
      </div>

      <div className="container relative mx-auto px-4 lg:px-8 pt-24 pb-16">
        <div className="max-w-2xl space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium animate-fade-up opacity-0" style={{ animationDelay: "0.2s", animationFillMode: "forwards" }}>
            <Shield className="w-4 h-4 animate-pulse-soft" />
            Trusted Dental Care in Mundi Kharar
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-tight animate-fade-up opacity-0" style={{ animationDelay: "0.4s", animationFillMode: "forwards" }}>
            Dr. Rana Dental Clinic,{" "}
            <span className="text-gradient">Complete Oral Care</span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-lg leading-relaxed animate-fade-up opacity-0" style={{ animationDelay: "0.6s", animationFillMode: "forwards" }}>
            Quality dental treatment for families in Kharar, from teeth cleaning and polishing to root canals, extractions, crowns, implants, and emergency care.
          </p>

          <div className="flex flex-wrap gap-4 animate-fade-up opacity-0" style={{ animationDelay: "0.8s", animationFillMode: "forwards" }}>
            <Button size="lg" className="gap-2 shadow-glow hover-scale group" asChild>
              <Link to="/booking">
                Book Appointment <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="hover-scale" asChild>
              <Link to="/services">View Services</Link>
            </Button>
          </div>

          <div ref={badgesRef} className="flex flex-wrap gap-6 pt-4">
            {trustBadges.map((badge, i) => (
              <div
                key={badge.label}
                className={cn(
                  "flex items-center gap-3 glass rounded-xl px-4 py-3 shadow-soft hover-lift scroll-hidden",
                  badgesVisible && "scroll-visible"
                )}
                style={{ transitionDelay: `${i * 150}ms` }}
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <badge.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{badge.label}</p>
                  <p className="text-sm font-semibold text-foreground">{badge.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
