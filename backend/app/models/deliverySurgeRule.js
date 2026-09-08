import mongoose from "mongoose";

const timeWindowSchema = new mongoose.Schema(
  {
    // 0 = Sunday … 6 = Saturday (Asia/Kolkata local)
    daysOfWeek: {
      type: [Number],
      default: [],
      validate: {
        validator(v) {
          return Array.isArray(v) && v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
        },
        message: "daysOfWeek must be integers 0–6",
      },
    },
    // "HH:mm" 24h in Asia/Kolkata
    startTime: { type: String, trim: true, default: "00:00" },
    endTime: { type: String, trim: true, default: "23:59" },
  },
  { _id: false },
);

const deliverySurgeRuleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 500, default: "" },
    amount: { type: Number, required: true, min: 0.01 },
    zoneIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Zone" }],
      validate: {
        validator(v) {
          return Array.isArray(v) && v.length > 0;
        },
        message: "At least one zone is required",
      },
    },
    status: {
      type: String,
      enum: ["draft", "active", "paused", "ended"],
      default: "draft",
      index: true,
    },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
    timeWindows: { type: [timeWindowSchema], default: [] },
    priority: { type: Number, default: 0 },
    timesApplied: { type: Number, default: 0, min: 0 },
    totalPaid: { type: Number, default: 0, min: 0 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  { timestamps: true },
);

deliverySurgeRuleSchema.index({ status: 1, zoneIds: 1 });
deliverySurgeRuleSchema.index({ status: 1, startAt: 1, endAt: 1 });
deliverySurgeRuleSchema.index({ status: 1, priority: -1 });

export default mongoose.model("DeliverySurgeRule", deliverySurgeRuleSchema);
