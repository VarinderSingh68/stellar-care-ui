import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import path from "path";
import fs from "fs/promises";
import { z } from "zod";

const BOOKINGS_FILE = path.join(process.cwd(), "bookings.json");


// Email configuration
const emailUser = process.env.EMAIL_USER;
const emailPassword = process.env.EMAIL_PASSWORD;

if (!emailUser || !emailPassword) {
  console.error(
    "FATAL ERROR: EMAIL_USER or EMAIL_PASSWORD is not defined in the environment."
  );
  console.error(
    "Please create a .env file in the root of the project and add these variables."
  );
  process.exit(1); // Exit with an error code
}

// Create transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: emailUser,
    pass: emailPassword.replace(/\s/g, ""),
  },
});

// Define a schema for booking data validation
const BookingSchema = z.object({
  patientName: z.string().min(1, "Patient name is required."),
  patientEmail: z.string().email("Invalid email address."),
  patientPhone: z.string().min(1, "Patient phone is required."),
  appointmentDate: z.string().min(1, "Appointment date is required."),
  appointmentTime: z.string().min(1, "Appointment time is required."),
  reason: z.string().min(1, "Reason for visit is required."),
});

// Infer the TypeScript type from the schema
type BookingData = z.infer<typeof BookingSchema>;

const PrescriptionSchema = z.object({
  patientName: z.string().min(1, "Patient name is required."),
  patientEmail: z.string().email("Invalid email address."),
  prescriptionText: z.string().min(1, "Prescription text is required."),
  doctorName: z.string().optional().default("Your Doctor at CardioVita"),
});

type PrescriptionData = z.infer<typeof PrescriptionSchema>;

const NotificationSchema = z.object({
  patientEmail: z.string().email("Invalid email address."),
  subject: z.string().min(1, "Subject is required."),
  message: z.string().min(1, "Message body is required."),
  patientName: z.string().optional(),
});

// Send booking email function
export async function sendBookingEmail(booking: BookingData) {
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

/**
 * Sends a prescription email to a patient.
 */
export async function sendPrescriptionEmail(data: PrescriptionData) {
  try {
    const mailOptions = {
      from: emailUser,
      to: data.patientEmail,
      subject: "Your Prescription from CardioVita",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">Your Medical Prescription</h2>
          <p>Dear ${data.patientName},</p>
          <p>As discussed during your recent consultation, please find your prescription details below. Follow the instructions carefully.</p>
          <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb; white-space: pre-wrap;">${data.prescriptionText}</div>
          <p>If you have any questions regarding your prescription, please do not hesitate to contact us.</p>
          <p style="margin-top: 30px;">Best regards,<br><strong>${data.doctorName}</strong><br><strong>CardioVita Medical Team</strong></p>
        </div>
      `,
    };
    await transporter.sendMail(mailOptions);
    console.log(`Prescription email sent successfully to ${data.patientEmail}`);
    return { success: true };
  } catch (error) {
    console.error("Prescription email send error:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Sends a generic notification email to a patient.
 */
export async function sendNotificationEmail(data: z.infer<typeof NotificationSchema>) {
  try {
    const mailOptions = {
      from: emailUser,
      to: data.patientEmail,
      subject: `CardioVita: ${data.subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">${data.subject}</h2>
          <p>Dear ${data.patientName || 'Patient'},</p>
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin-top: 20px; white-space: pre-wrap;">${data.message}</div>
          <p style="margin-top: 30px;">
            You can view more details by logging into your <a href="#" style="color: #2563eb;">Patient Portal</a>.
          </p>
          <p style="margin-top: 20px;">Best regards,<br><strong>CardioVita Medical Team</strong></p>
        </div>
      `,
    };
    await transporter.sendMail(mailOptions);
    console.log(`Notification email sent successfully to ${data.patientEmail}`);
    return { success: true };
  } catch (error) {
    console.error("Notification email send error:", error);
    return { success: false, error: String(error) };
  }
}

const app = express();
const port = 5003;

// Enable CORS for all routes
app.use(cors());

// Middleware to parse JSON bodies
app.use(express.json());

// Health check endpoint
app.get("/", (req, res) => {
  res.send("Stellar Care UI Email Server is running.");
});

// Get all bookings
app.get("/api/bookings", async (req, res) => {
  try {
    const data = await fs.readFile(BOOKINGS_FILE, "utf-8");
    res.status(200).json(JSON.parse(data));
  } catch (error) {
    console.error("Error reading bookings:", error);
    if (error.code === 'ENOENT') {
      return res.status(200).json([]); // Return empty array if file doesn't exist
    }
    res.status(500).json({ success: false, error: "Failed to retrieve bookings." });
  }
});

const AdminBookingSchema = BookingSchema.extend({
  id: z.string(),
  bookingDate: z.string(),
  status: z.string().optional(),
  durationMinutes: z.number().optional(),
  notes: z.string().optional(),
  patientId: z.string().optional(),
});

// Endpoint to handle creating appointments from admin
app.post("/api/appointments", async (req, res) => {
  const validationResult = AdminBookingSchema.safeParse(req.body);

  if (!validationResult.success) {
    return res.status(400).json({
      success: false,
      error: "Invalid appointment data.",
      details: validationResult.error.flatten(),
    });
  }
  
  const newBooking = validationResult.data;

  try {
    let bookings = [];
    try {
      const data = await fs.readFile(BOOKINGS_FILE, "utf-8");
      bookings = JSON.parse(data);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    
    bookings.unshift(newBooking);
    await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
    
    res.status(200).json({ success: true, message: "Appointment created successfully." });
  } catch (error) {
    console.error("Error in /api/appointments:", error);
    res.status(500).json({ success: false, error: "An unexpected error occurred while creating the appointment." });
  }
});

const UpdateBookingSchema = z.object({
  status: z.string(),
});

// Endpoint to update an appointment
app.put("/api/appointments/:id", async (req, res) => {
  const { id } = req.params;
  const validationResult = UpdateBookingSchema.safeParse(req.body);

  if (!validationResult.success) {
    return res.status(400).json({
      success: false,
      error: "Invalid appointment data.",
      details: validationResult.error.flatten(),
    });
  }

  const { status } = validationResult.data;

  try {
    let bookings = [];
    try {
      const data = await fs.readFile(BOOKINGS_FILE, "utf-8");
      bookings = JSON.parse(data);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    const bookingIndex = bookings.findIndex((b: any) => b.id === id);

    if (bookingIndex === -1) {
      return res.status(404).json({ success: false, error: "Appointment not found." });
    }

    bookings[bookingIndex] = { ...bookings[bookingIndex], status };

    await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));

    res.status(200).json({ success: true, message: "Appointment updated successfully." });
  } catch (error) {
    console.error("Error in /api/appointments/:id:", error);
    res.status(500).json({ success: false, error: "An unexpected error occurred while updating the appointment." });
  }
});

// Endpoint to handle booking and send email
app.post("/api/book-appointment", async (req, res) => {
  const validationResult = BookingSchema.safeParse(req.body);

  if (!validationResult.success) {
    return res.status(400).json({
      success: false,
      error: "Invalid booking data.",
      details: validationResult.error.flatten(),
    });
  }

  const bookingData = validationResult.data;

  try {
    // Save the booking
    let bookings = [];
    try {
      const data = await fs.readFile(BOOKINGS_FILE, "utf-8");
      bookings = JSON.parse(data);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    
    const newBooking = {
      id: new Date().toISOString(), 
      ...bookingData,
      bookingDate: new Date().toISOString()
    };
    
    bookings.unshift(newBooking);
    await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
    
    // Send the email
    const emailResult = await sendBookingEmail(bookingData);
    
    if (emailResult.success) {
      res
        .status(200)
        .json({
          success: true,
          message: "Appointment booked, saved, and confirmation email sent.",
        });
    } else {
      // Still success from the client's perspective, but log the email failure.
      res.status(200).json({ 
        success: true, 
        message: "Appointment saved, but the confirmation email failed to send.",
        error: emailResult.error
      });
    }
  } catch (error) {
    console.error("Error in /api/book-appointment:", error);
    res.status(500).json({ success: false, error: "An unexpected error occurred while saving the appointment." });
  }
});

app.post("/api/send-prescription", async (req, res) => {
  const validationResult = PrescriptionSchema.safeParse(req.body);

  if (!validationResult.success) {
    return res.status(400).json({
      success: false,
      error: "Invalid prescription data.",
      details: validationResult.error.flatten(),
    });
  }

  try {
    const emailResult = await sendPrescriptionEmail(validationResult.data);
    if (emailResult.success) {
      res.status(200).json({ success: true, message: "Prescription sent successfully." });
    } else {
      res.status(500).json({ success: false, error: "Failed to send prescription email.", details: emailResult.error });
    }
  } catch (error) {
    console.error("Error in /api/send-prescription:", error);
    res.status(500).json({ success: false, error: "An unexpected error occurred." });
  }
});

// Endpoint to send a generic notification
app.post("/api/send-notification", async (req, res) => {
  const validationResult = NotificationSchema.safeParse(req.body);

  if (!validationResult.success) {
    return res.status(400).json({
      success: false,
      error: "Invalid notification data.",
      details: validationResult.error.flatten(),
    });
  }

  try {
    const emailResult = await sendNotificationEmail(validationResult.data);
    if (emailResult.success) {
      res.status(200).json({ success: true, message: "Notification sent successfully." });
    } else {
      res.status(500).json({ success: false, error: "Failed to send notification email.", details: emailResult.error });
    }
  } catch (error) {
    console.error("Error in /api/send-notification:", error);
    res.status(500).json({ success: false, error: "An unexpected error occurred." });
  }
});

app.listen(port, () => {
  console.log(`Backend server is running on http://localhost:${port}`);
});
