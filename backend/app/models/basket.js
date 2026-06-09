import mongoose from "mongoose";

const timelineSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: [
      "AVAILABLE", "ASSIGNED", "IN_USE", "PACKED",
      "PICKED_UP", "IN_TRANSIT", "DELIVERED", "RETURNED",
      "LOST", "DAMAGED", "DISABLED",
    ],
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: "timeline.actorModel",
  },
  actorModel: {
    type: String,
    enum: ["Admin", "Seller", "DeliveryBoy", "Customer"],
  },
  notes: String,
});

const basketSchema = new mongoose.Schema(
  {
    basketId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    qrCodeData: {
      type: String,
      required: true,
      unique: true,
    },
    qrCodeImage: {
      type: String, // base64 data-URI PNG
    },
    size: {
      type: String,
      enum: ["SMALL", "MEDIUM", "LARGE"],
      default: "LARGE",
    },
    status: {
      type: String,
      enum: [
        "AVAILABLE", "ASSIGNED", "IN_USE", "PACKED",
        "PICKED_UP", "IN_TRANSIT", "DELIVERED", "RETURNED",
        "LOST", "DAMAGED", "DISABLED",
      ],
      default: "AVAILABLE",
      index: true,
    },
    assignedSellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      index: true,
    },
    currentOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      index: true,
    },
    assignedAt: Date,
    usedAt: Date,
    timeline: [timelineSchema],
    notes: String,
  },
  {
    timestamps: true,
  }
);

// Compound index for fast lookups
basketSchema.index({ status: 1, assignedSellerId: 1 });

export default mongoose.model("Basket", basketSchema);
