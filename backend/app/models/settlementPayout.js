import mongoose from "mongoose";
import { roundCurrency } from "../utils/money.js";

const { Schema } = mongoose;

export const BENEFICIARY_TYPE = {
  SELLER: "SELLER",
  DELIVERY_PARTNER: "DELIVERY_PARTNER",
};

export const PAYMENT_METHOD = {
  BANK_TRANSFER: "BANK_TRANSFER",
  UPI: "UPI",
  CASH: "CASH",
  OTHER: "OTHER",
};

export const SETTLEMENT_PAYOUT_STATUS = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  PAID: "PAID",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
};

// Statuses that reserve money against the beneficiary's remaining payable
// balance even though it hasn't been confirmed PAID yet — an in-flight
// Cashfree transfer must not let a second payout over-allocate the same funds.
export const COMMITTED_PAYOUT_STATUSES = [
  SETTLEMENT_PAYOUT_STATUS.PENDING,
  SETTLEMENT_PAYOUT_STATUS.PROCESSING,
  SETTLEMENT_PAYOUT_STATUS.PAID,
];

export const PAYOUT_CHANNEL = {
  MANUAL: "MANUAL",
  CASHFREE: "CASHFREE",
};

// Bank Transfer / UPI are always disbursed automatically via Cashfree; Cash/Other
// stay manually-recorded. Decided by paymentMethod, never client-supplied.
export const CASHFREE_PAYMENT_METHODS = [PAYMENT_METHOD.BANK_TRANSFER, PAYMENT_METHOD.UPI];

const BENEFICIARY_MODEL_BY_TYPE = {
  [BENEFICIARY_TYPE.SELLER]: "Seller",
  [BENEFICIARY_TYPE.DELIVERY_PARTNER]: "Delivery",
};

export const ALL_BENEFICIARY_TYPES = Object.values(BENEFICIARY_TYPE);
export const ALL_PAYMENT_METHODS = Object.values(PAYMENT_METHOD);
export const ALL_SETTLEMENT_PAYOUT_STATUSES = Object.values(SETTLEMENT_PAYOUT_STATUS);
export const ALL_PAYOUT_CHANNELS = Object.values(PAYOUT_CHANNEL);

function generatePayoutId() {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SP-${Date.now()}-${rand}`;
}

const settlementPayoutSchema = new Schema(
  {
    payoutId: {
      type: String,
      unique: true,
      default: generatePayoutId,
    },
    beneficiaryType: {
      type: String,
      enum: ALL_BENEFICIARY_TYPES,
      required: true,
    },
    beneficiaryModel: {
      type: String,
      enum: Object.values(BENEFICIARY_MODEL_BY_TYPE),
      required: true,
    },
    beneficiaryId: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: "beneficiaryModel",
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
      set: (v) => roundCurrency(v),
    },
    paymentMethod: {
      type: String,
      enum: ALL_PAYMENT_METHODS,
      required: true,
    },
    transactionReference: {
      type: String,
      trim: true,
      default: null,
    },
    paymentDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ALL_SETTLEMENT_PAYOUT_STATUSES,
      default: SETTLEMENT_PAYOUT_STATUS.PAID,
    },
    payoutChannel: {
      type: String,
      enum: ALL_PAYOUT_CHANNELS,
      required: true,
    },
    failureReason: {
      type: String,
      trim: true,
      default: "",
    },
    cashfreeBeneficiaryId: {
      type: String,
      default: null,
    },
    cashfreeTransferId: {
      type: String,
      default: null,
    },
    cashfreeReferenceId: {
      type: String,
      default: null,
    },
    cashfreeStatus: {
      type: String,
      default: null,
    },
    cashfreeStatusCode: {
      type: String,
      default: null,
    },
    cashfreeStatusDescription: {
      type: String,
      default: null,
    },
    cashfreeRawResponse: {
      type: Schema.Types.Mixed,
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    createdByName: {
      type: String,
      default: "",
    },
    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    cancelledByName: {
      type: String,
      default: "",
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelReason: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true },
);

settlementPayoutSchema.pre("validate", function setBeneficiaryModel(next) {
  if (this.beneficiaryType) {
    this.beneficiaryModel = BENEFICIARY_MODEL_BY_TYPE[this.beneficiaryType];
  }
  next();
});

settlementPayoutSchema.index({ beneficiaryId: 1, beneficiaryType: 1, status: 1 });
settlementPayoutSchema.index({ beneficiaryType: 1, paymentDate: -1 });
settlementPayoutSchema.index({ status: 1 });
settlementPayoutSchema.index({ transactionReference: 1 });
settlementPayoutSchema.index({ cashfreeTransferId: 1 });

const SettlementPayout = mongoose.model("SettlementPayout", settlementPayoutSchema);

export default SettlementPayout;
