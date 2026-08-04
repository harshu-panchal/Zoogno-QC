import mongoose from "mongoose";

const heroBannerItemSchema = new mongoose.Schema(
  {
    imageUrl: { type: String, required: true },
    title: { type: String, trim: true },
    subtitle: { type: String, trim: true },
    linkType: {
      type: String,
      enum: ["none", "header", "category", "subcategory", "product", "url"],
      default: "none",
    },
    linkValue: { type: String, trim: true },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { _id: false }
);

const dynamicEventCategorySchema = new mongoose.Schema(
  {
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    customLabel: { type: String, trim: true, default: "" },
    discountText: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const dynamicConfigSchema = new mongoose.Schema(
  {
    centerImage: { type: String, default: null },
    effectType: {
      type: String,
      enum: ["none", "snow", "stars", "lightning", "confetti", "hearts", "bubbles"],
      default: "stars",
    },
    eventCategories: [dynamicEventCategorySchema],
  },
  { _id: false }
);

const heroConfigSchema = new mongoose.Schema(
  {
    pageType: {
      type: String,
      enum: ["home", "header"],
      required: true,
    },
    headerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    banners: {
      items: [heroBannerItemSchema],
      default: [],
    },
    mediaType: {
      type: String,
      enum: ["image", "video", "dynamic"],
      default: "image",
    },
    videoUrl: {
      type: String,
      default: null,
    },
    fallbackImageUrl: {
      type: String,
      default: null,
    },
    categoryIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    ],
    dynamicConfig: {
      type: dynamicConfigSchema,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

heroConfigSchema.index({ pageType: 1, headerId: 1 }, { unique: true });

export default mongoose.model("HeroConfig", heroConfigSchema);
