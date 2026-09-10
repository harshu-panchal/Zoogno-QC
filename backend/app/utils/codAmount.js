import { roundCurrency } from "./money.js";

export function getCodDueAmount(order) {
  const gross = Number(
    order?.paymentBreakdown?.grandTotal ?? order?.pricing?.total ?? 0,
  );
  const wallet = Number(
    order?.paymentBreakdown?.walletAmount ?? order?.pricing?.walletAmount ?? 0,
  );
  return roundCurrency(Math.max(0, gross - wallet));
}

export function isCodOrder(order) {
  const method = String(order?.payment?.method || "").toLowerCase();
  return (
    order?.paymentMode === "COD" || method === "cash" || method === "cod"
  );
}

export function isCodAlreadyCollected(order) {
  return Boolean(
    order?.financeFlags?.codMarkedCollected ||
      order?.codCollectionMethod === "UPI_QR" ||
      order?.codCollectionMethod === "CASH",
  );
}
