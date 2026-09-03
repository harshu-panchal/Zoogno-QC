import Cart from "../models/cart.js";
import Product from "../models/product.js";
import Seller from "../models/seller.js";
import handleResponse from "../utils/helper.js";
import { getApprovedOrLegacyFilter } from "../services/productModerationService.js";
import { buildKey, getOrSet, invalidate, getTTL } from "../services/cacheService.js";

function cartCacheKey(customerId) {
  return buildKey("cart", "customer", String(customerId));
}

function invalidateCartCache(customerId) {
  return invalidate(cartCacheKey(customerId));
}

const CART_POPULATE_FIELDS =
  "name slug price salePrice mainImage stock status headerId categoryId subcategoryId sellerId variants isOutOfStock";

const CUSTOMER_VISIBLE_PRODUCT_MATCH = {
  status: "active",
  ...getApprovedOrLegacyFilter(),
};

function sanitizeCartItems(cart) {
  if (!cart || !Array.isArray(cart.items)) return cart;
  cart.items = cart.items.filter((item) => Boolean(item?.productId));
  return cart;
}

async function getCustomerVisibleProductById(productId) {
  if (!productId) return null;
  return Product.findOne({
    _id: productId,
    ...CUSTOMER_VISIBLE_PRODUCT_MATCH,
  })
    .select("_id sellerId isOutOfStock stock variants")
    .lean();
}

async function fetchPopulatedCart(cartId) {
  const cart = await Cart.findById(cartId)
    .populate({
      path: "items.productId",
      select: CART_POPULATE_FIELDS,
      match: CUSTOMER_VISIBLE_PRODUCT_MATCH,
    })
    .lean();

  return sanitizeCartItems(cart);
}

/* ===============================
   GET CUSTOMER CART
================================ */
export const getCart = async (req, res) => {
  try {
    const customerId = req.user.id;

    const cart = await getOrSet(
      cartCacheKey(customerId),
      async () => {
        const existing = await Cart.findOne({ customerId })
          .populate({
            path: "items.productId",
            select: CART_POPULATE_FIELDS,
            match: CUSTOMER_VISIBLE_PRODUCT_MATCH,
          })
          .lean();

        if (!existing) {
          const newCart = await Cart.create({ customerId, items: [] });
          return newCart.toObject();
        }

        return sanitizeCartItems(existing);
      },
      getTTL("cart"),
    );

    return handleResponse(res, 200, "Cart fetched successfully", cart);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   ADD TO CART
================================ */
export const addToCart = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { productId, quantity = 1, variantSku = "" } = req.body;
    const normalizedVariantSku = String(variantSku || "").trim();
    const customerVisibleProduct = await getCustomerVisibleProductById(productId);
    if (!customerVisibleProduct) {
      return handleResponse(res, 404, "Product is not available for purchase");
    }

    if (customerVisibleProduct.isOutOfStock) {
      return handleResponse(res, 400, "Product is out of stock");
    }

    let availableStock = customerVisibleProduct.stock || 0;
    if (normalizedVariantSku) {
      const variants = Array.isArray(customerVisibleProduct.variants) ? customerVisibleProduct.variants : [];
      const variant = variants.find((v) => String(v?.sku || "").trim() === normalizedVariantSku || String(v?.name || "").trim() === normalizedVariantSku);
      if (variant && variant.stock !== undefined) {
        availableStock = variant.stock;
      }
    }

    const seller = await Seller.findById(customerVisibleProduct.sellerId).select("isOnline").lean();
    if (seller && seller.isOnline === false) {
      return handleResponse(res, 400, "Store is currently offline and not accepting orders");
    }

    let cart = await Cart.findOne({ customerId });

    if (!cart) {
      cart = new Cart({ customerId, items: [] });
    }

    if (cart.items.length > 0) {
      const firstItemProductId = cart.items[0].productId;
      if (String(firstItemProductId) !== String(productId)) {
        const firstProduct = await Product.findById(firstItemProductId).select("sellerId").lean();
        if (firstProduct && String(firstProduct.sellerId) !== String(customerVisibleProduct.sellerId)) {
          return handleResponse(res, 400, "Cart contains products from a different seller");
        }
      }
    }

    const itemIndex = cart.items.findIndex(
      (item) =>
        item.productId.toString() === productId &&
        String(item.variantSku || "").trim() === normalizedVariantSku,
    );

    if (itemIndex > -1) {
      const newQuantity = cart.items[itemIndex].quantity + quantity;
      if (newQuantity > availableStock) {
        return handleResponse(res, 400, `Insufficient stock. Only ${availableStock} units available.`);
      }
      cart.items[itemIndex].quantity = newQuantity;
    } else {
      if (quantity > availableStock) {
        return handleResponse(res, 400, `Insufficient stock. Only ${availableStock} units available.`);
      }
      cart.items.push({ productId, variantSku: normalizedVariantSku, quantity });
    }

    await cart.save();
    await invalidateCartCache(customerId);
    const updatedCart = await fetchPopulatedCart(cart._id);

    return handleResponse(res, 200, "Item added to cart", updatedCart);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   UPDATE QUANTITY
================================ */
export const updateQuantity = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { productId, quantity, variantSku = "" } = req.body;
    const normalizedVariantSku = String(variantSku || "").trim();

    const customerVisibleProduct = await getCustomerVisibleProductById(productId);
    if (!customerVisibleProduct) {
      return handleResponse(res, 404, "Product is not available for purchase");
    }

    if (customerVisibleProduct.isOutOfStock) {
      return handleResponse(res, 400, "Product is out of stock");
    }

    let availableStock = customerVisibleProduct.stock || 0;
    if (normalizedVariantSku) {
      const variants = Array.isArray(customerVisibleProduct.variants) ? customerVisibleProduct.variants : [];
      const variant = variants.find((v) => String(v?.sku || "").trim() === normalizedVariantSku || String(v?.name || "").trim() === normalizedVariantSku);
      if (variant && variant.stock !== undefined) {
        availableStock = variant.stock;
      }
    }

    let cart = await Cart.findOne({ customerId });

    if (!cart) {
      return handleResponse(res, 404, "Cart not found");
    }

    const itemIndex = cart.items.findIndex(
      (item) =>
        item.productId.toString() === productId &&
        String(item.variantSku || "").trim() === normalizedVariantSku,
    );

    if (itemIndex > -1) {
      if (quantity > availableStock) {
        return handleResponse(res, 400, `Insufficient stock. Only ${availableStock} units available.`);
      }
      cart.items[itemIndex].quantity = quantity;
      if (cart.items[itemIndex].quantity <= 0) {
        cart.items.splice(itemIndex, 1);
      }
    } else {
      return handleResponse(res, 404, "Product not in cart");
    }

    await cart.save();
    await invalidateCartCache(customerId);
    const updatedCart = await fetchPopulatedCart(cart._id);

    return handleResponse(res, 200, "Cart updated successfully", updatedCart);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   REMOVE FROM CART
================================ */
export const removeFromCart = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { productId } = req.params;
    const normalizedVariantSku = String(req.query?.variantSku || "").trim();

    let cart = await Cart.findOne({ customerId });

    if (!cart) {
      return handleResponse(res, 404, "Cart not found");
    }

    cart.items = cart.items.filter((item) => {
      if (item.productId.toString() !== productId) return true;
      // If variantSku is provided, remove only that variant line.
      if (normalizedVariantSku) {
        return String(item.variantSku || "").trim() !== normalizedVariantSku;
      }
      // If no variantSku is provided, keep legacy behavior: remove all lines for that product.
      return false;
    });

    await cart.save();
    await invalidateCartCache(customerId);
    const updatedCart = await fetchPopulatedCart(cart._id);

    return handleResponse(res, 200, "Item removed from cart", updatedCart);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   CLEAR CART
================================ */
export const clearCart = async (req, res) => {
  try {
    const customerId = req.user.id;
    let cart = await Cart.findOne({ customerId });

    if (cart) {
      cart.items = [];
      await cart.save();
      await invalidateCartCache(customerId);
    }

    return handleResponse(res, 200, "Cart cleared successfully");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
