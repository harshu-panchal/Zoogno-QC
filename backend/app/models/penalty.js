import mongoose from "mongoose";
import { BENEFICIARY_TYPE } from "./settlementPayout.js";

/**
 * A penalty an admin applied to a seller or delivery partner after investigating
 * an order issue. Penalties are NEVER deleted: a mistaken penalty is REVOKED, which
 * keeps the record and posts an offsetting wallet credit.
 */
export const PENALTY_STATUS = Object.freeze({
  APPLIED: "APPLIED",
  REVOKED: "REVOKED",
});

export const PENALTY_REASON = Object.freeze({
  PRODUCT_DAMAGED: "PRODUCT_DAMAGED",
  CONDITION_MISMATCH: "CONDITION_MISMATCH",
  DAMAGED_IN_DELIVERY: "DAMAGED_IN_DELIVERY",
  WRONG_PRODUCT: "WRONG_PRODUCT",
  MISSING_PRODUCT: "MISSING_PRODUCT",
  LATE_OR_UNPROFESSIONAL: "LATE_OR_UNPROFESSIONAL",
  OTHER: "OTHER",
});

export const PENALTY_REASON_LABEL = Object.freeze({
  PRODUCT_DAMAGED: "Product damaged",
  CONDITION_MISMATCH: "Product condition does not match condition at dispatch",
  DAMAGED_IN_DELIVERY: "Product damaged during delivery",
  WRONG_PRODUCT: "Wrong product",
  MISSING_PRODUCT: "Missing product",
  LATE_OR_UNPROFESSIONAL: "Late / unprofessional conduct",
  OTHER: "Other",
});

const evidenceRefSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["SELLER_DISPATCH", "RIDER_PICKUP", "CUSTOMER_RETURN", "CUSTOMER_TICKET", "RETURN_PICKUP"],
      required: true,
    },
    url: { type: String, required: true },
    caption: String,
  },
  { _id: false },
);

const historySchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId },
    byName: String,
    note: String,
  },
  { _id: false },
);

const penaltySchema = new mongoose.Schema(
  {
    penaltyId: { type: String, required: true, unique: true, index: true },
    beneficiaryType: {
      type: String,
      enum: Object.values(BENEFICIARY_TYPE),
      required: true,
      index: true,
    },
    // Seller _id (SELLER) or Delivery _id (DELIVERY_PARTNER)
    beneficiary: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    beneficiaryName: { type: String, default: "" },
    beneficiaryPhone: { type: String, default: "" },

    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    orderId: { type: String, required: true, index: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    productName: { type: String, default: "" },

    amount: { type: Number, required: true, min: 0.01 },
    reason: { type: String, enum: Object.values(PENALTY_REASON), required: true },
    reasonLabel: { type: String, default: "" },
    notes: { type: String, default: "", trim: true, maxlength: 1000 },

    // Where the issue was raised (all optional — admin may also act on their own finding)
    relatedReturnStatus: { type: String, default: "" },
    relatedReturnReason: { type: String, default: "" },
    relatedTicket: { type: mongoose.Schema.Types.ObjectId, ref: "Ticket" },
    relatedTicketSubject: { type: String, default: "" },
    evidence: { type: [evidenceRefSchema], default: [] },

    status: {
      type: String,
      enum: Object.values(PENALTY_STATUS),
      default: PENALTY_STATUS.APPLIED,
      index: true,
    },

    // Wallet / settlement snapshot at the moment the penalty was applied
    amountDeducted: { type: Number, default: 0 },
    earnedAtApplication: { type: Number, default: 0 },
    remainingBefore: { type: Number, default: 0 },
    remainingAfter: { type: Number, default: 0 },
    walletTransaction: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
    walletTransactionRef: { type: String, default: "" },

    appliedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    appliedByName: { type: String, default: "" },

    revokedAt: Date,
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    revokedByName: String,
    revokeReason: String,
    reversalTransactionRef: String,

    history: { type: [historySchema], default: [] },
  },
  { timestamps: true },
);

penaltySchema.index({ beneficiaryType: 1, beneficiary: 1, status: 1, createdAt: -1 });
penaltySchema.index({ status: 1, createdAt: -1 });

export default mongoose.models.Penalty || mongoose.model("Penalty", penaltySchema);
