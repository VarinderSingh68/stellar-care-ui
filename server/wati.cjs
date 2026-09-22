// Optional WATI (WhatsApp Business API) integration. Every function here
// degrades gracefully ("skipped", never thrown) when WATI isn't configured,
// so the rest of the app works fine without it -- WhatsApp notifications are
// a bonus on top of email, not a requirement.

function sanitizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function createWatiClient(env = process.env) {
  const watiApiEndpoint = (env.WATI_API_ENDPOINT || '').trim();
  const watiAccessToken = (env.WATI_ACCESS_TOKEN || '').trim().replace(/^Bearer\s+/i, '');
  const watiChannelNumber = (env.WATI_CHANNEL_NUMBER || '').trim();
  const watiAppointmentTemplateName = (env.WATI_APPOINTMENT_TEMPLATE_NAME || '').trim();
  const watiPrescriptionTemplateName = (env.WATI_PRESCRIPTION_TEMPLATE_NAME || '').trim();
  const watiAppointmentBroadcastName = (env.WATI_APPOINTMENT_BROADCAST_NAME || 'appointment_confirmation').trim();
  const watiPrescriptionBroadcastName = (env.WATI_PRESCRIPTION_BROADCAST_NAME || 'prescription_pdf').trim();
  const watiDefaultCountryCode = String(env.WATI_DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, '') || '91';
  const watiPrescriptionPdfParamName = (env.WATI_PRESCRIPTION_PDF_PARAM_NAME || 'pdfLink').trim();

  const configured = Boolean(watiApiEndpoint && watiAccessToken);

  function normalizeWhatsAppNumber(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10) return `${watiDefaultCountryCode}${digits}`;
    if (digits.startsWith('0') && digits.length === 11) return `${watiDefaultCountryCode}${digits.slice(1)}`;
    return digits;
  }

  function watiSkipped(reason) {
    return { attempted: false, sent: false, skipped: true, reason };
  }

  function buildWatiParam(name, value) {
    return { name, value: sanitizeText(value) || '-' };
  }

  function getWatiBaseConfig(templateName) {
    if (!configured) {
      return { ready: false, reason: 'WATI API endpoint or access token is not configured.' };
    }
    if (!templateName) {
      return { ready: false, reason: 'WATI template name is not configured.' };
    }
    return { ready: true };
  }

  async function postWatiJson(pathname, queryParams, body) {
    if (typeof fetch !== 'function') {
      throw new Error('Node.js 18+ is required for WATI requests (global fetch not found).');
    }
    const base = watiApiEndpoint.replace(/\/+$/, '');
    const url = new URL(`${base}${pathname}`);
    Object.entries(queryParams || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${watiAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const rawText = await response.text();
    let payload = null;
    try {
      payload = rawText ? JSON.parse(rawText) : null;
    } catch {
      payload = null;
    }

    if (!response.ok || payload?.result === false) {
      const detail = payload?.message || payload?.error || rawText || `HTTP ${response.status}`;
      throw new Error(`WATI request failed: ${detail}`);
    }

    return payload || { ok: true };
  }

  async function sendWatiTemplate({ whatsappNumber, templateName, broadcastName, parameters }) {
    const number = normalizeWhatsAppNumber(whatsappNumber);
    if (!number) return watiSkipped('Patient WhatsApp number is missing.');

    const config = getWatiBaseConfig(templateName);
    if (!config.ready) return watiSkipped(config.reason);

    const body = { template_name: templateName, broadcast_name: broadcastName || templateName, parameters };
    const normalizedChannelNumber = normalizeWhatsAppNumber(watiChannelNumber);
    if (normalizedChannelNumber) body.channel_number = normalizedChannelNumber;

    const payload = await postWatiJson('/api/v2/sendTemplateMessage', { whatsappNumber: number }, body);
    return { attempted: true, sent: true, skipped: false, payload };
  }

  async function sendBookingWhatsApp({ patientName, patientPhone, appointmentDate, appointmentTime, clinicPhone }) {
    try {
      return await sendWatiTemplate({
        whatsappNumber: patientPhone,
        templateName: watiAppointmentTemplateName,
        broadcastName: watiAppointmentBroadcastName,
        parameters: [
          buildWatiParam('name', patientName),
          buildWatiParam('date', appointmentDate),
          buildWatiParam('time', appointmentTime),
          buildWatiParam('clinic_phone', clinicPhone),
        ],
      });
    } catch (error) {
      console.error('❌ WATI appointment error:', error.message || error);
      return { attempted: true, sent: false, skipped: false, reason: error.message || String(error) };
    }
  }

  async function sendPrescriptionWhatsApp({ patientName, patientPhone, pdfUrl, clinicPhone }) {
    if (!normalizeWhatsAppNumber(patientPhone)) return watiSkipped('Patient WhatsApp number is missing.');

    const config = getWatiBaseConfig(watiPrescriptionTemplateName);
    if (!config.ready) return watiSkipped(config.reason);
    if (!pdfUrl) return watiSkipped('PUBLIC_APP_URL is not configured, so WATI cannot fetch the prescription PDF.');

    try {
      return await sendWatiTemplate({
        whatsappNumber: patientPhone,
        templateName: watiPrescriptionTemplateName,
        broadcastName: watiPrescriptionBroadcastName,
        parameters: [
          buildWatiParam('name', patientName),
          buildWatiParam('clinic_phone', clinicPhone),
          { name: watiPrescriptionPdfParamName, value: pdfUrl },
        ],
      });
    } catch (error) {
      console.error('❌ WATI prescription error:', error.message || error);
      return { attempted: true, sent: false, skipped: false, reason: error.message || String(error) };
    }
  }

  return {
    configured,
    normalizeWhatsAppNumber,
    sendBookingWhatsApp,
    sendPrescriptionWhatsApp,
  };
}

module.exports = { createWatiClient };
