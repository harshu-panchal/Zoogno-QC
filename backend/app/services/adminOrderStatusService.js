/**
 * adminOrderStatusService.js - lets an admin FORCE an order into any status, from any status.
 *
 * Why this exists: the admin Orders dropdown called PUT /orders/status/:id, which only wrote the
 * legacy `status` string (and `workflowStatus` for "delivered" alone). But every screen derives an
 * order's status from `workflowStatus`, so for most orders picking "Confirmed" or "Packed" saved
 * something nobody reads and the dropdown snapped back. There was also no way to move an order
 * "backwards", and cancelling left rider broadcasts, timers and refunds untouched.
 *
 * What a forced change does (see planForcedStatus for the pure part):
 *   - writes status, orderStatus AND workflowStatus together, so every panel agrees
 *   - ignores the normal state machine - any status -> any status
 *   - moving BACK before dispatch clears the rider / pickup / delivery fields they no longer match
 *   - leaving the rider search stops its re-broadcast loop and withdraws the rider popups
 *   - cancelling releases stock, fails the seller transaction, refunds, cancels the invoice
 *   - delivering runs the normal settlement; out-for-delivery issues the seller invoice
 *   - reopening a cancelled order re-takes the stock
 *   - every forced change is appended to `adminStatusOverrides` (who, when, from, to, why)
 *
 * What it CANNOT undo is money that already moved (payouts settled on delivery, refunds paid on
 * cancellation). Those cases come back as `warnings` so the admin sees them.
 */

import mongoose from "mongoose";
import Order from "../models/order.js";
import Product from "../models/product.js";
import StockHistory from "../models/stockHistory.js";
import DeliveryAssignment from "../models/deliveryAssignment.js";
import {
  WORKFLOW_STATUS,
  legacyStatusFromWorkflow,
  workflowFromLegacyStatus,
} from "../constants/orderWorkflow.js";
import { INVOICE_ISSUE_TRIGGER } from "../constants/finance.js";
import logger from "./logger.js";

/** The statuses the admin dropdown offers. Everything else is rejected with a 400. */
export const ADMIN_FORCEABLE_STATUSES = [
  "pending",
  "confirmed",
  "packed",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

/** "Out for Delivery" / "out-for-delivery" / "OUT_FOR_DELIVERY" -> "out_for_delivery" (or null). */
export function normalizeForcedStatus(raw) {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return ADMIN_FORCEABLE_STATUSES.includes(s) ? s : null;
}

const isV2 = (order) => Number(order?.workflowVersion) >= 2;

/** The order's current legacy bucket, however it was stored. */
function currentLegacyStatus(order) {
  if (isV2(order) && order.workflowStatus) return legacyStatusFromWorkflow(order.workflowStatus);
  return String(order?.status || "pending").toLowerCase();
}

/** The order's current workflow status, however it was stored. */
function currentWorkflowStatus(order) {
  if (order?.workflowStatus) return order.workflowStatus;
  return workflowFromLegacyStatus(order?.status);
}

/**
 * PURE: work out exactly what a forced change should write. No database access.
 *
 * @param {object} order   plain order (needs workflowVersion, workflowStatus, status, deliveryBoy,
 *                         assignedAt, pickupConfirmedAt, outForDeliveryAt, deliveredAt)
 * @param {string} target  one of ADMIN_FORCEABLE_STATUSES
 * @param {object} opts    { now, reason, deliveryBoyId }
 * @returns {{
 *   target, fromWorkflow, toWorkflow, fromLegacy, toLegacy, set, unset,
 *   leavingSearch, startSearch, noop
 * }}
 */
export function planForcedStatus(order, target, { now = new Date(), reason = "", deliveryBoyId = null } = {}) {
  if (!ADMIN_FORCEABLE_STATUSES.includes(target)) {
    const err = new Error(`Unsupported status: ${target}`);
    err.statusCode = 400;
    throw err;
  }

  const fromWorkflow = currentWorkflowStatus(order);
  const fromLegacy = currentLegacyStatus(order);
  const v2 = isV2(order);

  const riderId = deliveryBoyId || order.deliveryBoy || null;
  const hasRider = Boolean(riderId);

  // Fields that only make sense once the order has been handed to a rider. Moving the order back to
  // a pre-dispatch state clears them, otherwise screens that derive status from these (and the
  // pre-save hook that re-fills deliveryBoy from deliveryPartner) would pull it forward again.
  const clearDelivery = {
    deliveryBoy: null,
    deliveryPartner: null,
    assignedAt: null,
    pickupConfirmedAt: null,
    pickupReadyAt: null,
    outForDeliveryAt: null,
    deliveredAt: null,
    deliverySearchExpiresAt: null,
    deliveryBroadcastScheduledAt: null,
    skippedBy: [],
  };

  let toWorkflow;
  const set = { sellerPendingExpiresAt: null };
  const unset = {};

  switch (target) {
    case "pending":
      toWorkflow = WORKFLOW_STATUS.SELLER_PENDING;
      Object.assign(set, clearDelivery);
      unset.deliveryRiderStep = 1;
      break;

    case "confirmed":
      toWorkflow = WORKFLOW_STATUS.SELLER_ACCEPTED;
      Object.assign(set, clearDelivery);
      unset.deliveryRiderStep = 1;
      break;

    case "packed":
      if (hasRider) {
        toWorkflow = WORKFLOW_STATUS.DELIVERY_ASSIGNED;
        Object.assign(set, {
          deliveryBoy: riderId,
          deliveryPartner: riderId,
          assignedAt: order.assignedAt || now,
          deliveryRiderStep: 1,
          pickupConfirmedAt: null,
          pickupReadyAt: null,
          outForDeliveryAt: null,
          deliveredAt: null,
          deliverySearchExpiresAt: null,
          deliveryBroadcastScheduledAt: null,
        });
      } else {
        // No rider yet: "packed" means ready for pickup, i.e. look for one.
        toWorkflow = WORKFLOW_STATUS.DELIVERY_SEARCH;
        Object.assign(set, clearDelivery);
        unset.deliveryRiderStep = 1;
      }
      break;

    case "out_for_delivery":
      toWorkflow = WORKFLOW_STATUS.OUT_FOR_DELIVERY;
      Object.assign(set, {
        ...(hasRider ? { deliveryBoy: riderId, deliveryPartner: riderId } : {}),
        assignedAt: order.assignedAt || now,
        pickupConfirmedAt: order.pickupConfirmedAt || now,
        outForDeliveryAt: order.outForDeliveryAt || now,
        deliveryRiderStep: 3,
        deliveredAt: null,
        deliverySearchExpiresAt: null,
        deliveryBroadcastScheduledAt: null,
      });
      break;

    case "delivered":
      toWorkflow = WORKFLOW_STATUS.DELIVERED;
      Object.assign(set, {
        deliveredAt: order.deliveredAt || now,
        deliverySearchExpiresAt: null,
        deliveryBroadcastScheduledAt: null,
        ...(hasRider ? { deliveryBoy: riderId, deliveryPartner: riderId } : {}),
      });
      break;

    case "cancelled":
      toWorkflow = WORKFLOW_STATUS.CANCELLED;
      Object.assign(set, {
        cancelledBy: "admin",
        cancelReason: String(reason || "").trim() || "Cancelled by admin",
        deliverySearchExpiresAt: null,
        deliveryBroadcastScheduledAt: null,
      });
      break;

    default:
      toWorkflow = workflowFromLegacyStatus(target);
  }

  const toLegacy = legacyStatusFromWorkflow(toWorkflow);
  set.status = toLegacy;
  set.orderStatus = toLegacy;
  // Only v2 orders have a workflow state; a v1 order is described by `status` alone.
  if (v2) set.workflowStatus = toWorkflow;

  const leavingSearch = fromWorkflow === WORKFLOW_STATUS.DELIVERY_SEARCH && toWorkflow !== WORKFLOW_STATUS.DELIVERY_SEARCH;
  // Start the rider search only when entering it - an order already searching must not get a second loop.
  const startSearch = v2 && toWorkflow === WORKFLOW_STATUS.DELIVERY_SEARCH && fromWorkflow !== WORKFLOW_STATUS.DELIVERY_SEARCH;

  const noop =
    fromWorkflow === toWorkflow &&
    fromLegacy === toLegacy &&
    (!v2 || order.workflowStatus === toWorkflow) &&
    !deliveryBoyId;

  return { target, fromWorkflow, toWorkflow, fromLegacy, toLegacy, set, unset, leavingSearch, startSearch, noop };
}

// ─────────────────────────────────────────────────────────────────────────────
// Side effects
// ─────────────────────────────────────────────────────────────────────────────

/** Swallow-and-log wrapper: a cleanup step must never abort an admin's forced change. */
async function bestEffort(label, orderId, fn, warnings, warningText) {
  try {
    return await fn();
  } catch (err) {
    logger.warn(`Forced status: ${label} failed`, { scope: "ADMIN_STATUS", orderId, error: err.message });
    if (warningText) warnings.push(`${warningText} (${err.message})`);
    return undefined;
  }
}

/**
 * Take stock back for a re-opened cancelled order (mirror of releaseReservedStockForOrder).
 * Forced: stock is decremented even if that takes it below zero. Returns names that went negative.
 */
async function recommitStockForOrder(order) {
  const ops = [];
  const history = [];
  for (const item of order.items || []) {
    const sku = String(item.variantSku || item.variantSlot || "").trim();
    ops.push({
      updateOne: sku
        ? {
            filter: { _id: item.product, "variants.sku": sku },
            update: { $inc: { stock: -item.quantity, "variants.$.stock": -item.quantity } },
          }
        : { filter: { _id: item.product }, update: { $inc: { stock: -item.quantity } } },
    });
    history.push({
      product: item.product,
      seller: order.seller,
      type: "Correction",
      quantity: -item.quantity,
      note: `Order #${order.orderId} re-opened by admin${sku ? ` [variant: ${sku}]` : ""}`,
      order: order._id,
    });
  }
  if (!ops.length) return [];
  await Product.bulkWrite(ops, { ordered: true });
  await StockHistory.insertMany(history, { ordered: true });
  await Order.updateOne({ _id: order._id }, { $set: { "stockReservation.status": "COMMITTED", "stockReservation.releasedAt": null } });

  const ids = [...new Set((order.items || []).map((i) => String(i.product)))];
  const products = await Product.find({ _id: { $in: ids } }).select("name stock").lean();
  return products.filter((p) => Number(p.stock) < 0).map((p) => p.name);
}

/**
 * Force `orderId` (Mongo _id or public order id) into `targetStatus`.
 *
 * @returns {Promise<{ order: object, changed: boolean, warnings: string[], plan: object }>}
 */
export async function forceOrderStatus(orderRef, rawTarget, { adminId = null, reason = "", deliveryBoyId = null } = {}) {
  const target = normalizeForcedStatus(rawTarget);
  if (!target) {
    const err = new Error(`Status must be one of: ${ADMIN_FORCEABLE_STATUSES.join(", ")}`);
    err.statusCode = 400;
    throw err;
  }
  if (deliveryBoyId && !mongoose.Types.ObjectId.isValid(String(deliveryBoyId))) {
    const err = new Error("Invalid delivery partner id");
    err.statusCode = 400;
    throw err;
  }

  const order = await Order.findById(orderRef?._id || orderRef).lean();
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  const now = new Date();
  const plan = planForcedStatus(order, target, { now, reason, deliveryBoyId });
  const warnings = [];
  if (plan.noop) return { order, changed: false, warnings, plan };

  const publicId = order.orderId;
  const fromDelivered = plan.fromWorkflow === WORKFLOW_STATUS.DELIVERED;
  const fromCancelled = plan.fromWorkflow === WORKFLOW_STATUS.CANCELLED;
  const toCancelled = plan.toWorkflow === WORKFLOW_STATUS.CANCELLED;
  const toDelivered = plan.toWorkflow === WORKFLOW_STATUS.DELIVERED;

  // ── 1. The write. findOneAndUpdate (not save) so the pre-save hooks - which re-fill deliveryBoy
  //       from deliveryPartner - cannot undo a cleared rider. The audit entry rides in the same write.
  const update = {
    $set: plan.set,
    $push: {
      adminStatusOverrides: {
        from: plan.fromLegacy,
        to: plan.toLegacy,
        fromWorkflow: plan.fromWorkflow,
        toWorkflow: plan.toWorkflow,
        by: adminId && mongoose.Types.ObjectId.isValid(String(adminId)) ? new mongoose.Types.ObjectId(String(adminId)) : undefined,
        at: now,
        reason: String(reason || "").slice(0, 300),
      },
    },
  };
  if (Object.keys(plan.unset).length) update.$unset = plan.unset;
  const updated = await Order.findOneAndUpdate({ _id: order._id }, update, { new: true }).lean();

  // Lazy imports: these pull in the workflow / queue / finance graph the rest of the app already loads,
  // and importing them lazily avoids an import cycle with the services that call back into orders.
  const [workflow, emitter, schedulerPort, compensation, finance, settlement, invoices, notif] = await Promise.all([
    import("./orderWorkflowService.js"),
    import("./orderSocketEmitter.js"),
    import("./workflow/jobSchedulerPort.js"),
    import("./orderCompensation.js"),
    import("./finance/orderFinanceService.js"),
    import("./orderSettlement.js"),
    import("./gst/invoiceService.js"),
    import("../modules/notifications/notification.emitter.js"),
  ]);
  const { NOTIFICATION_EVENTS } = await import("../modules/notifications/notification.constants.js");

  // ── 2. Stop timers that belong to the state we just left (idempotent, harmless if absent).
  await bestEffort("clear timers", publicId, async () => {
    await schedulerPort.removeSellerTimeout(publicId);
    await schedulerPort.removeBroadcastStart(publicId);
    await schedulerPort.removeDeliveryTimeout(publicId, order.deliverySearchMeta?.attempt || 1);
  }, warnings);

  // ── 3. Leaving the rider search: end the re-broadcast loop and pull the offer from every rider.
  if (plan.leavingSearch) {
    await bestEffort("withdraw broadcast", publicId, async () => {
      await emitter.retractDeliveryBroadcastForOrder(publicId);
      await DeliveryAssignment.updateMany(
        { orderId: publicId, status: "broadcasting" },
        { $set: { status: "cancelled" } },
      );
    }, warnings, "Rider broadcast could not be fully withdrawn");
  }

  // ── 4. Entering the rider search (e.g. forced to "Packed" with no rider): broadcast now.
  if (plan.startSearch) {
    await bestEffort("start rider search", publicId, () => workflow.startDeliverySearchForOrder(order._id), warnings, "Rider search could not be started");
  }

  // ── 5. Cancelled: stock back, seller transaction failed, refund, invoice cancelled.
  if (toCancelled && !fromCancelled) {
    if (fromDelivered) {
      // The goods are with the customer, so stock is NOT put back and nothing financial is reversed.
      warnings.push("This order had already been delivered and settled: stock was NOT restored, and seller/rider earnings and any COD cash handling were NOT reversed.");
    } else {
      await bestEffort("stock compensation", publicId, () => compensation.compensateOrderCancellation(updated, publicId), warnings, "Stock could not be restored automatically");
    }
    if (fromDelivered) {
      // (nothing further - see warning above)
    } else if (updated.paymentBreakdown?.grandTotal != null && updated.settlementStatus?.overall !== "CANCELLED") {
      await bestEffort("refund", publicId, () => finance.reverseOrderFinanceOnCancellation(order._id, { actorId: adminId, reason: "Cancelled by admin" }), warnings, "Automatic refund failed - refund this customer manually");
    }
    await bestEffort("invoice cancel", publicId, () => invoices.cancelInvoiceForOrder(updated, { reason: "Cancelled by admin", cancelledBy: "admin" }), warnings);
  }

  // ── 6. Re-opened a cancelled order: take its stock again; refunds already paid cannot be re-collected.
  if (fromCancelled && !toCancelled) {
    const negative = await bestEffort("re-take stock", publicId, () => recommitStockForOrder(updated), warnings, "Stock could not be re-taken automatically");
    if (negative?.length) warnings.push(`Stock is now negative for: ${negative.join(", ")}.`);
    warnings.push("This order had been cancelled: any refund already issued to the customer was NOT taken back.");
  }

  // ── 7. Delivered: the normal settlement (payouts, COD cash, incentives, GST, invoices).
  if (toDelivered && !fromDelivered) {
    await bestEffort("settlement", publicId, async () => {
      const fresh = await Order.findById(order._id);
      // An ONLINE order whose payment was never marked captured (failed/late webhook, or the
      // admin force-jumping statuses before capture) would otherwise make settleDeliveredOrder
      // throw and skip payouts/GST/invoices entirely. Admin marking an order delivered is taken
      // as their explicit confirmation that payment was received, so capture it first - this
      // books the same real ledger entry (admin wallet credit) the payment webhook would have -
      // instead of silently leaving the whole settlement chain unapplied.
      if (fresh.paymentMode === "ONLINE" && !fresh.financeFlags?.onlinePaymentCaptured) {
        await finance.handleOnlineOrderFinance(fresh._id, {
          actorId: adminId,
          transactionId: "",
          metadata: { source: "ADMIN_FORCE_DELIVERED", reason },
        });
        warnings.push("Online payment was not yet marked captured - confirmed automatically because admin marked this order delivered.");
      }
      await settlement.applyDeliveredSettlement(fresh, publicId);
    }, warnings, "Order marked delivered but settlement could not be applied (it can be reconciled later)");
    await bestEffort("withdraw broadcast", publicId, () => emitter.retractDeliveryBroadcastForOrder(publicId), warnings);
  }
  if (fromDelivered && !toDelivered && !toCancelled) {
    warnings.push("This order had been delivered and settled: earnings/payouts already settled were NOT reversed.");
  }

  // ── 8. Out for delivery = the goods leave the seller: raise the seller's tax invoice (idempotent).
  if (plan.toWorkflow === WORKFLOW_STATUS.OUT_FOR_DELIVERY) {
    await bestEffort("invoice", publicId, () => invoices.issueInvoiceForOrder(updated, { trigger: INVOICE_ISSUE_TRIGGER.DISPATCH }), warnings, "Seller tax invoice could not be issued");
  }

  // ── 9. Tell everyone watching.
  await bestEffort("socket update", publicId, async () => {
    emitter.emitOrderStatusUpdate(publicId, { status: plan.toLegacy, workflowStatus: plan.toWorkflow, forcedByAdmin: true }, updated.customer);
  }, warnings);
  const eventPayload = {
    orderId: publicId,
    customerId: updated.customer,
    userId: updated.customer,
    sellerId: updated.seller,
    deliveryId: updated.deliveryBoy,
  };
  if (toCancelled && !fromCancelled) notif.emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_CANCELLED, eventPayload);
  if (toDelivered && !fromDelivered) notif.emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_DELIVERED, eventPayload);
  if (plan.toWorkflow === WORKFLOW_STATUS.OUT_FOR_DELIVERY && plan.fromWorkflow !== WORKFLOW_STATUS.OUT_FOR_DELIVERY) {
    notif.emitNotificationEvent(NOTIFICATION_EVENTS.OUT_FOR_DELIVERY, eventPayload);
  }

  const finalOrder = (await Order.findById(order._id).lean()) || updated;
  return { order: finalOrder, changed: true, warnings, plan };
}
