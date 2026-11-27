import mongoose from "mongoose";

/** Admin-defined display order of seller cards for one zone. */
const bestOfferZoneOrderSchema = new mongoose.Schema(
  {
    zoneId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Zone",
      required: true,
      unique: true,
    },
    sellerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Seller" }],
  },
  { timestamps: true },
);

export default mongoose.model("BestOfferZoneOrder", bestOfferZoneOrderSchema);
