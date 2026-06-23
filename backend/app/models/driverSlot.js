import mongoose from "mongoose";

const driverSlotSchema = new mongoose.Schema(
    {
        deliveryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Delivery",
            required: true,
            index: true,
        },
        slotId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SlotMaster",
            required: true,
        },
        date: {
            type: String, // format: YYYY-MM-DD
            required: true,
        },
        slotStartTime: {
            type: Date,
            required: true,
            index: true,
        },
        slotEndTime: {
            type: Date,
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: ["UPCOMING", "ACTIVE", "COMPLETED", "CANCELLED"],
            default: "UPCOMING",
            index: true,
        },
    },
    { timestamps: true }
);

export default mongoose.model("DriverSlot", driverSlotSchema);
