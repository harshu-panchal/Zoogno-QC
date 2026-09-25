import nodemailer from "nodemailer";
import logger from "./logger.js";

let cachedTransporter = null;

export function useRealEmailOTP() {
  return (
    process.env.USE_REAL_EMAIL_OTP === "true" ||
    process.env.USE_REAL_EMAIL_OTP === "1"
  );
}

function parseSmtpPort() {
  return parseInt(process.env.SMTP_PORT || "587", 10);
}

function parseSmtpSecure(port) {
  if (process.env.SMTP_SECURE === "true" || process.env.SMTP_SECURE === "1") {
    return true;
  }

  if (process.env.SMTP_SECURE === "false" || process.env.SMTP_SECURE === "0") {
    return false;
  }

  return port === 465;
}

function getMailFrom() {
  const fromAddress = String(process.env.MAIL_FROM || "").trim();
  const fromName = String(process.env.MAIL_FROM_NAME || "").trim();

  if (!fromAddress) {
    const error = new Error("MAIL_FROM is required for email OTP delivery");
    error.statusCode = 500;
    throw error;
  }

  return fromName ? `${fromName} <${fromAddress}>` : fromAddress;
}

function getTransportConfig() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = parseSmtpPort();
  const secure = parseSmtpSecure(port);
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();

  if (!host) {
    const error = new Error("SMTP_HOST is required for email OTP delivery");
    error.statusCode = 500;
    throw error;
  }

  if (!Number.isFinite(port) || port <= 0) {
    const error = new Error("SMTP_PORT must be a valid number");
    error.statusCode = 500;
    throw error;
  }

  if ((user && !pass) || (!user && pass)) {
    const error = new Error("SMTP_USER and SMTP_PASS must be provided together");
    error.statusCode = 500;
    throw error;
  }

  return {
    host,
    port,
    secure,
    ...(user && pass
      ? {
          auth: {
            user,
            pass,
          },
        }
      : {}),
  };
}

function getTransporter() {
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport(getTransportConfig());
  }

  return cachedTransporter;
}

export async function sendSellerVerificationOtpEmail({
  email,
  otp,
  expiresInMinutes,
}) {
  if (!useRealEmailOTP()) {
    logger.info("Seller email OTP generated in mock mode", {
      email,
      otp,
      mode: "mock",
    });
    return {
      delivered: false,
      mode: "mock",
    };
  }

  const transporter = getTransporter();
  await transporter.sendMail({
    from: getMailFrom(),
    to: email,
    subject: "Verify your seller signup email",
    text: `Your seller signup verification code is ${otp}. This code expires in ${expiresInMinutes} minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #0f172a;">
        <p>Your seller signup verification code is:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">${otp}</p>
        <p>This code expires in ${expiresInMinutes} minutes.</p>
      </div>
    `,
  });

  return {
    delivered: true,
    mode: "real",
  };
}

/**
 * Sends a settlement confirmation email to a seller or delivery partner after
 * a manual settlement has been successfully recorded in the database.
 */
export async function sendSettlementEmail({
  email,
  name,
  userType,        // 'Seller' | 'Delivery Boy'
  settlementId,
  settlementAmount,
  previousBalance,
  remainingBalance,
  settlementDate,
  processedBy,
}) {
  if (!email) return { delivered: false, mode: 'skipped', reason: 'no email' };

  const formattedDate = settlementDate
    ? new Date(settlementDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  const formattedTime = settlementDate
    ? new Date(settlementDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
    : new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  const subject = `Settlement Completed — ₹${Number(settlementAmount).toLocaleString('en-IN')} (Ref: ${settlementId})`;

  const text = `Dear ${name},

Your settlement of ₹${Number(settlementAmount).toLocaleString('en-IN')} has been successfully completed.

Settlement Details:
- Settlement Reference: ${settlementId}
- Type: ${userType}
- Settlement Amount: ₹${Number(settlementAmount).toLocaleString('en-IN')}
- Previous Remaining Balance: ₹${Number(previousBalance).toLocaleString('en-IN')}
- Remaining Balance After Settlement: ₹${Number(remainingBalance).toLocaleString('en-IN')}
- Date: ${formattedDate}
- Time: ${formattedTime}
- Status: Completed
- Processed By: ${processedBy || 'Admin'}

If you have any questions, please contact support.

Thank you,
Zoogno Team`;

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; max-width: 560px; margin: 0 auto; padding: 24px;">
      <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 16px; padding: 24px; margin-bottom: 24px; text-align: center;">
        <h1 style="color: #ffffff; font-size: 22px; font-weight: 800; margin: 0 0 4px;">Settlement Confirmed ✓</h1>
        <p style="color: #94a3b8; font-size: 13px; margin: 0;">Reference: <strong style="color: #e2e8f0;">${settlementId}</strong></p>
      </div>

      <p style="font-size: 14px; font-weight: 600; color: #334155;">Dear <strong>${name}</strong>,</p>
      <p style="font-size: 14px; color: #475569;">Your settlement of <strong style="color: #10b981; font-size: 18px;">₹${Number(settlementAmount).toLocaleString('en-IN')}</strong> has been successfully completed.</p>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 20px 0;">
        <h3 style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: #94a3b8; margin: 0 0 16px;">Settlement Details</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; font-size: 13px; color: #64748b; font-weight: 600;">Settlement ID</td>
            <td style="padding: 6px 0; font-size: 13px; color: #0f172a; font-weight: 800; text-align: right; font-family: monospace;">${settlementId}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-size: 13px; color: #64748b; font-weight: 600;">User Type</td>
            <td style="padding: 6px 0; font-size: 13px; color: #0f172a; font-weight: 800; text-align: right;">${userType}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-size: 13px; color: #64748b; font-weight: 600;">Settlement Amount</td>
            <td style="padding: 6px 0; font-size: 16px; color: #10b981; font-weight: 900; text-align: right;">₹${Number(settlementAmount).toLocaleString('en-IN')}</td>
          </tr>
          <tr style="border-top: 1px solid #e2e8f0;">
            <td style="padding: 10px 0 6px; font-size: 13px; color: #64748b; font-weight: 600;">Previous Balance</td>
            <td style="padding: 10px 0 6px; font-size: 13px; color: #f59e0b; font-weight: 800; text-align: right;">₹${Number(previousBalance).toLocaleString('en-IN')}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-size: 13px; color: #64748b; font-weight: 600;">Remaining Balance</td>
            <td style="padding: 6px 0; font-size: 13px; color: #0f172a; font-weight: 900; text-align: right;">₹${Number(remainingBalance).toLocaleString('en-IN')}</td>
          </tr>
          <tr style="border-top: 1px solid #e2e8f0;">
            <td style="padding: 10px 0 6px; font-size: 13px; color: #64748b; font-weight: 600;">Date &amp; Time</td>
            <td style="padding: 10px 0 6px; font-size: 13px; color: #0f172a; font-weight: 800; text-align: right;">${formattedDate}, ${formattedTime}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-size: 13px; color: #64748b; font-weight: 600;">Status</td>
            <td style="padding: 6px 0; text-align: right;">
              <span style="background: #d1fae5; color: #065f46; font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 1px;">Completed</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-size: 13px; color: #64748b; font-weight: 600;">Processed By</td>
            <td style="padding: 6px 0; font-size: 13px; color: #0f172a; font-weight: 800; text-align: right;">${processedBy || 'Admin'}</td>
          </tr>
        </table>
      </div>

      <p style="font-size: 13px; color: #64748b;">If you have any questions, please contact our support team.</p>
      <p style="font-size: 13px; color: #64748b; margin-top: 24px;">Thank you,<br/><strong style="color: #0f172a;">Zoogno Team</strong></p>
    </div>
  `;

  if (!useRealEmailOTP()) {
    logger.info('Settlement email generated in mock mode', { email, settlementId, settlementAmount, mode: 'mock' });
    return { delivered: false, mode: 'mock' };
  }

  const transporter = getTransporter();
  await transporter.sendMail({ from: getMailFrom(), to: email, subject, text, html });
  return { delivered: true, mode: 'real' };
}

export function __resetEmailTransportForTests() {
  cachedTransporter = null;
}
