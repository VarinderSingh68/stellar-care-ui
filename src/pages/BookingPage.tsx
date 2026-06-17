import Navbar from "@/components/Navbar";
import BookingSection from "@/components/BookingSection";
import Footer from "@/components/Footer";

const BookingPage = () => (
  <div className="min-h-screen page-enter">
    <Navbar />
    <section className="pt-32 pb-12 hero-gradient">
      <div className="container mx-auto px-4 lg:px-8 text-center">
        <p className="text-sm font-semibold text-primary tracking-wider uppercase mb-3 animate-fade-up opacity-0" style={{ animationDelay: "0.1s", animationFillMode: "forwards" }}>Appointments</p>
        <h1 className="text-4xl lg:text-5xl font-bold text-foreground mb-4 animate-fade-up opacity-0" style={{ animationDelay: "0.2s", animationFillMode: "forwards" }}>
          Book Your <span className="text-gradient">Appointment</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto animate-fade-up opacity-0" style={{ animationDelay: "0.3s", animationFillMode: "forwards" }}>
          Choose a date and time that works for you. We'll confirm within 24 hours.
        </p>
      </div>
    </section>
    <BookingSection />
    <Footer />
  </div>
);

export default BookingPage;
