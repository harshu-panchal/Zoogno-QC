import mongoose from "mongoose";

const timelineSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ["generated", "assigned", "packed", "in_transit", "delivered", "disabled", "lost", "reprinted"],
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

const qrPaperBagSchema = new mongoose.Schema(
  {
    bagId: {
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
    size: {
      type: String,
      default: "medium",
    },
    status: {
      type: String,
      enum: ["generated", "assigned", "packed", "in_transit", "delivered", "disabled", "lost"],
      default: "generated",
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

// Indexes for fast lookup
qrPaperBagSchema.index({ status: 1, assignedSellerId: 1 });
qrPaperBagSchema.index({ currentOrderId: 1 });

export default mongoose.model("QRPaperBag", qrPaperBagSchema);
