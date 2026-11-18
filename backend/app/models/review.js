import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true,
        },
        order: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
            default: null,
            index: true,
        },
        orderId: { type: String, trim: true, default: "" },
        orderItemId: { type: mongoose.Schema.Types.ObjectId, default: null },
        sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", default: null },
        productSnapshot: {
            name: { type: String, trim: true, default: "" },
            image: { type: String, trim: true, default: "" },
            variantName: { type: String, trim: true, default: "" },
            variantSlot: { type: String, trim: true, default: "" },
        },
        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5,
        },
        comment: {
            type: String,
            default: "",
            trim: true,
        },
        images: { type: [String], default: [] },
        verifiedPurchase: { type: Boolean, default: false, index: true },
        purchasedAt: { type: Date, default: null },
        deliveredAt: { type: Date, default: null },
        status: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending",
        },
        moderationNote: { type: String, trim: true, default: "" },
        moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
        moderatedAt: { type: Date, default: null },
        editedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

// Prevent multiple reviews from same user for same product
reviewSchema.index({ userId: 1, productId: 1 }, { unique: true });

// Supports the public product-reviews read path (filter by productId+status, sort by createdAt)
reviewSchema.index({ productId: 1, status: 1, createdAt: -1 });
reviewSchema.index({ sellerId: 1, status: 1, createdAt: -1 });
reviewSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("Review", reviewSchema);
