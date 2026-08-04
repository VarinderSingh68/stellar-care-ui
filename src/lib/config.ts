const fallbackBaseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5004';

export const API_CONFIG = {
  baseUrl: import.meta.env.VITE_API_URL || fallbackBaseUrl,
  endpoints: {
    booking: '/api/send-booking',
    bookings: '/api/bookings',
    prescription: '/api/send-prescription',
    followup: '/api/send-followup',
    report: '/api/send-report',
    billing: '/api/send-billing'
  }
};