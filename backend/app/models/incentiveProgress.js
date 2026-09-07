import mongoose from "mongoose";

const incentiveProgressSchema = new mongoose.Schema(
  {
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IncentiveCampaign",
      required: true,
    },
    deliveryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
      required: true,
    },
    periodKey: { type: String, required: true, trim: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    completedOrders: { type: Number, default: 0, min: 0 },
    targetOrders: { type: Number, required: true, min: 1 },
    amount: { type: Number, required: true, min: 0 },
    orderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
    status: {
      type: String,
      enum: ["in_progress", "earned", "expired", "ineligible"],
      default: "in_progress",
      index: true,
    },
    ineligibleReason: { type: String, trim: true, default: "" },
    earnedAt: { type: Date, default: null },
    payoutId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IncentivePayout",
      default: null,
    },
    transactionRef: { type: String, trim: true, default: "" },
    rulesVersion: { type: Number, default: 1 },
  },
  { timestamps: true },
);

incentiveProgressSchema.index(
  { campaignId: 1, deliveryId: 1, periodKey: 1 },
  { unique: true },
);
incentiveProgressSchema.index({ deliveryId: 1, status: 1, periodEnd: 1 });
incentiveProgressSchema.index({ status: 1, periodEnd: 1 });

export default mongoose.model("IncentiveProgress", incentiveProgressSchema);
