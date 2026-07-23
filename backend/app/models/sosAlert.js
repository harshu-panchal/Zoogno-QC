import mongoose from "mongoose";

const sosAlertSchema = new mongoose.Schema(
    {
        deliveryBoy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Delivery",
            required: true,
            index: true
        },
        location: {
            type: {
                type: String,
                enum: ["Point"],
                default: "Point",
            },
            coordinates: {
                type: [Number],
                default: [0, 0],
            },
        },
        status: {
            type: String,
            enum: ["active", "resolved"],
            default: "active",
            index: true
        },
        resolvedAt: {
            type: Date
        },
        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin"
        }
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

sosAlertSchema.index({ location: "2dsphere" });

export default mongoose.models.SosAlert || mongoose.model("SosAlert", sosAlertSchema);
