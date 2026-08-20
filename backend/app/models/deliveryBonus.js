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
            default: "Wallet Credit",
        },
        paymentReference: {
            type: String,
            trim: true,
            // No longer required — the bonus is credited directly to the rider's
            // in-app wallet (see the linked Transaction), not paid manually outside
            // the app, so there's no external payment reference to record.
        },
        transactionRef: {
            type: String,
            trim: true, // reference of the linked Transaction (type: "Bonus") that
                        // actually credits the rider's withdrawable balance
        },
        status: {
            type: String,
            enum: ["paid"],
            default: "paid",
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("DeliveryBonus", deliveryBonusSchema);
