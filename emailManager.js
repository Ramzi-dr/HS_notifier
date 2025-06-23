import nodemailer from "nodemailer";
import { logger } from "./logger.js";
import handleAsana from "./asanaManager.js";

// Send email to one or more targets
export async function sendEmail(targets, subject, htmlMessage) {
  // Configure SMTP transport using Office365
  const transporter = nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false, // TLS is used, not SSL
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      ciphers: "SSLv3",
    },
  });

  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: targets.join(", "),
      subject,
      html: htmlMessage,
    };

    // Notify Asana only if all required env vars exist
    try {
      await handleAsana(htmlMessage, subject);
    } catch (asanaErr) {
      logger.error("Asana notification failed: " + asanaErr);
    }

    await transporter.sendMail(mailOptions);
    logger.info(`Email sent to: ${targets.join(", ")}`);
  } catch (err) {
    logger.error("sendEmail error: " + err);
    throw err; // let caller handle
  }
}
