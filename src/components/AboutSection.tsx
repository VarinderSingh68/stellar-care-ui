import { CheckCircle2 } from "lucide-react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { cn } from "@/lib/utils";

const credentials = [
  "Dentists and dental surgeon services",
  "Teeth scaling and polishing",
  "Ultra sonic scaling and polishing of teeth",
  "Fibre splinting of mobile teeth",
  "Tooth extraction and dental scaling",
  "Cosmetic, restorative, and preventive dental care",
];

const doctorImage =
  "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=900&q=80";

const AboutSection = () => {
  const { ref: imgRef, isVisible: imgVisible } = useScrollAnimation();
  const { ref: textRef, isVisible: textVisible } = useScrollAnimation();

  return (
    <section className="py-24 lg:py-32 hero-gradient">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div ref={imgRef} className={cn("relative scroll-left", imgVisible && "scroll-visible")}>
            <div className="relative rounded-2xl overflow-hidden shadow-elevated group">
              <img
                src={doctorImage}
                alt="Dr. Rana Dental Clinic dentist"
                width={800}
                height={1024}
                loading="lazy"
                className="w-full object-cover aspect-[4/5] transition-transform duration-700 group-hover:scale-105"
              />
            </div>
            <div
              className={cn(
                "absolute -bottom-6 -right-6 glass rounded-2xl p-6 shadow-elevated max-w-[220px] animate-float scroll-scale",
                imgVisible && "scroll-visible",
              )}
              style={{ transitionDelay: "300ms" }}
            >
              <p className="text-3xl font-bold text-primary">Kharar</p>
              <p className="text-sm text-muted-foreground">Trusted dental care near Gurudwara Sahib Road</p>
            </div>
          </div>

          <div ref={textRef} className={cn("space-y-6 scroll-right", textVisible && "scroll-visible")}>
            <p className="text-sm font-semibold text-primary tracking-wider uppercase">About The Clinic</p>
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground">
              Dr. Rana <span className="text-gradient">Dental Clinic</span>
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Dr. Rana Dental Clinic serves patients in New Mata Gujri Enclave, Janta Nagar,
              Mundi Kharar with day-to-day dental care, preventive treatments, oral surgery,
              and smile-restoring procedures.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              The clinic focuses on practical, accessible dental treatment including scaling,
              polishing, fillings, root canals, crowns, dentures, implants, extractions, and
              periodontal procedures for patients of different age groups.
            </p>

            <div className="space-y-3 pt-4">
              {credentials.map((c, i) => (
                <div
                  key={c}
                  className={cn("flex items-start gap-3 scroll-hidden", textVisible && "scroll-visible")}
                  style={{ transitionDelay: `${400 + i * 80}ms` }}
                >
                  <CheckCircle2 className="w-5 h-5 text-accent mt-0.5 shrink-0" />
                  <span className="text-sm text-foreground">{c}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
