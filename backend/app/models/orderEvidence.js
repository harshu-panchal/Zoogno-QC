import mongoose from "mongoose";

/**
 * Photo proof of a product's condition at one stage of an order's journey.
 * One document per (order, stage); later uploads append to `images`. Evidence is
 * append-only on purpose — it is the audit trail admins use to decide
 * responsibility before applying a penalty, so uploads are never deleted.
 *
 *   SELLER_DISPATCH -> seller packing the order (condition before it leaves the seller)
 *   RIDER_PICKUP    -> delivery partner receiving/scanning the order at the store
 */
export const EVIDENCE_STAGE = Object.freeze({
  SELLER_DISPATCH: "SELLER_DISPATCH",
  RIDER_PICKUP: "RIDER_PICKUP",
});

export const EVIDENCE_CONDITION = Object.freeze({
  GOOD: "GOOD",
  MINOR_ISSUE: "MINOR_ISSUE",
  DAMAGED: "DAMAGED",
});

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    productName: { type: String, trim: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const orderEvidenceSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    orderId: { type: String, required: true, index: true },
    stage: { type: String, enum: Object.values(EVIDENCE_STAGE), required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    uploadedByModel: { type: String, enum: ["Seller", "Delivery"], required: true },
    uploadedByName: { type: String, default: "" },
    images: { type: [imageSchema], default: [] },
    condition: {
      type: String,
      enum: Object.values(EVIDENCE_CONDITION),
      default: EVIDENCE_CONDITION.GOOD,
    },
    note: { type: String, default: "", trim: true, maxlength: 500 },
    firstUploadedAt: { type: Date, default: Date.now },
    lastUploadedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

orderEvidenceSchema.index({ order: 1, stage: 1 }, { unique: true });

export default mongoose.models.OrderEvidence ||
  mongoose.model("OrderEvidence", orderEvidenceSchema);
