import { Monitor, Cpu, Microscope, Wifi } from "lucide-react";
import { useScrollAnimation, useStaggeredAnimation } from "@/hooks/useScrollAnimation";
import { cn } from "@/lib/utils";

const facilities = [
  { icon: Monitor, title: "Digital Dental X-Rays", desc: "Low-radiation imaging for quick and accurate diagnosis" },
  { icon: Cpu, title: "Intraoral Scanner", desc: "High-precision digital impressions without messy molds" },
  { icon: Microscope, title: "Advanced Sterilization", desc: "Strict instrument sterilization for safe dental care" },
  { icon: Wifi, title: "Teledentistry Follow-up", desc: "Remote guidance for post-treatment recovery and care" },
];

const techImage =
  "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=1280&q=80";

const TechnologySection = () => {
  const { ref: textRef, isVisible: textVisible } = useScrollAnimation();
  const { ref: cardsRef, isVisible: cardsVisible, getDelay } = useStaggeredAnimation(facilities.length, 120);
  const { ref: imgRef, isVisible: imgVisible } = useScrollAnimation();

  return (
    <section className="py-24 lg:py-32">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-6">
            <div ref={textRef} className={cn("space-y-6 scroll-left", textVisible && "scroll-visible")}>
              <p className="text-sm font-semibold text-primary tracking-wider uppercase">Technology & Facilities</p>
              <h2 className="text-3xl lg:text-4xl font-bold text-foreground">
                Clinic <span className="text-gradient">Facilities</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Dr. Rana Dental Clinic supports everyday dental diagnosis and treatment with
                practical tools, safe sterilization, and patient-friendly care processes.
              </p>
            </div>

            <div ref={cardsRef} className="grid sm:grid-cols-2 gap-4 pt-4">
              {facilities.map((f, i) => (
                <div
                  key={f.title}
                  className={cn(
                    "glass rounded-xl p-5 shadow-soft hover-lift group scroll-scale",
                    cardsVisible && "scroll-visible"
                  )}
                  style={{ transitionDelay: getDelay(i) }}
                >
                  <f.icon className="w-8 h-8 text-primary mb-3 transition-transform duration-300 group-hover:scale-110" />
                  <h4 className="text-sm font-semibold text-foreground mb-1">{f.title}</h4>
                  <p className="text-xs text-muted-foreground">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div ref={imgRef} className={cn("rounded-2xl overflow-hidden shadow-elevated group scroll-right", imgVisible && "scroll-visible")}>
            <img src={techImage} alt="Advanced dental treatment equipment" width={1280} height={720} loading="lazy" className="w-full object-cover transition-transform duration-700 group-hover:scale-105" />
          </div>
        </div>
      </div>
    </section>
  );
};

export default TechnologySection;
