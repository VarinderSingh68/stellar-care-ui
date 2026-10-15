import { MapPin, Phone, Mail, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useScrollAnimation, useStaggeredAnimation } from "@/hooks/useScrollAnimation";
import { cn } from "@/lib/utils";

const contactInfo = [
  { icon: MapPin, label: "Address", value: "New Mata Gujri Enclave, Gurudwara Sahib Road,\nJanta Nagar, Mundi Kharar, Kharar, Punjab 140301" },
  { icon: Phone, label: "Phone", value: "090414 81946" },
  { icon: Mail, label: "Clinic", value: "Dr. Rana Dental Clinic" },
  { icon: Clock, label: "Service Highlights", value: "Teeth cleaning, root canals, extractions,\nimplants, crowns, dentures, and emergency care" },
];

const ContactSection = () => {
  const { ref: headerRef, isVisible: headerVisible } = useScrollAnimation();
  const { ref: infoRef, isVisible: infoVisible, getDelay } = useStaggeredAnimation(contactInfo.length, 100);
  const { ref: formRef, isVisible: formVisible } = useScrollAnimation();

  return (
    <section className="py-24 lg:py-32 hero-gradient">
      <div className="container mx-auto px-4 lg:px-8">
        <div ref={headerRef} className={cn("text-center max-w-2xl mx-auto mb-16 scroll-hidden", headerVisible && "scroll-visible")}>
          <p className="text-sm font-semibold text-primary tracking-wider uppercase mb-3">Get in Touch</p>
          <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">Contact and Location</h2>
          <p className="text-muted-foreground">Visit Dr. Rana Dental Clinic in Kharar for appointments, consultations, and everyday dental treatment.</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          <div className="space-y-8">
            <div ref={infoRef} className="grid sm:grid-cols-2 gap-6">
              {contactInfo.map((c, i) => (
                <div
                  key={c.label}
                  className={cn(
                    "bg-card rounded-xl p-6 shadow-soft border border-border/50 hover-lift scroll-scale",
                    infoVisible && "scroll-visible",
                  )}
                  style={{ transitionDelay: getDelay(i) }}
                >
                  <c.icon className="w-6 h-6 text-primary mb-3" />
                  <p className="text-sm font-semibold text-foreground mb-1">{c.label}</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-line">{c.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl overflow-hidden shadow-soft border border-border/50 h-64">
              <iframe
                title="Clinic Location"
                src="https://www.google.com/maps?q=New%20Mata%20Gujri%20Enclave%2C%20Gurudwara%20Sahib%20Road%2C%20Janta%20Nagar%2C%20Mundi%20Kharar%2C%20Kharar%2C%20Punjab%20140301&z=15&output=embed"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>

          <div ref={formRef} className={cn("bg-card rounded-2xl p-8 shadow-elevated border border-border/50 scroll-right", formVisible && "scroll-visible")}>
            <h3 className="text-xl font-semibold text-foreground mb-6">Send a Message</h3>
            <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
              <div className="grid sm:grid-cols-2 gap-4">
                <Input placeholder="First Name" className="bg-secondary border-border transition-all duration-200 focus:shadow-glow" />
                <Input placeholder="Last Name" className="bg-secondary border-border transition-all duration-200 focus:shadow-glow" />
              </div>
              <Input type="email" placeholder="Email Address" className="bg-secondary border-border transition-all duration-200 focus:shadow-glow" />
              <Input type="tel" placeholder="Phone Number" className="bg-secondary border-border transition-all duration-200 focus:shadow-glow" />
              <Textarea placeholder="Tell us about your dental concern or treatment requirement." rows={4} className="bg-secondary border-border resize-none transition-all duration-200 focus:shadow-glow" />
              <Button className="w-full shadow-glow hover-scale" size="lg">Send Inquiry</Button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContactSection;
