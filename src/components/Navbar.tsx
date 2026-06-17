import { useState, useEffect } from "react";
import { Heart, Menu, X, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "Home", to: "/" },
  { label: "Services", to: "/services" },
  { label: "About", to: "/about" },
  { label: "Testimonials", to: "/testimonials" },
  { label: "Contact", to: "/contact" },
];

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className={cn(
      "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
      scrolled ? "glass shadow-soft" : "bg-transparent"
    )}>
      <div className="container mx-auto flex items-center justify-between h-16 px-4 lg:px-8">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:shadow-glow">
            <Heart className="w-5 h-5 text-primary-foreground transition-transform duration-300 group-hover:scale-110" />
          </div>
          <span className="text-lg font-semibold text-foreground tracking-tight">Dr. Rana Dental Clinic</span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={cn(
                "text-sm font-medium transition-colors duration-200 story-link",
                location.pathname === link.to ? "text-primary" : "text-muted-foreground hover:text-primary"
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <a href="tel:+919041481946" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
            <Phone className="w-4 h-4" />
            090414 81946
          </a>
          <Button size="sm" variant="outline" className="hover-scale" asChild>
            <Link to="/patient-portal">Patient Portal</Link>
          </Button>
          <Button size="sm" className="hover-scale" asChild>
            <Link to="/booking">Book Appointment</Link>
          </Button>
        </div>

        <button className="md:hidden p-2" onClick={() => setOpen(!open)}>
          <div className="relative w-5 h-5">
            <X className={cn("w-5 h-5 absolute inset-0 transition-all duration-300", open ? "opacity-100 rotate-0" : "opacity-0 rotate-90")} />
            <Menu className={cn("w-5 h-5 absolute inset-0 transition-all duration-300", open ? "opacity-0 -rotate-90" : "opacity-100 rotate-0")} />
          </div>
        </button>
      </div>

      <div className={cn(
        "md:hidden glass border-t border-border overflow-hidden transition-all duration-300",
        open ? "max-h-80 opacity-100" : "max-h-0 opacity-0 border-t-0"
      )}>
        <div className="container mx-auto px-4 py-4 flex flex-col gap-3">
          {navLinks.map((link, i) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setOpen(false)}
              className="text-sm font-medium text-muted-foreground hover:text-primary py-2 transition-all duration-200"
              style={{ transitionDelay: open ? `${i * 50}ms` : "0ms" }}
            >
              {link.label}
            </Link>
          ))}
          <Button size="sm" variant="outline" className="mt-2" asChild>
            <Link to="/patient-portal" onClick={() => setOpen(false)}>Patient Portal</Link>
          </Button>
          <Button size="sm" className="mt-2" asChild>
            <Link to="/booking" onClick={() => setOpen(false)}>Book Appointment</Link>
          </Button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
