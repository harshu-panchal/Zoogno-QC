import mongoose from "mongoose";

/**
 * A charge the platform raised against a customer after a Customer Unreachable
 * cancellation. It is a *pending recovery* — it never touches the customer's
 * existing wallet balance. It is added to the customer's next order and, once
 * that order is delivered, becomes RECOVERED (platform/admin earning only —
 * never seller or rider earning).
 *
 *   PENDING   -> waiting for the customer's next order
 *   APPLIED   -> added to a newer order that is still in flight
 *   RECOVERED -> that order was delivered; money recovered (admin earning)
 *   WAIVED    -> admin forgave the charge
 *   CANCELLED -> charge voided (not used by default flows)
 */
export const UNREACHABLE_CHARGE_STATUS = Object.freeze({
  PENDING: "PENDING",
  APPLIED: "APPLIED",
  RECOVERED: "RECOVERED",
  WAIVED: "WAIVED",
  CANCELLED: "CANCELLED",
});

const historySchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId },
    byName: String,
    byRole: String,
    note: String,
  },
  { _id: false },
);

const unreachableChargeSchema = new mongoose.Schema(
  {
    chargeId: { type: String, required: true, unique: true, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    customerName: String,
    customerPhone: String,
    originalOrder: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    originalOrderId: { type: String, required: true, index: true },
    originalOrderAmount: { type: Number, default: 0 },
    case: { type: mongoose.Schema.Types.ObjectId, ref: "CustomerUnreachableCase", index: true },
    amount: { type: Number, required: true, min: 0 },
    reason: { type: String, default: "Customer Unreachable" },
    status: {
      type: String,
      enum: Object.values(UNREACHABLE_CHARGE_STATUS),
      default: UNREACHABLE_CHARGE_STATUS.PENDING,
      index: true,
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    createdByName: String,

    appliedOrder: { type: mongoose.Schema.Types.ObjectId, ref: "Order", index: true },
    appliedOrderId: String,
    appliedAt: Date,

    recoveredAt: { type: Date, index: true },
    // Admin earning entry (amount actually credited to platform earnings).
    adminEarning: { type: Number, default: 0 },

    waivedAt: Date,
    waivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    waivedByName: String,
    waiveReason: String,

    history: { type: [historySchema], default: [] },
  },
  { timestamps: true },
);

unreachableChargeSchema.index({ customer: 1, status: 1, createdAt: 1 });
unreachableChargeSchema.index({ status: 1, createdAt: -1 });
// A single order can only ever generate one charge per case.
unreachableChargeSchema.index({ case: 1 }, { unique: true, sparse: true });

export default mongoose.models.UnreachableCharge ||
  mongoose.model("UnreachableCharge", unreachableChargeSchema);
