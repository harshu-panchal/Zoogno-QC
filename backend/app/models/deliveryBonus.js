import mongoose from "mongoose";

const deliveryBonusSchema = new mongoose.Schema(
    {
        deliveryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Delivery",
            required: true,
        },
        adminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            required: true,
        },
        amount: {
            type: Number,
            required: true,
        },
        reason: {
            type: String,
            required: true,
            trim: true,
            default: "Bonus", // e.g. Incentive, Performance Bonus
        },
        paymentMethod: {
            type: String,
            trim: true,
            default: "UPI",
        },
        paymentReference: {
            type: String,
            trim: true,
            required: true, // Since it's paid manually
        },
        status: {
            type: String,
            enum: ["paid"],
            default: "paid", // Since it's recorded after manual payment
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("DeliveryBonus", deliveryBonusSchema);
