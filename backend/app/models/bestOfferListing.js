import mongoose from "mongoose";

/**
 * "Top Restaurants with Best Offers" card, one per seller. Owned by the seller
 * (image + offer text); the admin can hide it and orders cards per zone via
 * BestOfferZoneOrder. Independent of the "Shop by Store" flow.
 */
const bestOfferListingSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
      unique: true,
    },
    image: { type: String, trim: true, default: "" },
    // Auto-generated from structured fields (e.g. "50% OFF up to ₹100")
    offerText: { type: String, trim: true, maxlength: 60, default: "" },
    tagline: { type: String, trim: true, maxlength: 30, default: "Near & Fast" },

    // Structured discount definition
    discountType: {
      type: String,
      enum: ["percentage", "flat"],
      default: "percentage",
    },
    discountValue: { type: Number, default: 0, min: 0 },
    maxDiscount: { type: Number, default: null, min: 0 },
    minOrderValue: { type: Number, default: 0, min: 0 },

    // Funding split (must add up to 100)
    funding: {
      sellerPct: { type: Number, default: 100, min: 0, max: 100 },
      platformPct: { type: Number, default: 0, min: 0, max: 100 },
    },

    // Platform budget tracking (for platformPct > 0)
    budget: {
      platformDailyCap: { type: Number, default: null, min: 0 },
      platformTotalCap: { type: Number, default: null, min: 0 },
      platformSpent: { type: Number, default: 0, min: 0 },
      platformDailySpent: { type: Number, default: 0, min: 0 },
      platformDailyDate: { type: String, default: null },
    },

    // Eligibility rules
    perUserLimit: { type: Number, default: null, min: 0 },
    newUsersOnly: { type: Boolean, default: false },

    // Seller switch.
    isEnabled: { type: Boolean, default: true },
    exhaustedReason: { type: String, default: null },
    // Admin switch (moderation). "hidden" removes it from the customer UI.
    adminStatus: { type: String, enum: ["active", "hidden"], default: "active" },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
  },
  { timestamps: true },
);

bestOfferListingSchema.index({ isEnabled: 1, adminStatus: 1 });

export default mongoose.model("BestOfferListing", bestOfferListingSchema);
