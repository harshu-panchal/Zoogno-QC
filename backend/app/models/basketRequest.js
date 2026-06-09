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
      enum: ["pending", "approved", "rejected", "fulfilled"],
      default: "pending",
      index: true,
    },
    approvedQuantity: {
      type: Number,
    },
    requestNotes: String,
    adminNotes: String,
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("BasketRequest", basketRequestSchema);
