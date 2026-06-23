import mongoose from "mongoose";

const slotMasterSchema = new mongoose.Schema(
    {
        startTime: {
            type: String,
            required: true,
            trim: true,
        },
        endTime: {
            type: String,
            required: true,
            trim: true,
        },
        duration: {
            type: Number,
            required: true,
            default: 120, // in minutes
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        maxSlotsPerDay: {
            type: Number,
            default: 0, // 0 means no limit defined here
        }
    },
    { timestamps: true }
);

export default mongoose.model("SlotMaster", slotMasterSchema);
