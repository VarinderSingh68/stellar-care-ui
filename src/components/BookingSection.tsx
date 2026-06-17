import { useState } from "react";
import { CalendarDays, Clock, Mail, Phone, User, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { saveBooking, sendBookingEmail, type Booking } from "@/lib/booking";
import { cn } from "@/lib/utils";

const timeSlots = [
  "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM",
  "11:00 AM", "11:30 AM", "2:00 PM", "2:30 PM",
  "3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM",
];

const BookingSection = () => {
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    patientName: "",
    patientEmail: "",
    patientPhone: "",
    reason: "",
  });
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.patientName.trim()) {
      setMessage("Please enter your name.");
      return;
    }
    if (!formData.patientEmail.trim()) {
      setMessage("Please enter your email.");
      return;
    }
    if (!formData.patientPhone.trim()) {
      setMessage("Please enter your phone number.");
      return;
    }
    if (!formData.reason.trim()) {
      setMessage("Please enter the reason for your visit.");
      return;
    }
    if (!date || !selectedTime) {
      setMessage("Please select a date and time.");
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    try {
      const booking: Booking = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        patientName: formData.patientName.trim(),
        patientEmail: formData.patientEmail.trim(),
        patientPhone: formData.patientPhone.trim(),
        reason: formData.reason.trim(),
        appointmentDate: date.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
        appointmentTime: selectedTime,
        bookingDate: new Date().toISOString(),
      };

      // Save locally
      saveBooking(booking);

      // Send email
      const emailResult = await sendBookingEmail(booking);

      setMessage(
        emailResult.success
          ? "✓ " + emailResult.message
          : "✓ Appointment saved! " + emailResult.message
      );

      // Reset form
      setFormData({ patientName: "", patientEmail: "", patientPhone: "", reason: "" });
      setDate(undefined);
      setSelectedTime(null);
    } catch (error) {
      console.error("Booking error:", error);
      setMessage("Appointment saved, but we couldn't send the notification. We'll contact you shortly.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section id="booking" className="py-24 lg:py-32">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-sm font-semibold text-primary tracking-wider uppercase mb-3">Book Now</p>
          <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">Schedule Your Appointment</h2>
          <p className="text-muted-foreground leading-relaxed">
            Fill in your details and choose a convenient date and time. We'll confirm your appointment within 24 hours.
          </p>
        </div>

        <div className="max-w-4xl mx-auto bg-card rounded-2xl shadow-elevated border border-border/50 overflow-hidden">
          <div className="grid md:grid-cols-2 gap-8 p-8">
            {/* Left Column - Patient Details */}
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />
                Your Details
              </h3>

              <div>
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  name="patientName"
                  value={formData.patientName}
                  onChange={handleInputChange}
                  placeholder="Enter your full name"
                  className="text-black"
                />
              </div>

              <div>
                <Label htmlFor="email" className="flex items-center gap-1">
                  <Mail className="w-4 h-4" />
                  Email *
                </Label>
                <Input
                  id="email"
                  name="patientEmail"
                  type="email"
                  value={formData.patientEmail}
                  onChange={handleInputChange}
                  placeholder="your@email.com"
                  className="text-black"
                />
              </div>

              <div>
                <Label htmlFor="phone" className="flex items-center gap-1">
                  <Phone className="w-4 h-4" />
                  Phone Number *
                </Label>
                <Input
                  id="phone"
                  name="patientPhone"
                  value={formData.patientPhone}
                  onChange={handleInputChange}
                  placeholder="+91 98765 43210"
                  className="text-black"
                />
              </div>

              <div>
                <Label htmlFor="reason" className="flex items-center gap-1">
                  <MessageSquare className="w-4 h-4" />
                  Reason for Visit *
                </Label>
                <Textarea
                  id="reason"
                  name="reason"
                  value={formData.reason}
                  onChange={handleInputChange}
                  placeholder="Describe your symptoms or reason for visit..."
                  className="text-black"
                />
              </div>
            </div>

            {/* Right Column - Date & Time */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
                  <CalendarDays className="w-5 h-5 text-primary" />
                  Select Date
                </h3>
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  disabled={(d) => d < new Date() || d.getDay() === 0}
                  className="pointer-events-auto rounded-lg"
                />
              </div>

              <div>
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
                  <Clock className="w-5 h-5 text-primary" />
                  Select Time
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {timeSlots.map((slot) => (
                    <button
                      key={slot}
                      onClick={() => setSelectedTime(slot)}
                      className={cn(
                        "rounded-lg px-3 py-2.5 text-sm font-medium transition-all border",
                        selectedTime === slot
                          ? "bg-primary text-primary-foreground border-primary shadow-glow"
                          : "bg-secondary text-secondary-foreground border-border hover:border-primary/50"
                      )}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>

              {message && (
                <div className={cn(
                  "rounded-lg p-4 text-sm",
                  message.includes("✓")
                    ? "bg-green-500/10 border border-green-500/30 text-green-600"
                    : "bg-amber-500/10 border border-amber-500/30 text-amber-600"
                )}>
                  {message}
                </div>
              )}

              {date && selectedTime && (
                <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
                  <p className="text-sm text-muted-foreground mb-1">Appointment scheduled for:</p>
                  <p className="text-foreground font-semibold">
                    {date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at {selectedTime}
                  </p>
                </div>
              )}

              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full shadow-glow"
                size="lg"
              >
                {isSubmitting ? "Booking..." : "Confirm Appointment"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default BookingSection;
