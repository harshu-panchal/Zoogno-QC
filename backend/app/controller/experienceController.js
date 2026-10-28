import ExperienceSection from "../models/experienceSection.js";
import HeroConfig from "../models/heroConfig.js";
import Category from "../models/category.js";
import Product from "../models/product.js";
import handleResponse from "../utils/helper.js";
import mongoose from "mongoose";
import { buildKey, getOrSet, getTTL, invalidate } from "../services/cacheService.js";
import { uploadToCloudinary } from "../services/mediaService.js";
import { parseCustomerCoordinates, getCustomerZoneIds } from "../services/customerVisibilityService.js";
import { zoneVisibilityMatch, normalizeZoneIds, isVisibleInZones } from "../utils/zoneVisibility.js";

/* ===============================
   Helpers
================================ */
const validateBasePayload = async (body) => {
  const {
    pageType,
    headerId,
    displayType,
    title,
    order,
    status,
    config = {},
    zoneIds,
  } = body;

  if (!["home", "header"].includes(pageType)) {
    throw new Error("Invalid pageType");
  }

  if (!["banners", "categories", "subcategories", "products"].includes(displayType)) {
    throw new Error("Invalid displayType");
  }

  if (pageType === "header") {
    if (!headerId) {
      throw new Error("headerId is required for header pageType");
    }
    const header = await Category.findOne({ _id: headerId, type: "header" });
    if (!header) {
      throw new Error("Invalid headerId");
    }
  }

  if (["categories", "subcategories", "products"].includes(displayType)) {
    if (!title || !title.trim()) {
      throw new Error("Title is required for this displayType");
    }
  }

  if (order !== undefined && Number.isNaN(Number(order))) {
    throw new Error("order must be a number");
  }

  if (status && !["active", "inactive"].includes(status)) {
    throw new Error("Invalid status");
  }

  return {
    pageType,
    headerId: headerId || null,
    displayType,
    title: title?.trim() || "",
    order: order ?? 0,
    status: status || "active",
    config,
    zoneIds: normalizeZoneIds(zoneIds),
  };
};

const normalizeUrl = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized || !/^https?:\/\//i.test(normalized)) {
    return "";
  }
  return normalized;
};

const validateAndNormalizeConfig = async (displayType, config = {}) => {
  const normalized = {};

  if (displayType === "banners") {
    const items = Array.isArray(config.items) ? config.items : [];
    normalized.banners = {
      items: items
        .filter((b) => b && b.imageUrl)
        .map((b) => ({
          imageUrl: b.imageUrl,
          title: b.title,
          subtitle: b.subtitle,
          linkType: b.linkType || "none",
          linkValue: b.linkValue || "",
          status: b.status || "active",
        })),
    };
    return normalized;
  }

  if (displayType === "categories") {
    const maxItems = Number(config.maxItems) || undefined;
    const rows = Number(config.rows) || 1;
    const categoryIds = Array.isArray(config.categoryIds)
      ? config.categoryIds.filter(Boolean)
      : [];

    if (!categoryIds.length) {
      throw new Error("At least one categoryId is required");
    }

    const categories = await Category.find({
      _id: { $in: categoryIds },
      type: "category",
    }).select("_id");

    if (!categories.length) {
      throw new Error("Provided categoryIds are invalid");
    }

    normalized.categories = {
      maxItems,
      categoryIds: categories.map((c) => c._id),
      rows: rows < 1 ? 1 : rows,
    };
    return normalized;
  }

  if (displayType === "subcategories") {
    const rows = Number(config.rows) || 1;
    const categoryIds = Array.isArray(config.categoryIds)
      ? config.categoryIds.filter(Boolean)
      : [];
    const subcategoryIds = Array.isArray(config.subcategoryIds)
      ? config.subcategoryIds.filter(Boolean)
      : [];

    if (!categoryIds.length || !subcategoryIds.length) {
      throw new Error("categoryIds and subcategoryIds are required");
    }

    const categories = await Category.find({
      _id: { $in: categoryIds },
      type: "category",
    }).select("_id");
    const subcategories = await Category.find({
      _id: { $in: subcategoryIds },
      type: "subcategory",
    }).select("_id");

    if (!categories.length || !subcategories.length) {
      throw new Error("Provided categoryIds or subcategoryIds are invalid");
    }

    normalized.subcategories = {
      categoryIds: categories.map((c) => c._id),
      subcategoryIds: subcategories.map((s) => s._id),
      rows: rows < 1 ? 1 : rows,
    };
    return normalized;
  }

  if (displayType === "products") {
    const rows = Number(config.rows) || 1;
    const columns = Number(config.columns) || 2;
    const singleRowScrollable = Boolean(config.singleRowScrollable);

    const categoryIds = Array.isArray(config.categoryIds)
      ? config.categoryIds.filter(Boolean)
      : [];
    const subcategoryIds = Array.isArray(config.subcategoryIds)
      ? config.subcategoryIds.filter(Boolean)
      : [];
    const productIds = Array.isArray(config.productIds)
      ? config.productIds.filter(Boolean)
      : [];

    const normalizedRows = singleRowScrollable ? 1 : rows < 1 ? 1 : rows;
    const normalizedColumns = columns < 1 ? 1 : columns;

    const categories = categoryIds.length
      ? await Category.find({ _id: { $in: categoryIds }, type: "category" }).select("_id")
      : [];
    const subcategories = subcategoryIds.length
      ? await Category.find({
          _id: { $in: subcategoryIds },
          type: "subcategory",
        }).select("_id")
      : [];
    const products = productIds.length
      ? await Product.find({ _id: { $in: productIds } }).select("_id")
      : [];

    normalized.products = {
      categoryIds: categories.map((c) => c._id),
      subcategoryIds: subcategories.map((s) => s._id),
      productIds: products.map((p) => p._id),
      rows: normalizedRows,
      columns: normalizedColumns,
      singleRowScrollable,
    };
    return normalized;
  }

  return normalized;
};

/* ===============================
   ADMIN: List sections
================================ */
export const getAdminExperienceSections = async (req, res) => {
  try {
    const { pageType, headerId } = req.query;
    const query = {};

    if (pageType) query.pageType = pageType;
    if (headerId) query.headerId = headerId;

    const sections = await ExperienceSection.find(query)
      .sort({ order: 1, createdAt: 1 })
      .lean();

    return handleResponse(res, 200, "Experience sections fetched", sections);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   ADMIN: Create section
================================ */
export const createExperienceSection = async (req, res) => {
  try {
    const base = await validateBasePayload(req.body);
    const config = await validateAndNormalizeConfig(base.displayType, base.config);

    const count = await ExperienceSection.countDocuments({
      pageType: base.pageType,
      headerId: base.headerId,
    });

    const section = await ExperienceSection.create({
      ...base,
      order: base.order ?? count,
      config,
    });
    await invalidate("cache:experience:public:*");

    return handleResponse(res, 201, "Experience section created", section);
  } catch (error) {
    return handleResponse(res, 400, error.message);
  }
};

/* ===============================
   ADMIN: Update section
================================ */
export const updateExperienceSection = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await ExperienceSection.findById(id);
    if (!existing) {
      return handleResponse(res, 404, "Section not found");
    }

    const merged = {
      ...existing.toObject(),
      ...req.body,
      config: { ...(existing.config || {}), ...(req.body.config || {}) },
    };

    const base = await validateBasePayload(merged);
    const config = await validateAndNormalizeConfig(base.displayType, base.config);

    existing.pageType = base.pageType;
    existing.headerId = base.headerId;
    existing.displayType = base.displayType;
    existing.title = base.title;
    existing.order = base.order;
    existing.status = base.status;
    existing.config = config;
    existing.zoneIds = base.zoneIds;

    await existing.save();
    await invalidate("cache:experience:public:*");

    return handleResponse(res, 200, "Experience section updated", existing);
  } catch (error) {
    return handleResponse(res, 400, error.message);
  }
};

/* ===============================
   ADMIN: Delete section
================================ */
export const deleteExperienceSection = async (req, res) => {
  try {
    const { id } = req.params;
    const section = await ExperienceSection.findByIdAndDelete(id);

    if (!section) {
      return handleResponse(res, 404, "Section not found");
    }
    await invalidate("cache:experience:public:*");

    return handleResponse(res, 200, "Experience section deleted");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   ADMIN: Reorder sections
================================ */
export const reorderExperienceSections = async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || !items.length) {
      // Nothing to reorder – treat as success to avoid noisy errors
      return handleResponse(res, 200, "No sections to reorder");
    }

    const bulkOps = items
      .filter(
        (it) => it && it.id && mongoose.Types.ObjectId.isValid(it.id)
      )
      .map((it) => ({
        updateOne: {
          filter: { _id: it.id },
          update: { $set: { order: it.order } },
        },
      }));

    if (!bulkOps.length) {
      // If all items were empty / malformed, avoid throwing and just ack
      return handleResponse(res, 200, "No valid sections to reorder");
    }

    await ExperienceSection.bulkWrite(bulkOps);
    await invalidate("cache:experience:public:*");

    return handleResponse(res, 200, "Sections reordered");
  } catch (error) {
    console.error("Error while reordering experience sections:", error);
    // Fail gracefully so the admin UI doesn't break on partial reorder issues
    return handleResponse(res, 200, "Sections reordered (best-effort)");
  }
};

/* ===============================
   PUBLIC: Get sections for page
================================ */
export const getPublicExperienceSections = async (req, res) => {
  try {
    const { pageType, headerId, lat, lng } = req.query;

    if (!pageType) {
      return handleResponse(res, 400, "pageType is required");
    }

    const query = { pageType, status: "active" };
    if (pageType === "header") {
      if (!headerId) {
        return handleResponse(res, 400, "headerId is required for header pageType");
      }
      query.headerId = headerId;
    }

    // Zone-scope the results when we know where the customer is. If location
    // isn't available, fall back to the pre-zone behavior (show everything)
    // rather than hiding content for callers that haven't sent lat/lng yet.
    const coords = parseCustomerCoordinates({ lat, lng });
    let zoneCacheBucket = "unscoped";
    if (coords.valid) {
      const customerZoneIds = await getCustomerZoneIds(coords.lat, coords.lng);
      Object.assign(query, zoneVisibilityMatch(customerZoneIds));
      zoneCacheBucket = customerZoneIds.length ? customerZoneIds.slice().sort().join(",") : "none";
    }

    const cacheKey = buildKey(
      "experience",
      "public",
      `${pageType}:${headerId || "root"}:${zoneCacheBucket}`,
    );
    const sections = await getOrSet(
      cacheKey,
      async () =>
        ExperienceSection.find(query)
          .sort({ order: 1, createdAt: 1, _id: 1 })
          .lean(),
      getTTL("homepage"),
    );

    return handleResponse(res, 200, "Experience sections fetched", sections);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   ADMIN: Upload banner image
================================ */
export const uploadBannerImage = async (req, res) => {
  try {
    if (req.file) {
      const isVideo = req.file.mimetype.startsWith("video/");
      const MAX_VIDEO_SIZE = 5 * 1024 * 1024; // 5MB

      if (isVideo && req.file.size > MAX_VIDEO_SIZE) {
        return handleResponse(res, 400, "Video file size must be less than 5MB");
      }

      const uploadedUrl = await uploadToCloudinary(req.file.buffer, "banners", {
        mimeType: req.file.mimetype,
        resourceType: isVideo ? "video" : "image",
      });
      await invalidate("cache:experience:public:*");
      return handleResponse(res, 200, "Banner media uploaded", { url: uploadedUrl });
    }

    const url = normalizeUrl(req.body?.url || req.body?.imageUrl);
    if (!url) {
      return handleResponse(res, 400, "A valid media URL is required");
    }
    await invalidate("cache:experience:public:*");
    return handleResponse(res, 200, "Banner media uploaded", { url });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   HERO CONFIG (separate from experience sections)
   Public: get hero config for a page (with fallback to home)
   Admin: get one / list, upsert
   Multiple HeroConfig docs can now exist per {pageType, headerId}, each
   scoped to a distinct zoneIds set ("variant"). Empty zoneIds = the
   default "All Zones" variant.
================================ */

/** Exact-set match: a doc's zoneIds array must contain exactly these ids (order-independent). */
function exactZoneSetFilter(zoneIds) {
  const ids = Array.isArray(zoneIds) ? zoneIds : [];
  if (!ids.length) return { zoneIds: { $size: 0 } };
  return { zoneIds: { $size: ids.length, $all: ids } };
}

/** Of the variants visible to a customer, prefer the most specific (non-empty, smallest zoneIds) one. */
function pickBestHeroVariant(variants, customerZoneIds) {
  const visible = (variants || []).filter(
    (doc) => !customerZoneIds || isVisibleInZones(doc, customerZoneIds),
  );
  if (!visible.length) return null;
  return visible.sort((a, b) => {
    const aLen = a.zoneIds?.length || 0;
    const bLen = b.zoneIds?.length || 0;
    if (aLen === 0 && bLen === 0) return new Date(b.updatedAt) - new Date(a.updatedAt);
    if (aLen === 0) return 1;
    if (bLen === 0) return -1;
    if (aLen !== bLen) return aLen - bLen;
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  })[0];
}

export const getPublicHeroConfig = async (req, res) => {
  try {
    const { pageType, headerId, lat, lng } = req.query;

    if (!pageType) {
      return handleResponse(res, 400, "pageType is required");
    }

    if (pageType === "header" && !headerId) {
      return handleResponse(res, 400, "headerId is required for header pageType");
    }

    // Resolve the customer's zone(s) when location is available, same
    // fail-open rule as getPublicExperienceSections: no location -> show
    // whatever's configured rather than hiding it.
    const coords = parseCustomerCoordinates({ lat, lng });
    const customerZoneIds = coords.valid ? await getCustomerZoneIds(coords.lat, coords.lng) : null;
    const zoneCacheBucket = customerZoneIds
      ? (customerZoneIds.length ? customerZoneIds.slice().sort().join(",") : "none")
      : "unscoped";

    const cacheKey = buildKey(
      "experience",
      "hero",
      `${pageType}:${headerId || "root"}:${zoneCacheBucket}`,
    );
    const config = await getOrSet(
      cacheKey,
      async () => {
        let resolved = null;
        if (pageType === "header") {
          const variants = await HeroConfig.find({
            pageType: "header",
            headerId,
          }).populate("dynamicConfig.eventCategories.categoryId", "name image slug").lean();
          resolved = pickBestHeroVariant(variants, customerZoneIds);
        }
        if (!resolved && (pageType === "home" || pageType === "header")) {
          const variants = await HeroConfig.find({
            pageType: "home",
            headerId: null,
          }).populate("dynamicConfig.eventCategories.categoryId", "name image slug").lean();
          resolved = pickBestHeroVariant(variants, customerZoneIds);
        }
        return resolved || null;
      },
      getTTL("homepage"),
    );

    const payload = config
      ? {
          banners: config.banners || { items: [] },
          categoryIds: config.categoryIds || [],
          mediaType: config.mediaType || "image",
          videoUrl: config.videoUrl || null,
          fallbackImageUrl: config.fallbackImageUrl || null,
          dynamicConfig: config.dynamicConfig || null,
        }
      : { banners: { items: [] }, categoryIds: [], mediaType: "image", videoUrl: null, fallbackImageUrl: null, dynamicConfig: null };

    return handleResponse(res, 200, "Hero config fetched", payload);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getAdminHeroConfig = async (req, res) => {
  try {
    const { pageType, headerId, zoneIds } = req.query;

    if (!pageType) {
      return handleResponse(res, 400, "pageType is required");
    }

    if (pageType === "header" && !headerId) {
      return handleResponse(res, 400, "headerId is required for header pageType");
    }

    const requestedZoneIds = normalizeZoneIds(
      Array.isArray(zoneIds) ? zoneIds : String(zoneIds || "").split(",").map((v) => v.trim()).filter(Boolean),
    );

    const config = await HeroConfig.findOne({
      pageType,
      headerId: pageType === "header" ? headerId : null,
      ...exactZoneSetFilter(requestedZoneIds),
    }).lean();

    return handleResponse(
      res,
      200,
      "Hero config fetched",
      config || { banners: { items: [] }, categoryIds: [], zoneIds: requestedZoneIds }
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getHeroConfigVariants = async (req, res) => {
  try {
    const { pageType, headerId } = req.query;

    if (!pageType) {
      return handleResponse(res, 400, "pageType is required");
    }
    if (pageType === "header" && !headerId) {
      return handleResponse(res, 400, "headerId is required for header pageType");
    }

    const variants = await HeroConfig.find({
      pageType,
      headerId: pageType === "header" ? headerId : null,
    })
      .select("zoneIds updatedAt")
      .populate("zoneIds", "name")
      .sort({ createdAt: 1 })
      .lean();

    return handleResponse(res, 200, "Hero config variants fetched", variants);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const deleteHeroConfigVariant = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await HeroConfig.findById(id);
    if (!existing) {
      return handleResponse(res, 404, "Hero config variant not found");
    }
    if (!existing.zoneIds || existing.zoneIds.length === 0) {
      return handleResponse(res, 400, "The default All Zones variant cannot be deleted");
    }

    await HeroConfig.findByIdAndDelete(id);
    await invalidate("cache:experience:hero:*");

    return handleResponse(res, 200, "Hero config variant deleted");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const upsertHeroConfig = async (req, res) => {
  try {
    const { pageType, headerId, banners, categoryIds, mediaType, videoUrl, fallbackImageUrl, dynamicConfig, zoneIds } = req.body;

    if (!["home", "header"].includes(pageType)) {
      return handleResponse(res, 400, "Invalid pageType");
    }

    if (pageType === "header" && !headerId) {
      return handleResponse(res, 400, "headerId is required for header pageType");
    }

    if (pageType === "header") {
      const header = await Category.findOne({ _id: headerId, type: "header" });
      if (!header) {
        return handleResponse(res, 400, "Invalid headerId");
      }
    }

    const bannerItems = Array.isArray(banners?.items)
      ? banners.items
        .filter((b) => b && b.imageUrl)
        .map((b) => ({
          imageUrl: b.imageUrl,
          title: b.title || "",
          subtitle: b.subtitle || "",
          linkType: b.linkType || "none",
          linkValue: b.linkValue || "",
          status: b.status || "active",
        }))
      : [];

    const ids = Array.isArray(categoryIds) ? categoryIds.filter(Boolean) : [];
    const sortedZoneIds = normalizeZoneIds(zoneIds).slice().sort();

    const filter = {
      pageType,
      headerId: pageType === "header" ? headerId : null,
      ...exactZoneSetFilter(sortedZoneIds),
    };

    // Build dynamic config if provided
    let parsedDynamicConfig = undefined;
    if (dynamicConfig) {
      parsedDynamicConfig = {
        centerImage: dynamicConfig.centerImage || null,
        effectType: ["none", "snow", "stars", "lightning", "confetti", "hearts", "bubbles"].includes(dynamicConfig.effectType)
          ? dynamicConfig.effectType
          : "stars",
        eventCategories: Array.isArray(dynamicConfig.eventCategories)
          ? dynamicConfig.eventCategories
              .filter((ec) => ec && ec.categoryId)
              .map((ec) => ({
                categoryId: ec.categoryId,
                customLabel: ec.customLabel || "",
                discountText: ec.discountText || "",
              }))
          : [],
      };
    }

    const update = {
      banners: { items: bannerItems },
      categoryIds: ids,
      mediaType: ["image", "video", "dynamic"].includes(mediaType) ? mediaType : "image",
      videoUrl: videoUrl || null,
      fallbackImageUrl: fallbackImageUrl || null,
      zoneIds: sortedZoneIds,
      ...(parsedDynamicConfig !== undefined ? { dynamicConfig: parsedDynamicConfig } : {}),
    };

    const config = await HeroConfig.findOneAndUpdate(
      filter,
      { $set: update },
      { new: true, upsert: true, runValidators: true }
    ).lean();
    await invalidate("cache:experience:hero:*");

    return handleResponse(res, 200, "Hero config saved", config);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};
