import Order from "../../models/order.js";
import User from "../../models/customer.js";
import CodQrPayment from "../../models/codQrPayment.js";
import { getActivePaymentProvider } from "../payment/providerRegistry.js";
import { handleCodUpiQrFinance } from "../finance/orderFinanceService.js";
import { PAYMENT_STATUS } from "../../constants/payment.js";
import { orderMatchQueryFromRouteParam } from "../../utils/orderLookup.js";
import {
  getCodDueAmount,
  isCodAlreadyCollected,
  isCodOrder,
} from "../../utils/codAmount.js";
import { roundCurrency } from "../../utils/money.js";
import logger from "../logger.js";

const QR_TTL_MS = 15 * 60 * 1000;

function assertAssignedRider(order, riderId) {
  const assigned = String(order.deliveryBoy || order.deliveryPartner || "");
  if (!assigned || assigned !== String(riderId)) {
    const err = new Error("This COD order is not assigned to you");
    err.statusCode = 403;
    throw err;
  }
}

function extractPaidAmount(decoded) {
  const raw = decoded?.raw || {};
  const data = raw.data || {};
  const orderAmt = data.order?.order_amount ?? data.payment?.payment_amount;
  return roundCurrency(Number(orderAmt || 0));
}

export async function createCodUpiQr({ orderParam, riderId }) {
  const query = orderMatchQueryFromRouteParam(orderParam);
  if (!query) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  const order = await Order.findOne(query);
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  if (!isCodOrder(order)) {
    const err = new Error("UPI QR collection is only available for COD orders");
    err.statusCode = 400;
    throw err;
  }

  if (["cancelled", "rto"].includes(order.status) || order.orderStatus === "cancelled") {
    const err = new Error("Cannot collect COD for a cancelled order");
    err.statusCode = 400;
    throw err;
  }

  assertAssignedRider(order, riderId);

  if (isCodAlreadyCollected(order)) {
    return {
      alreadyPaid: true,
      paymentStatus: order.paymentStatus,
      collectionMethod: order.codCollectionMethod,
      amount: getCodDueAmount(order),
    };
  }

  const amount = getCodDueAmount(order);
  if (amount <= 0) {
    const err = new Error("COD amount must be greater than 0");
    err.statusCode = 400;
    throw err;
  }

  await CodQrPayment.updateMany(
    { order: order._id, status: "pending" },
    { $set: { status: "expired" } },
  );

  const merchantOrderId = `COD-QR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const provider = getActivePaymentProvider();
  if (typeof provider.initiateUpiQr !== "function") {
    const err = new Error("UPI QR is not supported by the active payment provider");
    err.statusCode = 501;
    throw err;
  }

  const customer = await User.findById(order.customer).select("name email phone").lean();
  const redirectUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/delivery/orders/${order.orderId}`;

  const customerInfo = {
    customerId: String(order.customer),
    name: customer?.name || order.address?.name || "Customer",
    email: customer?.email || "customer@zoogno.com",
    phone: customer?.phone || order.address?.phone || "9999999999",
  };

  let paymentSessionId = null;
  try {
    const initiated = await provider.initiatePayment({
      merchantOrderId,
      amountPaise: Math.round(amount * 100),
      redirectUrl,
      customerInfo,
    });
    paymentSessionId = initiated.paymentSessionId || null;
  } catch (error) {
    logger.warn("cod_qr_create_order_skipped", {
      merchantOrderId,
      error: error.message,
    });
  }

  const qr = await provider.initiateUpiQr({
    merchantOrderId,
    paymentSessionId,
    amountPaise: Math.round(amount * 100),
    customerInfo,
    redirectUrl,
  });

  const expiresAt = new Date(Date.now() + QR_TTL_MS);
  await CodQrPayment.create({
    order: order._id,
    publicOrderId: order.orderId,
    deliveryBoy: riderId,
    merchantOrderId,
    amount,
    status: "pending",
    qrPayload: qr.qrPayload,
    paymentSessionId: paymentSessionId,
    gatewayPaymentId: qr.gatewayPaymentId,
    expiresAt,
  });

  order.codCollection = {
    ...(order.codCollection || {}),
    merchantOrderId,
    qrExpiresAt: expiresAt,
  };
  await order.save();

  return {
    alreadyPaid: false,
    merchantOrderId,
    amount,
    qrPayload: qr.qrPayload,
    expiresAt,
    paymentStatus: "pending",
  };
}

export async function getCodUpiQrStatus({ orderParam, riderId }) {
  const query = orderMatchQueryFromRouteParam(orderParam);
  if (!query) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }
  const order = await Order.findOne(query);
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }
  assertAssignedRider(order, riderId);

  if (isCodAlreadyCollected(order)) {
    return {
      paymentStatus: order.paymentStatus,
      collectionMethod: order.codCollectionMethod || "NONE",
      paid: true,
      amount: getCodDueAmount(order),
      transactionId: order.codCollection?.transactionId || order.payment?.transactionId || null,
    };
  }

  const latest = await CodQrPayment.findOne({ order: order._id }).sort({ createdAt: -1 });
  if (!latest) {
    return {
      paymentStatus: "idle",
      collectionMethod: order.codCollectionMethod || "NONE",
      paid: false,
      amount: getCodDueAmount(order),
    };
  }

  if (latest.status === "pending" && latest.expiresAt && latest.expiresAt < new Date()) {
    latest.status = "expired";
    await latest.save();
  }

  if (latest.status === "pending") {
    try {
      const provider = getActivePaymentProvider();
      if (typeof provider.getPaymentLinkStatus === "function") {
        const linkStatus = await provider.getPaymentLinkStatus({
          linkId: latest.merchantOrderId,
        });
        const nextStatus = provider.mapStatusToInternal(linkStatus.state);
        if (nextStatus === PAYMENT_STATUS.CAPTURED) {
          await applyCodQrWebhook({
            merchantOrderId: latest.merchantOrderId,
            nextStatus,
            decoded: { transactionId: linkStatus.transactionId, raw: linkStatus.gatewayResponse },
          });
          return {
            paymentStatus: "PAID",
            collectionMethod: "UPI_QR",
            paid: true,
            amount: latest.amount,
            transactionId: linkStatus.transactionId,
          };
        }
      }
    } catch (error) {
      logger.warn("cod_qr_link_status_poll_failed", { error: error.message });
    }
  }

  return {
    paymentStatus: latest.status,
    collectionMethod: order.codCollectionMethod || "NONE",
    paid: false,
    amount: latest.amount,
    merchantOrderId: latest.merchantOrderId,
    qrPayload: latest.status === "pending" ? latest.qrPayload : null,
    expiresAt: latest.expiresAt,
  };
}

export async function applyCodQrWebhook({ merchantOrderId, nextStatus, decoded }) {
  const qrPayment = await CodQrPayment.findOne({ merchantOrderId });
  if (!qrPayment) {
    return { accepted: true, ignored: true, reason: "COD QR request not found" };
  }

  if (qrPayment.status === "completed") {
    return { accepted: true, duplicate: true, paymentStatus: nextStatus };
  }

  if (nextStatus === PAYMENT_STATUS.CAPTURED) {
    const order = await Order.findById(qrPayment.order);
    if (!order) {
      return { accepted: true, ignored: true, reason: "Order not found" };
    }

    const paidAmount = extractPaidAmount(decoded);
    const expected = roundCurrency(qrPayment.amount);
    if (paidAmount > 0 && Math.abs(paidAmount - expected) > 0.05) {
      logger.error("cod_qr_amount_mismatch", {
        merchantOrderId,
        paidAmount,
        expected,
      });
      qrPayment.status = "failed";
      qrPayment.gatewayPaymentId = decoded?.transactionId || qrPayment.gatewayPaymentId;
      await qrPayment.save();
      return { accepted: true, ignored: true, reason: "Amount mismatch" };
    }

    await handleCodUpiQrFinance(order._id, {
      amount: expected,
      deliveryPartnerId: qrPayment.deliveryBoy,
      merchantOrderId,
      transactionId: decoded?.transactionId || null,
      gatewayPaymentId: decoded?.transactionId || qrPayment.gatewayPaymentId,
    });

    qrPayment.status = "completed";
    qrPayment.gatewayPaymentId = decoded?.transactionId || qrPayment.gatewayPaymentId;
    await qrPayment.save();
  } else if (nextStatus === PAYMENT_STATUS.FAILED || nextStatus === PAYMENT_STATUS.CANCELLED) {
    qrPayment.status = "failed";
    qrPayment.gatewayPaymentId = decoded?.transactionId || qrPayment.gatewayPaymentId;
    await qrPayment.save();
  }

  return { accepted: true, paymentStatus: nextStatus };
}
