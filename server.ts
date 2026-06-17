import nodemailer from "nodemailer";

// Email configuration
const emailUser = process.env.EMAIL_USER || "ngw.designer@gmail.com";
const emailPassword = process.env.EMAIL_PASSWORD || "xvqe hegc yscu sszt";

// Create transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: emailUser,
    pass: emailPassword.replace(/\s/g, ""), // Remove spaces from password
  },
});

// Send booking email function
export async function sendBookingEmail(booking: {
  patientName: string;
  patientEmail: string;
  patientPhone: string;
  appointmentDate: string;
  appointmentTime: string;
  reason: string;
}) {
  try {
    // Email to patient
    const patientEmail = {
      from: emailUser,
      to: booking.patientEmail,
      subject: "CardioVita - Appointment Confirmation",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">Appointment Confirmation</h2>
          <p>Dear ${booking.patientName},</p>
          <p>Thank you for booking an appointment with CardioVita. Your appointment details are:</p>
          <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
            <p><strong>📅 Date:</strong> ${booking.appointmentDate}</p>
            <p><strong>⏰ Time:</strong> ${booking.appointmentTime}</p>
            <p><strong>📋 Reason:</strong> ${booking.reason}</p>
          </div>
          <p>We will contact you at <strong>${booking.patientPhone}</strong> to confirm your appointment.</p>
          <p style="margin-top: 30px; color: #666; font-size: 12px;">
            If you have any questions, please reply to this email or call us directly.
          </p>
          <p style="margin-top: 20px;">Best regards,<br><strong>CardioVita Medical Team</strong></p>
        </div>
      `,
    };

    // Email to admin
    const adminEmail = {
      from: emailUser,
      to: "ngw.designer@gmail.com",
      subject: `New Appointment Booking - ${booking.patientName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">New Appointment Booking</h2>
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px;">
            <p><strong>Patient Name:</strong> ${booking.patientName}</p>
            <p><strong>Email:</strong> <a href="mailto:${booking.patientEmail}">${booking.patientEmail}</a></p>
            <p><strong>Phone:</strong> <a href="tel:${booking.patientPhone}">${booking.patientPhone}</a></p>
            <p><strong>Appointment Date:</strong> ${booking.appointmentDate}</p>
            <p><strong>Appointment Time:</strong> ${booking.appointmentTime}</p>
            <p><strong>Reason for Visit:</strong> ${booking.reason}</p>
          </div>
          <p style="margin-top: 20px; color: #666; font-size: 12px;">
            Please review and confirm this appointment with the patient at your earliest convenience.
          </p>
        </div>
      `,
    };

    // Send both emails
    await transporter.sendMail(patientEmail);
    await transporter.sendMail(adminEmail);

    console.log("Emails sent successfully to patient and admin");
    return { success: true };
  } catch (error) {
    console.error("Email send error:", error);
    return { success: false, error: String(error) };
  }
}
