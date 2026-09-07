import mongoose from "mongoose";

const incentiveAssignmentSchema = new mongoose.Schema(
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
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    assignedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

incentiveAssignmentSchema.index({ campaignId: 1, deliveryId: 1 }, { unique: true });

export default mongoose.model("IncentiveAssignment", incentiveAssignmentSchema);
