import { API_CONFIG } from "./config";

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

export const getBookings = async (): Promise<Booking[]> => {
  try {
    const response = await fetch(`${API_CONFIG.baseUrl}/api/bookings`);
    if (!response.ok) {
      console.error("Failed to fetch bookings:", response.statusText);
      return [];
    }
    const bookings = await response.json();
    return bookings;
  } catch (error) {
    console.error("Error fetching bookings:", error);
    return [];
  }
};

export const saveBookingAndNotify = async (booking: Omit<Booking, 'id' | 'bookingDate'>): Promise<{ success: boolean; message: string }> => {
  try {
    const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.booking}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(booking),
    });
    
    const payload = await response.json().catch(() => null);

    if (response.ok && payload?.success) {
       // Dispatch event for real-time updates
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("bookingUpdated"));
      }
      return {
        success: true,
        message: payload.message || "Booking confirmed and notification sent.",
      };
    }

    // Handle non-200 responses but with a JSON payload
    if (payload) {
      return { success: false, message: payload.message || "An unknown error occurred." };
    }
    
    // Handle fetch errors or non-JSON responses
    return {
      success: false,
      message: "Failed to save booking. Please try again shortly.",
    };
  } catch (error) {
    console.error("Booking save and notify error:", error);
    let message = "An unexpected error occurred. Please try again.";
     if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      message = "Could not connect to the server. Is it running? Please try again later.";
    }
    return { success: false, message };
  }
};

