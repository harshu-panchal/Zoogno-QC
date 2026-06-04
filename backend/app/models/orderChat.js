import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
    },
    senderType: {
        type: String,
        enum: ["Customer", "Delivery"],
        required: true,
    },
    text: {
        type: String,
        default: "",
    },
    mediaUrl: {
        type: String,
        default: "",
    },
    mediaType: {
        type: String,
        enum: ["", "image"],
        default: "",
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

const orderChatSchema = new mongoose.Schema(
    {
        orderId: {
            type: String,
            required: true,
            index: true,
            unique: true,
        },
        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        deliveryBoy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Delivery",
            required: true,
        },
        messages: [messageSchema],
    },
    { timestamps: true }
);

export default mongoose.model("OrderChat", orderChatSchema);
