import mongoose from "mongoose";

/**
 * One document per "delivery partner reached the customer but could not reach
 * them" incident. Lifecycle:
 *
 *   REACHED  -> rider arrived at the drop location (calls are being attempted)
 *   CUSTOMER_UNREACHABLE -> rider reported the customer unreachable; waiting for admin
 *   CANCELLED_CUSTOMER_UNREACHABLE -> admin cancelled the order (optionally with a charge)
 *   RESOLVED_RETRY -> admin asked the rider to retry the delivery
 *
 * The rider can never finalize a cancellation — only the admin endpoints move
 * a case out of CUSTOMER_UNREACHABLE.
 */
export const UNREACHABLE_CASE_STATUS = Object.freeze({
  REACHED: "REACHED",
  CUSTOMER_UNREACHABLE: "CUSTOMER_UNREACHABLE",
  CANCELLED: "CANCELLED_CUSTOMER_UNREACHABLE",
  RETRY: "RESOLVED_RETRY",
});

export const ACTIVE_CASE_STATUSES = [
  UNREACHABLE_CASE_STATUS.REACHED,
  UNREACHABLE_CASE_STATUS.CUSTOMER_UNREACHABLE,
];

const callAttemptSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    channel: { type: String, default: "phone" },
  },
  { _id: false },
);

const locationSchema = new mongoose.Schema(
  {
    lat: Number,
    lng: Number,
    distanceFromDropMeters: Number,
  },
  { _id: false },
);

const customerUnreachableCaseSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    orderId: { type: String, required: true, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    customerName: String,
    customerPhone: String,
    deliveryBoy: { type: mongoose.Schema.Types.ObjectId, ref: "Delivery", required: true, index: true },
    deliveryBoyName: String,
    deliveryBoyPhone: String,
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "Seller" },
    orderAmount: { type: Number, default: 0 },
    paymentMode: String,
    items: [
      {
        _id: false,
        name: String,
        quantity: Number,
        price: Number,
      },
    ],
    address: {
      name: String,
      phone: String,
      address: String,
      city: String,
      landmark: String,
    },
    status: {
      type: String,
      enum: Object.values(UNREACHABLE_CASE_STATUS),
      default: UNREACHABLE_CASE_STATUS.REACHED,
      index: true,
    },
    isActive: { type: Boolean, default: true },
    reachedAt: { type: Date, required: true },
    reachedLocation: locationSchema,
    callAttempts: { type: [callAttemptSchema], default: [] },
    callAttemptCount: { type: Number, default: 0 },
    reportedAt: Date,
    reportedLocation: locationSchema,
    riderNote: String,

    // Admin resolution
    resolvedAt: Date,
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    resolvedByName: String,
    adminNote: String,
    chargeAmount: { type: Number, default: 0 },
    charge: { type: mongoose.Schema.Types.ObjectId, ref: "UnreachableCharge" },
    // Mirrors the linked UnreachableCharge.status so list tabs can filter without a join.
    chargeStatus: {
      type: String,
      enum: ["NONE", "PENDING", "APPLIED", "RECOVERED", "WAIVED", "CANCELLED"],
      default: "NONE",
      index: true,
    },
  },
  { timestamps: true },
);

customerUnreachableCaseSchema.index({ status: 1, createdAt: -1 });
// Only one live case per order at a time (a retried order may later get a fresh case).
// `isActive` is true while REACHED / CUSTOMER_UNREACHABLE and false once admin resolves it
// (plain-equality partial filter works on every MongoDB version).
customerUnreachableCaseSchema.index(
  { order: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true },
  },
);

export default mongoose.models.CustomerUnreachableCase ||
  mongoose.model("CustomerUnreachableCase", customerUnreachableCaseSchema);
