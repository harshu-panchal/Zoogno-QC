import mongoose from "mongoose";

const codRemittanceRequestSchema = new mongoose.Schema(
  {
    deliveryBoy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
      required: true,
      index: true,
    },
    merchantOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    orders: [
      {
        type: String, // orderIds being settled
      },
    ],
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
    gatewayPaymentId: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model("CodRemittanceRequest", codRemittanceRequestSchema);
