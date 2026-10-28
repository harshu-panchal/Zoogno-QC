import mongoose from "mongoose";

const offerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    code: {
      type: String,
      trim: true,
    },
    style: {
      type: String,
      enum: ["blue", "green", "orange"],
      default: "blue",
    },
    icon: {
      type: String,
      enum: ["sparkles", "clock", "tag"],
      default: "sparkles",
    },
    appliesOnOrderNumber: {
      type: Number,
      min: 1,
      default: 1,
    },
    order: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    productIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    ],
    categoryIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    ],
    validFrom: {
      type: Date,
    },
    validTo: {
      type: Date,
    },
    // Zones this offer is visible to. Empty/absent = All Zones (also the
    // implicit value for every offer created before this field existed).
    zoneIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Zone" }],
  },
  {
    timestamps: true,
  },
);

offerSchema.index({ status: 1, order: 1, createdAt: 1 });
offerSchema.index({ zoneIds: 1 });

export default mongoose.model("Offer", offerSchema);

