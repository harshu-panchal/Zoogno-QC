import mongoose from "mongoose";

const incentivePayoutSchema = new mongoose.Schema(
  {
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IncentiveCampaign",
      required: true,
      index: true,
    },
    deliveryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
      required: true,
      index: true,
    },
    progressId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IncentiveProgress",
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    periodKey: { type: String, required: true, trim: true },
    transactionRef: { type: String, required: true, trim: true, unique: true },
    status: {
      type: String,
      enum: ["paid"],
      default: "paid",
    },
  },
  { timestamps: true },
);

incentivePayoutSchema.index(
  { campaignId: 1, deliveryId: 1, periodKey: 1 },
  { unique: true },
);

export default mongoose.model("IncentivePayout", incentivePayoutSchema);
