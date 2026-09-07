import mongoose from "mongoose";

const filtersSchema = new mongoose.Schema(
  {
    zoneIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Zone" }],
    verifiedOnly: { type: Boolean, default: true },
    minRating: { type: Number, min: 0, max: 5, default: null },
    maxRating: { type: Number, min: 0, max: 5, default: null },
    minLifetimeOrders: { type: Number, min: 0, default: null },
    joiningFrom: { type: Date, default: null },
    joiningTo: { type: Date, default: null },
    currentlyOnline: { type: Boolean, default: null },
  },
  { _id: false },
);

const conditionsSchema = new mongoose.Schema(
  {
    countOnlyDelivered: { type: Boolean, default: true },
    requireVerifiedAtPayout: { type: Boolean, default: true },
    excludeReturns: { type: Boolean, default: false },
  },
  { _id: false },
);

const incentiveCampaignSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 500, default: "" },
    amount: { type: Number, required: true, min: 0.01 },
    targetOrders: { type: Number, required: true, min: 1 },
    periodType: {
      type: String,
      enum: ["daily", "weekly", "monthly", "custom"],
      required: true,
    },
    repeatEveryPeriod: { type: Boolean, default: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    weekStartsOn: {
      type: String,
      enum: ["monday"],
      default: "monday",
    },
    status: {
      type: String,
      enum: ["draft", "active", "paused", "ended"],
      default: "draft",
      index: true,
    },
    audienceType: {
      type: String,
      enum: ["all", "filtered", "specific"],
      required: true,
      default: "all",
    },
    filters: { type: filtersSchema, default: () => ({}) },
    conditions: { type: conditionsSchema, default: () => ({}) },
    budgetCap: { type: Number, min: 0, default: null },
    spentAmount: { type: Number, min: 0, default: 0 },
    maxPayoutsPerRider: { type: Number, min: 1, default: null },
    rulesVersion: { type: Number, default: 1 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  { timestamps: true },
);

incentiveCampaignSchema.index({ status: 1, startAt: 1, endAt: 1 });
incentiveCampaignSchema.index({ status: 1, audienceType: 1 });

export default mongoose.model("IncentiveCampaign", incentiveCampaignSchema);
