import mongoose from "mongoose";
import { ALL_OWNER_TYPES, ALL_WALLET_STATUSES, CURRENCY } from "../constants/finance.js";

const walletSchema = new mongoose.Schema(
  {
    ownerType: {
      type: String,
      enum: ALL_OWNER_TYPES,
      required: true,
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    currency: {
      type: String,
      default: CURRENCY,
      uppercase: true,
      trim: true,
    },
    availableBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    pendingBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Amount already recovered from future seller settlements after a return/cancellation
    // exhausted the withdrawable balance. Keeping it separate preserves the non-negative
    // available balance invariant while making the liability durable and auditable.
    adjustmentBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    cashInHand: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalCredited: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalDebited: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ALL_WALLET_STATUSES,
      default: "ACTIVE",
    },
    meta: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true },
);

walletSchema.index(
  { ownerType: 1, ownerId: 1 },
  { unique: true, partialFilterExpression: { ownerType: { $exists: true } } },
);

export default mongoose.model("Wallet", walletSchema);
