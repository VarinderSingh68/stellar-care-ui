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

// NOTE: reading the list of bookings back requires an admin session (see
// GET /api/bookings in email-server.cjs, which now protects patient PII
// behind admin auth) -- use `getBookings` from "@/lib/admin" for that.
// This module only covers the public, unauthenticated booking flow.

export const saveBookingAndNotify = async (booking: Omit<Booking, 'id' | 'bookingDate'>): Promise<{ success: boolean; message: string }> => {
  const baseUrl = API_CONFIG.baseUrl?.trim();
  if (!baseUrl) {
    return {
      success: false,
      message: "Backend URL is not configured. Please set VITE_API_URL.",
    };
  }

  const endpointUrl = `${baseUrl}${API_CONFIG.endpoints.booking}`;
  console.log("Booking request URL:", endpointUrl);

  const controller = new AbortController();
  const timeoutMs = 60000;
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(booking),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);

    if (response.ok && payload?.success) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("bookingUpdated"));
      }
      return {
        success: true,
        message: payload.message || "Booking confirmed and notification sent.",
      };
    }

    if (payload) {
      return {
        success: false,
        message: payload.message || "An unknown error occurred while booking.",
      };
    }

    return {
      success: false,
      message: "Failed to save booking. Please try again shortly.",
    };
  } catch (error) {
    console.error("Booking save and notify error:", error);
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        success: false,
        message: "Booking request timed out. Please check the backend status and try again.",
      };
    }

    let message = "An unexpected error occurred. Please try again.";
    if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
      message = "Could not connect to the server. Is it running? Please check the backend status.";
    }
    return { success: false, message };
  } finally {
    window.clearTimeout(timeoutId);
  }
};

