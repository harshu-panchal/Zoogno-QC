import crypto from "crypto";
import Counter from "../models/counter.js";

const CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIMESTAMP_PART_LENGTH = 10;
const RANDOM_PART_LENGTH = 16;

function encodeTimePart(timestampMs) {
  let value = BigInt(timestampMs);
  let encoded = "";
  for (let i = 0; i < TIMESTAMP_PART_LENGTH; i += 1) {
    const index = Number(value & 31n);
    encoded = CROCKFORD_BASE32[index] + encoded;
    value >>= 5n;
  }
  return encoded;
}

function randomBase32(length) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CROCKFORD_BASE32[bytes[i] % CROCKFORD_BASE32.length];
  }
  return out;
}

function buildSortableToken(nowMs = Date.now()) {
  return `${encodeTimePart(nowMs)}${randomBase32(RANDOM_PART_LENGTH)}`;
}

export function buildPublicOrderId() {
  return `ORD-${buildSortableToken()}`;
}

export function buildCheckoutGroupId() {
  return `CHK-${buildSortableToken()}`;
}

async function getNextSequenceValue(sequenceName, session = null) {
  const query = Counter.findByIdAndUpdate(
    sequenceName,
    { $inc: { sequence_value: 1 } },
    { new: true, upsert: true }
  );
  if (session) query.session(session);
  const sequenceDocument = await query;
  return sequenceDocument.sequence_value;
}

export async function generateUniquePublicOrderId({ session = null, maxAttempts = 8 } = {}) {
  try {
    const seq = await getNextSequenceValue("orderId", session);
    // Start sequence at 100000 for cleaner UI presentation
    const orderNumber = 100000 + seq; 
    return `ORD-${orderNumber}`;
  } catch (error) {
    console.error("Counter generation failed, falling back to random ID", error);
    // Fallback to random token which is virtually guaranteed to be unique
    return buildPublicOrderId(); 
  }
}

export async function generateUniqueCheckoutGroupId({ session = null, maxAttempts = 8 } = {}) {
  try {
    const seq = await getNextSequenceValue("checkoutGroupId", session);
    const chkNumber = 100000 + seq; 
    return `CHK-${chkNumber}`;
  } catch (error) {
    console.error("Counter generation failed, falling back to random ID", error);
    return buildCheckoutGroupId();
  }
}
