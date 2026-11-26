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
    offerText: { type: String, trim: true, maxlength: 60, default: "" },
    tagline: { type: String, trim: true, maxlength: 30, default: "Near & Fast" },
    // Seller switch.
    isEnabled: { type: Boolean, default: true },
    // Admin switch (moderation). "hidden" removes it from the customer UI.
    adminStatus: { type: String, enum: ["active", "hidden"], default: "active" },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
  },
  { timestamps: true },
);

bestOfferListingSchema.index({ isEnabled: 1, adminStatus: 1 });

export default mongoose.model("BestOfferListing", bestOfferListingSchema);
