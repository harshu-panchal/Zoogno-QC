import mongoose from "mongoose";

const offerSectionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    backgroundColor: {
      type: String,
      trim: true,
      default: "#FCD34D",
    },
    sideImageKey: {
      type: String,
      enum: [
        "hair-care",
        "grocery",
        "electronics",
        "beauty",
        "kitchen",
        "fashion",
      ],
      default: "hair-care",
    },
    categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category" }, // legacy single category
    sellerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Seller" }],
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
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
    // Zones this section is visible to. Empty/absent = All Zones (also the
    // implicit value for every record created before this field existed).
    zoneIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Zone" }],
  },
  { timestamps: true }
);

offerSectionSchema.index({ status: 1, order: 1, createdAt: 1 });
offerSectionSchema.index({ zoneIds: 1 });

export default mongoose.model("OfferSection", offerSectionSchema);
