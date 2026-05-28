/**
 * OrderReturnService
 *
 * Owns the return-flow business logic that previously lived inline inside
 * orderController.js (P2.1 of the refactor plan).
 *
 * Design rules (per `domain-service-extraction` skill):
 *   - Framework-agnostic. No req/res/next imports.
 *   - Inputs are primitives or plain payloads.
 *   - Failures throw Error with `err.statusCode` so controllers can map to HTTP.
 *   - Side-effects (notifications, socket emissions) preserved byte-for-byte
 *     so existing HTTP contracts remain identical.
 *
 * Extracted handlers:
 *   - createReturnRequest    ← requestReturn()
 *   - getReturnDetails       ← getReturnDetails()
 *   - approveReturn          ← approveReturnRequest()
 *   - rejectReturn           ← rejectReturnRequest()
 */

import Order from "../../models/order.js";
import Setting from "../../models/setting.js";
import User from "../../models/customer.js";
import Seller from "../../models/seller.js";
import OrderOtp from "../../models/orderOtp.js";
import { orderMatchQueryFromRouteParam } from "../../utils/orderLookup.js";
import { computeReturnWindowForOrder } from "../../utils/returnWindow.js";
import { emitNotificationEvent } from "../../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../../modules/notifications/notification.constants.js";
import {
  emitReturnBroadcastForCustomer,
  emitToSeller,
} from "../orderSocketEmitter.js";

function err(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export class OrderReturnService {
  /**
   * Creates a new return request on a delivered order.
   * Throws: 400 (validation), 404 (order missing).
   */
  static async createReturnRequest(customerId, orderId, payload = {}) {
    const { items, reason, images, reasonDetail, conditionAssurance } = payload;

    if (!Array.isArray(items) || items.length === 0) {
      throw err("Please select at least one item to return.", 400);
    }
    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      throw err("Return reason is required.", 400);
    }

    const orderKey = orderMatchQueryFromRouteParam(orderId);
    if (!orderKey) {
      throw err("Order not found", 404);
    }

    const order = await Order.findOne({ ...orderKey, customer: customerId });
    if (!order) {
      throw err("Order not found", 404);
    }

    if (order.status !== "delivered") {
      throw err("Return can only be requested for delivered orders.", 400);
    }

    if (order.returnStatus && order.returnStatus !== "none") {
      throw err("Return request already exists for this order.", 400);
    }

    const now = new Date();
    const { eligibleAt, windowExpiresAt, eligibleDelay, windowMinutes } =
      computeReturnWindowForOrder(order);

    if (now < eligibleAt) {
      throw err(
        `Return is available after ${eligibleDelay} minutes from delivery. Please try again later.`,
        400,
      );
    }

    if (windowExpiresAt && now > windowExpiresAt) {
      throw err(
        `Return window has expired. You can only request a return within ${windowMinutes} minutes of delivery.`,
        400,
      );
    }

    const selectedItems = [];
    for (const entry of items) {
      const { itemIndex, quantity } = entry || {};
      if (
        typeof itemIndex !== "number" ||
        itemIndex < 0 ||
        itemIndex >= order.items.length
      ) {
        throw err("Invalid item selection for return.", 400);
      }
      const original = order.items[itemIndex];
      const qty = Number(quantity) || original.quantity;
      if (qty <= 0 || qty > original.quantity) {
        throw err("Invalid quantity for one of the return items.", 400);
      }

      selectedItems.push({
        product: original.product,
        name: original.name,
        quantity: qty,
        price: original.price,
        variantSlot: original.variantSlot,
        itemIndex,
        status: "requested",
      });
    }

    order.returnStatus = "return_requested";
    order.returnReason = reason.trim();
    order.returnReasonDetail = reasonDetail?.trim() || "";
    order.returnConditionAssurance = Boolean(conditionAssurance);
    order.returnImages = Array.isArray(images) ? images.slice(0, 5) : [];
    order.returnItems = selectedItems;
    order.returnRequestedAt = now;
    order.returnEligibleAt = eligibleAt;
    order.returnWindowExpiresAt = windowExpiresAt;
    order.returnDeadline = windowExpiresAt;

    await order.save();

    emitNotificationEvent(NOTIFICATION_EVENTS.RETURN_REQUESTED, {
      orderId: order.orderId,
      customerId: order.customer,
      sellerId: order.seller,
      data: {
        reason: order.returnReason,
        reasonDetail: order.returnReasonDetail,
      },
    });
    emitToSeller(order.seller?.toString(), {
      event: "return:requested",
      payload: {
        orderId: order.orderId,
        returnStatus: order.returnStatus,
        returnReason: order.returnReason,
        returnReasonDetail: order.returnReasonDetail,
        returnRequestedAt: order.returnRequestedAt,
      },
    });

    return order;
  }

  /**
   * Reads return-flow details for an order, enforcing per-role ACL.
   * Throws: 403 (denied), 404 (order missing).
   */
  static async getReturnDetails(orderId, userId, role) {
    const orderKey = orderMatchQueryFromRouteParam(orderId);
    if (!orderKey) {
      throw err("Order not found", 404);
    }

    const order = await Order.findOne(orderKey)
      .populate("customer", "name phone")
      .populate("seller", "shopName name")
      .populate("returnDeliveryBoy", "name phone");

    if (!order) {
      throw err("Order not found", 404);
    }

    const isOwnerCustomer =
      (role === "customer" || role === "user") &&
      order.customer?._id?.toString() === userId;
    const isOwnerSeller =
      role === "seller" && order.seller?._id?.toString() === userId;
    const isAssignedReturnDelivery =
      role === "delivery" &&
      order.returnDeliveryBoy?._id?.toString() === userId;
    const isAdmin = role === "admin";

    if (
      !isOwnerCustomer &&
      !isOwnerSeller &&
      !isAssignedReturnDelivery &&
      !isAdmin
    ) {
      throw err("Access denied. You are not authorized to view this return.", 403);
    }

    let returnDeliveryCommission = order.returnDeliveryCommission;
    if (
      returnDeliveryCommission === undefined ||
      returnDeliveryCommission === null
    ) {
      try {
        const settings = await Setting.findOne({});
        returnDeliveryCommission = settings?.returnDeliveryCommission ?? 0;
      } catch {
        returnDeliveryCommission = 0;
      }
    }

    let activeOtp = null;
    if (order.returnStatus === "return_pickup_assigned") {
      const otpDoc = await OrderOtp.findOne({
        orderId: order.orderId,
        type: "return_pickup",
        consumedAt: null,
        expiresAt: { $gt: new Date() },
      }).sort({ createdAt: -1 });
      activeOtp = otpDoc?.code || null;
    }

    return {
      orderId: order.orderId,
      status: order.status,
      returnStatus: order.returnStatus,
      returnReason: order.returnReason,
      returnReasonDetail: order.returnReasonDetail,
      returnConditionAssurance: order.returnConditionAssurance,
      returnRejectedReason: order.returnRejectedReason,
      returnRequestedAt: order.returnRequestedAt,
      returnDeadline: order.returnDeadline,
      returnEligibleAt: order.returnEligibleAt,
      returnWindowExpiresAt: order.returnWindowExpiresAt,
      returnImages: order.returnImages || [],
      returnItems: order.returnItems || [],
      returnRefundAmount: order.returnRefundAmount,
      returnDeliveryCommission,
      returnDeliveryBoy: order.returnDeliveryBoy || null,
      returnQcStatus: order.returnQcStatus,
      returnQcAt: order.returnQcAt,
      returnQcNote: order.returnQcNote,
      returnPickupOtp: activeOtp,
    };
  }

  /**
   * Approves a pending return request. Triggers the return-pickup broadcast
   * to nearby delivery partners.
   * Throws: 400 (invalid state), 403 (denied), 404 (order missing).
   */
  static async approveReturn(orderId, userId, role) {
    const orderKey = orderMatchQueryFromRouteParam(orderId);
    if (!orderKey) {
      throw err("Order not found", 404);
    }

    const order = await Order.findOne(orderKey);
    if (!order) {
      throw err("Order not found", 404);
    }

    const isOwnerSeller =
      role === "seller" && order.seller?.toString() === userId;
    const isAdmin = role === "admin";

    if (!isOwnerSeller && !isAdmin) {
      throw err(
        "Access denied. You are not authorized to approve this return.",
        403,
      );
    }

    if (order.returnStatus !== "return_requested") {
      throw err("Only pending return requests can be approved.", 400);
    }

    if (!Array.isArray(order.returnItems) || order.returnItems.length === 0) {
      throw err("No return items found for this order.", 400);
    }

    const refundAmount = order.returnItems.reduce(
      (sum, item) => sum + (item.price || 0) * (item.quantity || 0),
      0,
    );

    const settings = await Setting.findOne({});
    const returnCommission = settings?.returnDeliveryCommission ?? 0;

    order.returnItems = order.returnItems.map((item) => ({
      ...(item.toObject?.() ?? item),
      status: "approved",
    }));
    order.returnRefundAmount = refundAmount;
    order.returnDeliveryCommission = returnCommission;

    order.returnStatus = "return_approved";
    order.returnDeliveryBoy = null;
    order.skippedBy = [];

    await order.save();

    emitNotificationEvent(NOTIFICATION_EVENTS.RETURN_APPROVED, {
      orderId: order.orderId,
      customerId: order.customer,
      userId: order.customer,
      sellerId: order.seller,
      data: {
        refundAmount,
      },
    });

    let sellerInfo = null;
    try {
      sellerInfo = await Seller.findById(order.seller)
        .select("shopName address phone")
        .lean();
    } catch {
      sellerInfo = null;
    }

    let customerInfo = null;
    try {
      customerInfo = await User.findById(order.customer)
        .select("name phone")
        .lean();
    } catch {
      customerInfo = null;
    }

    const broadcastPayload = {
      orderId: order.orderId,
      type: "RETURN_PICKUP",
      commission: returnCommission,
      preview: {
        pickup: order.address?.address || "Customer Address",
        pickupPhone: order.address?.phone || customerInfo?.phone || "",
        customerName: order.address?.name || customerInfo?.name || "Customer",
        drop: sellerInfo?.shopName || "Seller Store",
        dropAddress: sellerInfo?.address || "",
        total: order.pricing?.total || 0,
        returnReason: order.returnReason || "",
        returnItems: Array.isArray(order.returnItems)
          ? order.returnItems.map((i) => ({
            name: i.name || "",
            quantity: i.quantity || 1,
            price: i.price || 0,
            image: i.image || "",
          }))
          : [],
      },
      deliverySearchExpiresAt: new Date(Date.now() + 60 * 1000).toISOString(),
    };

    const customerLocation = order.address?.location;
    emitReturnBroadcastForCustomer(customerLocation, broadcastPayload);
    emitNotificationEvent(NOTIFICATION_EVENTS.RETURN_PICKUP_ASSIGNED, {
      orderId: order.orderId,
      sellerId: order.seller,
      customerId: order.customer,
      data: { commission: returnCommission },
    });

    return order;
  }

  /**
   * Rejects a pending return request with a reason.
   * Throws: 400 (invalid state / missing reason), 403 (denied), 404 (order).
   */
  static async rejectReturn(orderId, userId, role, reason) {
    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      throw err("Rejection reason is required.", 400);
    }

    const orderKey = orderMatchQueryFromRouteParam(orderId);
    if (!orderKey) {
      throw err("Order not found", 404);
    }

    const order = await Order.findOne(orderKey);
    if (!order) {
      throw err("Order not found", 404);
    }

    const isOwnerSeller =
      role === "seller" && order.seller?.toString() === userId;
    const isAdmin = role === "admin";

    if (!isOwnerSeller && !isAdmin) {
      throw err(
        "Access denied. You are not authorized to reject this return.",
        403,
      );
    }

    if (order.returnStatus !== "return_requested") {
      throw err("Only pending return requests can be rejected.", 400);
    }

    order.returnStatus = "return_rejected";
    order.returnRejectedReason = reason.trim();

    await order.save();

    emitNotificationEvent(NOTIFICATION_EVENTS.RETURN_REJECTED, {
      orderId: order.orderId,
      customerId: order.customer,
      userId: order.customer,
      sellerId: order.seller,
      data: {
        reason: order.returnRejectedReason,
      },
    });

    return order;
  }
}

export default OrderReturnService;
