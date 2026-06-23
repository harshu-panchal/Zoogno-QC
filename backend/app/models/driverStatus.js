import mongoose from "mongoose";

const driverStatusSchema = new mongoose.Schema(
    {
        deliveryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Delivery",
            required: true,
            unique: true,
        },
        isOnline: {
            type: Boolean,
            default: false,
        },
        activeSlotId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "DriverSlot",
            default: null,
        },
        currentSlotStart: {
            type: String,
            default: null,
        },
        currentSlotEnd: {
            type: String,
            default: null,
        },
    },
    { timestamps: true }
);

export default mongoose.model("DriverStatus", driverStatusSchema);
