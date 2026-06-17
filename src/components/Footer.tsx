import { Heart } from "lucide-react";
import { Link } from "react-router-dom";

const footerLinks = [
  { label: "Home", to: "/" },
  { label: "Services", to: "/services" },
  { label: "About", to: "/about" },
  { label: "Contact", to: "/contact" },
];

const Footer = () => (
  <footer className="bg-foreground py-12">
    <div className="container mx-auto px-4 lg:px-8">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
            <Heart className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="text-sm font-semibold text-background">Dr. Rana Dental Clinic</span>
        </Link>
        <div className="flex gap-8 text-sm text-background/60">
          {footerLinks.map((link) => (
            <Link key={link.to} to={link.to} className="hover:text-background transition-colors duration-200">
              {link.label}
            </Link>
          ))}
        </div>
        <p className="text-xs text-background/40">(c) 2026 Dr. Rana Dental Clinic. All rights reserved.</p>
      </div>
    </div>
  </footer>
);

export default Footer;
