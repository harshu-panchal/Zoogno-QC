import Product from "../models/product.js";
import StockHistory from "../models/stockHistory.js";
import { createLowStockAlertCandidate } from "./lowStockAlertService.js";

const ONLINE_RESERVATION_MS = () =>
  parseInt(process.env.ONLINE_STOCK_RESERVATION_MS || "900000", 10);

export function computeStockReservationWindow(paymentMode) {
  const now = new Date();
  if (String(paymentMode || "").toUpperCase() !== "ONLINE") {
    return {
      status: "COMMITTED",
      reservedAt: now,
      expiresAt: null,
      releasedAt: null,
    };
  }
  return {
    status: "RESERVED",
    reservedAt: now,
    expiresAt: new Date(now.getTime() + ONLINE_RESERVATION_MS()),
    releasedAt: null,
  };
}

export async function reserveStockForItems({
  items,
  sellerId,
  orderId,
  session,
  paymentMode = "COD",
}) {
  const stockType = String(paymentMode || "").toUpperCase() === "ONLINE" ? "Reservation" : "Sale";
  const lowStockAlerts = [];
  const stockHistoryRows = [];

  for (const item of items) {
    const variantSku = String(item.variantSku || "").trim();

    let updated;
    if (variantSku) {
      // Decrement variant stock + master stock atomically
      // Use $elemMatch to ensure stock check and sku match on the SAME array element
      updated = await Product.findOneAndUpdate(
        {
          _id: item.productId,
          stock: { $gte: item.quantity },
          variants: {
            $elemMatch: {
              sku: variantSku,
              stock: { $gte: item.quantity },
            },
          },
        },
        {
          $inc: {
            stock: -item.quantity,
            "variants.$.stock": -item.quantity,
          },
        },
        { new: true, session },
      );
    } else {
      updated = await Product.findOneAndUpdate(
        {
          _id: item.productId,
          stock: { $gte: item.quantity },
        },
        {
          $inc: { stock: -item.quantity },
        },
        { new: true, session },
      );
    }

    if (!updated) {
      const err = new Error(`Insufficient stock for product: ${item.productName}${variantSku ? ` (variant: ${variantSku})` : ""}`);
      err.statusCode = 409;
      throw err;
    }

    stockHistoryRows.push({
      product: item.productId,
      seller: sellerId,
      type: stockType,
      quantity: -item.quantity,
      note: `Order #${orderId} ${stockType.toLowerCase()}${variantSku ? ` [variant: ${variantSku}]` : ""}`,
    });

    const previousStock = Number(updated.stock || 0) + Number(item.quantity || 0);
    let previousVariantStock = null;
    let currentVariantStock = null;

    if (variantSku) {
      const matchedVariant = Array.isArray(updated.variants)
        ? updated.variants.find(
          (variant) => String(variant?.sku || "").trim() === variantSku,
        )
        : null;
      if (matchedVariant) {
        currentVariantStock = Number(matchedVariant.stock || 0);
        previousVariantStock = currentVariantStock + Number(item.quantity || 0);
      }
    }

    const alertCandidate = createLowStockAlertCandidate({
      product: updated,
      previousStock,
      currentStock: Number(updated.stock || 0),
      variantSku,
      previousVariantStock,
      currentVariantStock,
    });

    if (alertCandidate) {
      lowStockAlerts.push(alertCandidate);
    }
  }

  if (stockHistoryRows.length > 0) {
    await StockHistory.insertMany(stockHistoryRows, { session, ordered: true });
  }

  return lowStockAlerts;
}

export async function releaseReservedStockForOrder(order, { session = null, reason = "Reservation released" } = {}) {
  if (!order || !Array.isArray(order.items) || order.items.length === 0) {
    return false;
  }

  const reservation = order.stockReservation || {};
  if (reservation.status === "RELEASED") {
    return false;
  }

  const bulkOps = [];
  const stockHistoryRows = [];

  for (const item of order.items) {
    const variantSku = String(item.variantSku || item.variantSlot || "").trim();

    if (variantSku) {
      bulkOps.push({
        updateOne: {
          filter: { _id: item.product, "variants.sku": variantSku },
          update: {
            $inc: {
              stock: item.quantity,
              "variants.$.stock": item.quantity,
            },
          },
        },
      });
    } else {
      bulkOps.push({
        updateOne: {
          filter: { _id: item.product },
          update: { $inc: { stock: item.quantity } },
        },
      });
    }

    stockHistoryRows.push({
      product: item.product,
      seller: order.seller,
      type: "Release",
      quantity: item.quantity,
      note: `Order #${order.orderId} ${reason}${variantSku ? ` [variant: ${variantSku}]` : ""}`,
      order: order._id,
    });
  }

  if (bulkOps.length > 0) {
    await Product.bulkWrite(bulkOps, session ? { session, ordered: true } : { ordered: true });
  }
  if (stockHistoryRows.length > 0) {
    await StockHistory.insertMany(stockHistoryRows, session ? { session, ordered: true } : { ordered: true });
  }

  order.stockReservation = {
    ...(order.stockReservation || {}),
    status: "RELEASED",
    releasedAt: new Date(),
  };

  return true;
}
