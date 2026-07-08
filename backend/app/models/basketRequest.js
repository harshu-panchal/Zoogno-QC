import mongoose from "mongoose";

const basketRequestSchema = new mongoose.Schema(
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
      enum: ["SMALL", "MEDIUM", "LARGE"],
      default: "MEDIUM",
    },
    status: {
      type: String,
      enum: ["pending", "approved_payment_pending", "payment_completed", "dispatched", "delivered", "rejected", "fulfilled"],
      default: "pending",
      index: true,
    },
    approvedQuantity: {
      type: Number,
    },
    totalAmount: {
      type: Number,
      default: 0,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "pending",
    },
    paymentId: String,
    trackingDetails: String,
    dispatchedAt: Date,
    requestNotes: String,
    adminNotes: String,
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("BasketRequest", basketRequestSchema);
