import { Star, Quote } from "lucide-react";
import { useEffect, useState } from "react";
import { useScrollAnimation, useStaggeredAnimation } from "@/hooks/useScrollAnimation";
import { getMediaItems, type AdminMediaItem } from "@/lib/admin";
import { cn } from "@/lib/utils";

const testimonials = [
  {
    name: "Neha Sharma",
    role: "Root Canal Patient",
    text: "The treatment was explained clearly and the whole visit felt smooth. I came in for a root canal and left feeling relieved and well cared for.",
    rating: 5,
  },
  {
    name: "Rahul Mehta",
    role: "Preventive Dental Care Patient",
    text: "I visited for cleaning and scaling. The clinic team was polite, professional, and gave useful advice for keeping my teeth and gums healthy.",
    rating: 5,
  },
  {
    name: "Aarav Singh",
    role: "Long-term Patient, 8 Years",
    text: "From consultation to treatment, everything was handled with care. The clinic is organized, clean, and dependable for family dental needs.",
    rating: 5,
  },
];

const TestimonialsSection = () => {
  const { ref: headerRef, isVisible: headerVisible } = useScrollAnimation();
  const { ref: cardsRef, isVisible: cardsVisible, getDelay } = useStaggeredAnimation(testimonials.length, 150);
  const [mediaItems, setMediaItemsState] = useState<AdminMediaItem[]>([]);

  useEffect(() => {
    setMediaItemsState(getMediaItems());

    const handleStorageChange = () => {
      setMediaItemsState(getMediaItems());
    };

    const handleMediaUpdated = () => {
      setMediaItemsState(getMediaItems());
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("mediaUpdated", handleMediaUpdated);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("mediaUpdated", handleMediaUpdated);
    };
  }, []);

  return (
    <section className="py-24 lg:py-32 hero-gradient">
      <div className="container mx-auto px-4 lg:px-8">
        <div ref={headerRef} className={cn("text-center max-w-2xl mx-auto mb-16 scroll-hidden", headerVisible && "scroll-visible")}>
          <p className="text-sm font-semibold text-primary tracking-wider uppercase mb-3">Testimonials</p>
          <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">What Our Patients Say</h2>
          <p className="text-muted-foreground">Hear from patients who experienced treatment at Dr. Rana Dental Clinic.</p>
        </div>

        <div ref={cardsRef} className="grid md:grid-cols-3 gap-8">
          {testimonials.map((t, i) => (
            <div
              key={t.name}
              className={cn(
                "bg-card rounded-2xl p-8 shadow-soft border border-border/50 relative hover-lift scroll-scale",
                cardsVisible && "scroll-visible"
              )}
              style={{ transitionDelay: getDelay(i) }}
            >
              <Quote className="absolute top-6 right-6 w-8 h-8 text-primary/10" />
              <div className="flex gap-1 mb-4">
                {Array.from({ length: t.rating }).map((_, j) => (
                  <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">"{t.text}"</p>
              <div>
                <p className="text-sm font-semibold text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.role}</p>
              </div>
            </div>
          ))}
        </div>
        {mediaItems.length > 0 && (
          <div className="container mx-auto px-4 lg:px-8 mt-16">
            <div className="rounded-3xl border border-border/50 bg-card p-6">
              <div className="mb-8 text-center">
                <p className="text-sm font-semibold text-primary tracking-wider uppercase mb-3">Review Media</p>
                <h3 className="text-2xl font-bold text-foreground">Images and videos from the clinic</h3>
                <p className="text-muted-foreground">Added from the admin panel and visible to all users on the testimonials page.</p>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                {mediaItems.map((item) => (
                  <div key={item.id} className="rounded-3xl overflow-hidden border border-border/50 bg-slate-950">
                    {item.type === "image" ? (
                      <img src={item.url} alt={item.title} className="h-[240px] w-full object-cover" />
                    ) : (
                      <div className="relative aspect-video bg-black">
                        <video src={item.url} controls className="h-full w-full object-cover" />
                      </div>
                    )}
                    <div className="p-4">
                      <p className="font-semibold text-white">{item.title}</p>
                      <p className="text-sm text-muted-foreground">{item.type.toUpperCase()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default TestimonialsSection;
