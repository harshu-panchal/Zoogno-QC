import mongoose from "mongoose";

const codQrPaymentSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    publicOrderId: {
      type: String,
      required: true,
      index: true,
    },
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
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "expired"],
      default: "pending",
      index: true,
    },
    qrPayload: {
      type: String,
      default: null,
    },
    // Image URL of the gateway-hosted QR (Razorpay QR Codes API).
    qrImageUrl: {
      type: String,
      default: null,
    },
    // Gateway QR code id (Razorpay `qr_...`), used to poll for payments.
    gatewayQrId: {
      type: String,
      default: null,
      index: true,
    },
    gatewayPaymentId: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

export default mongoose.model("CodQrPayment", codQrPaymentSchema);
