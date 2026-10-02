import mongoose from "mongoose";

const ticketSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        userType: {
            type: String,
            enum: ["Customer", "Seller", "Rider"],
            required: true,
        },
        subject: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            required: true,
        },
        // Optional order link: lets admin investigate a customer's issue against the order
        // (seller/rider photo evidence, timeline) before deciding on any penalty.
        orderId: {
            type: String,
            default: "",
            trim: true,
            index: true,
        },
        issueType: {
            type: String,
            enum: [
                "",
                "PRODUCT_DAMAGED",
                "CONDITION_MISMATCH",
                "DAMAGED_IN_DELIVERY",
                "WRONG_PRODUCT",
                "MISSING_PRODUCT",
                "SELLER_ISSUE",
                "DELIVERY_ISSUE",
                "OTHER",
            ],
            default: "",
        },
        attachments: {
            type: [String],
            default: [],
        },
        priority: {
            type: String,
            enum: ["low", "medium", "high"],
            default: "medium",
        },
        status: {
            type: String,
            enum: ["open", "processing", "closed"],
            default: "open",
        },
        messages: [
            {
                sender: {
                    type: String,
                    required: true,
                },
                senderId: {
                    type: mongoose.Schema.Types.ObjectId,
                    refPath: 'messages.senderType',
                },
                senderType: {
                    type: String,
                    enum: ["User", "Admin"],
                    required: true,
                },
                text: {
                    type: String,
                    default: "",
                    required: function requiredText() {
                        return !this.mediaUrl;
                    },
                },
                mediaUrl: {
                    type: String,
                    default: "",
                    trim: true,
                },
                mediaType: {
                    type: String,
                    enum: ["", "image"],
                    default: "",
                    trim: true,
                },
                mimeType: {
                    type: String,
                    default: "",
                    trim: true,
                },
                createdAt: {
                    type: Date,
                    default: Date.now,
                },
                isAdmin: {
                    type: Boolean,
                    default: false,
                }
            },
        ],
    },
    { timestamps: true }
);

ticketSchema.index({ userId: 1, userType: 1, createdAt: -1 });
ticketSchema.index({ status: 1, priority: 1 });

export default mongoose.model("Ticket", ticketSchema);
