import crypto from "crypto";

const DEFAULT_OTP_LENGTH = 4;

export function normalizeMobile(mobile) {
  return String(mobile || "").replace(/\D/g, "").slice(-10);
}

export function toIndianNumber(mobile) {
  const normalized = normalizeMobile(mobile);
  return normalized ? `91${normalized}` : "";
}

export function getOtpLength() {
  const parsed = parseInt(process.env.OTP_LENGTH || `${DEFAULT_OTP_LENGTH}`, 10);
  return Number.isFinite(parsed) && parsed >= 4 ? parsed : DEFAULT_OTP_LENGTH;
}

export function generateOTP(length = getOtpLength()) {
  const safeLength = Math.max(4, Number(length || DEFAULT_OTP_LENGTH));
  const min = 10 ** (safeLength - 1);
  const max = 10 ** safeLength;
  return crypto.randomInt(min, max).toString();
}

export function buildMessage(otp) {
  const minutes = parseInt(process.env.OTP_EXPIRY_MINUTES || "10", 10);
  const template = String(
    process.env.SMS_INDIA_HUB_TEMPLATE_TEXT ||
      "Welcome to ##var##, powered by ##var##. Your OTP for registration ##var##. This OTP is valid for 10 minutes. Please do not share it with anyone.BGADPL",
  );
  const appName = String(process.env.APP_NAME || "Zoogno").trim();
  const poweredBy = String(
    process.env.SMS_POWERED_BY || process.env.SMS_INDIA_HUB_SENDER_ID || "BGADPL"
  ).trim();

  // Primary replacements for common tags
  let msg = template
    .replace(/\{\{OTP\}\}/g, String(otp))
    .replace(/\{\{MINUTES\}\}/g, String(minutes))
    .replace(/\{\{APP_NAME\}\}/g, appName)
    .replace(/\{\{POWERED_BY\}\}/g, poweredBy)
    .replace(/\$\{otp\}/g, String(otp))
    .replace(/\$\{minutes\}/g, String(minutes))
    .replace(/\$\{appName\}/g, appName);

  // DLT templates often use generic variable tokens (e.g. ##var##).
  // In the approved template:
  // 1: App name (e.g. Zoogno)
  // 2: Entity / Powered By (e.g. BGADPL)
  // 3: OTP code (e.g. 1234)
  // 4: Validity minutes if parameterized
  const replacementOrder = [appName, poweredBy, String(otp), String(minutes)];

  const genericPlaceholders = [
    "##var##",
    "{#var#}",
    "{#VAR#}",
    "{#var1#}",
    "{#var2#}",
    "{#var3#}",
  ];

  genericPlaceholders.forEach((placeholder) => {
    let occurrence = 0;
    while (msg.includes(placeholder)) {
      const replacement =
        replacementOrder[Math.min(occurrence, replacementOrder.length - 1)];
      msg = msg.replace(placeholder, replacement);
      occurrence += 1;
    }
  });

  return msg;
}


