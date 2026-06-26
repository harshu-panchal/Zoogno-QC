import mongoose from "mongoose";

const qrPaperBagRequestSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    size: {
      type: String,
      default: "medium",
    },
    priority: {
      type: String,
      default: "MEDIUM",
    },
    status: {
      type: String,
      enum: ["pending_approval", "approved_payment_pending", "payment_completed", "dispatched", "delivered", "rejected"],
      default: "pending_approval",
      index: true,
    },
    approvedQuantity: {
      type: Number,
    },
    requestNotes: String,
    adminNotes: String,
    totalAmount: {
      type: Number,
      default: 0,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
    paymentId: {
      type: String, // Can store PhonePe transaction ID
    },
    trackingDetails: String,
    dispatchedAt: Date,
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("QRPaperBagRequest", qrPaperBagRequestSchema);
