import Wishlist from "../models/wishlist.js";
import Product from "../models/product.js";
import handleResponse from "../utils/helper.js";
import { getApprovedOrLegacyFilter } from "../services/productModerationService.js";
import { buildKey, getOrSet, invalidate, getTTL } from "../services/cacheService.js";

function invalidateWishlistCache(customerId) {
  // One pattern clears both the `ids` and `full` cached variants.
  return invalidate(buildKey("wishlist", "customer", `${customerId}:*`));
}

const CUSTOMER_VISIBLE_PRODUCT_MATCH = {
  status: "active",
  ...getApprovedOrLegacyFilter(),
};

function sanitizeWishlist(wishlist) {
  if (!wishlist || !Array.isArray(wishlist.products)) return wishlist;
  wishlist.products = wishlist.products.filter((item) => Boolean(item));
  return wishlist;
}

async function findCustomerVisibleProductById(productId) {
  if (!productId) return null;
  return Product.findOne({
    _id: productId,
    ...CUSTOMER_VISIBLE_PRODUCT_MATCH,
  })
    .select("_id")
    .lean();
}

async function fetchPopulatedWishlist(wishlistId) {
  const wishlist = await Wishlist.findById(wishlistId)
    .populate({
      path: "products",
      select: "name slug price salePrice mainImage stock status approvalStatus isOutOfStock",
      match: CUSTOMER_VISIBLE_PRODUCT_MATCH,
    })
    .lean();

  return sanitizeWishlist(wishlist);
}

/* ===============================
   GET CUSTOMER WISHLIST
================================ */
export const getWishlist = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { idsOnly } = req.query;

    if (idsOnly === "true") {
      const result = await getOrSet(
        buildKey("wishlist", "customer", `${customerId}:ids`),
        async () => {
          const wishlist = await Wishlist.findOne({ customerId }).select("products").lean();
          const rawIds = Array.isArray(wishlist?.products) ? wishlist.products : [];
          const visibleProducts = await Product.find({
            _id: { $in: rawIds },
            ...CUSTOMER_VISIBLE_PRODUCT_MATCH,
          })
            .select("_id")
            .lean();
          return { products: visibleProducts.map((product) => String(product._id)) };
        },
        getTTL("wishlist"),
      );
      return handleResponse(res, 200, "Wishlist IDs fetched", result);
    }

    const result = await getOrSet(
      buildKey("wishlist", "customer", `${customerId}:full`),
      async () => {
        const wishlistDoc = await Wishlist.findOne({ customerId }).select("_id").lean();
        const wishlist = wishlistDoc?._id
          ? await fetchPopulatedWishlist(wishlistDoc._id)
          : null;

        if (!wishlist) {
          const newWishlist = await Wishlist.create({ customerId, products: [] });
          return newWishlist.toObject();
        }

        return wishlist;
      },
      getTTL("wishlist"),
    );

    return handleResponse(res, 200, "Wishlist fetched successfully", result);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   ADD TO WISHLIST
================================ */
export const addToWishlist = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { productId } = req.body;
    const product = await findCustomerVisibleProductById(productId);
    if (!product) {
      return handleResponse(res, 404, "Product is not available for wishlist");
    }

    let wishlist = await Wishlist.findOne({ customerId });

    if (!wishlist) {
      wishlist = new Wishlist({ customerId, products: [] });
    }

    if (!wishlist.products.includes(productId)) {
      wishlist.products.push(productId);
    }

    await wishlist.save();
    await invalidateWishlistCache(customerId);
    const updatedWishlist = await fetchPopulatedWishlist(wishlist._id);

    return handleResponse(
      res,
      200,
      "Product added to wishlist",
      updatedWishlist,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   REMOVE FROM WISHLIST
================================ */
export const removeFromWishlist = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { productId } = req.params;

    let wishlist = await Wishlist.findOne({ customerId });

    if (!wishlist) {
      return handleResponse(res, 404, "Wishlist not found");
    }

    wishlist.products = wishlist.products.filter(
      (id) => id.toString() !== productId,
    );

    await wishlist.save();
    await invalidateWishlistCache(customerId);
    const updatedWishlist = await fetchPopulatedWishlist(wishlist._id);

    return handleResponse(
      res,
      200,
      "Product removed from wishlist",
      updatedWishlist,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   TOGGLE WISHLIST
================================ */
export const toggleWishlist = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { productId } = req.body;
    const product = await findCustomerVisibleProductById(productId);

    let wishlist = await Wishlist.findOne({ customerId });

    if (!wishlist) {
      wishlist = new Wishlist({ customerId, products: [] });
    }

    const index = wishlist.products.indexOf(productId);
    let message = "";

    if (index > -1) {
      wishlist.products.splice(index, 1);
      message = "Product removed from wishlist";
    } else {
      if (!product) {
        return handleResponse(res, 404, "Product is not available for wishlist");
      }
      wishlist.products.push(productId);
      message = "Product added to wishlist";
    }

    await wishlist.save();
    await invalidateWishlistCache(customerId);
    const updatedWishlist = await fetchPopulatedWishlist(wishlist._id);

    return handleResponse(res, 200, message, updatedWishlist);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
