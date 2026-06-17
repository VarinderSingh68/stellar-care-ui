export interface Booking {
  id: string;
  patientName: string;
  patientEmail: string;
  patientPhone: string;
  appointmentDate: string;
  appointmentTime: string;
  reason: string;
  bookingDate: string;
}

const BOOKINGS_KEY = "cardiovita.bookings";
const ADMIN_EMAIL = "ngw.designer@gmail.com";

export const getBookings = (): Booking[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(BOOKINGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const saveBooking = (booking: Booking) => {
  if (typeof window === "undefined") return;
  const bookings = getBookings();
  const updated = [booking, ...bookings];
  localStorage.setItem(BOOKINGS_KEY, JSON.stringify(updated));
  
  // Dispatch event for real-time updates
  window.dispatchEvent(new Event("bookingUpdated"));
};

export const sendBookingEmail = async (booking: Booking): Promise<{ success: boolean; message: string }> => {
  try {
    const response = await fetch("http://localhost:5000/api/send-booking", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        patientName: booking.patientName,
        patientEmail: booking.patientEmail,
        patientPhone: booking.patientPhone,
        appointmentDate: booking.appointmentDate,
        appointmentTime: booking.appointmentTime,
        reason: booking.reason,
      }),
    });
    const payload = await response.json().catch(() => null);

    if (response.ok && payload?.success !== false) {
      return {
        success: true,
        message: payload?.message || "Booking confirmed! Appointment notification sent.",
      };
    }

    return {
      success: false,
      message: payload?.message || "Booking saved but notification failed. We'll contact you shortly.",
    };
  } catch (error) {
    console.error("Booking notification send error:", error);
    return { success: false, message: "Booking saved locally. We'll contact you to confirm shortly." };
  }
};
