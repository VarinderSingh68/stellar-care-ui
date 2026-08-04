const localFallbackBaseUrl = 'http://localhost:5004';
const sameOriginFallbackBaseUrl = '';

export const API_CONFIG = {
  baseUrl: import.meta.env.VITE_API_URL || (import.meta.env.DEV ? localFallbackBaseUrl : sameOriginFallbackBaseUrl),
  endpoints: {
    booking: '/api/send-booking',
    bookings: '/api/bookings',
    prescription: '/api/send-prescription',
    followup: '/api/send-followup',
    report: '/api/send-report',
    billing: '/api/send-billing'
  }
};