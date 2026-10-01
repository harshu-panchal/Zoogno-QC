import handleResponse from "../utils/helper.js";
import {
  getRiderCaseState,
  reachedCustomerLocation,
  recordCallAttempt,
  markCustomerUnreachable,
  listCases,
  getCaseDetail,
  getPendingCaseCount,
  adminCancelCase,
  adminRetryCase,
  getCustomerCharges,
  listCharges,
  waiveCharge,
  getEarningsSummary,
  reconcileAppliedCharges,
} from "../services/customerUnreachable/customerUnreachableService.js";

const run = (handler) => async (req, res) => {
  try {
    return await handler(req, res);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

const num = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/* ---------------- Delivery boy ---------------- */

export const riderGetState = run(async (req, res) => {
  const data = await getRiderCaseState(req.user.id, req.params.orderId);
  return handleResponse(res, 200, "Customer unreachable state", data);
});

export const riderReached = run(async (req, res) => {
  const data = await reachedCustomerLocation(req.user.id, req.params.orderId, {
    lat: num(req.body?.lat),
    lng: num(req.body?.lng),
  });
  return handleResponse(res, 200, "Marked as reached customer location", data);
});

export const riderCall = run(async (req, res) => {
  const data = await recordCallAttempt(req.user.id, req.params.orderId);
  return handleResponse(res, 200, "Call attempt recorded", data);
});

export const riderMarkUnreachable = run(async (req, res) => {
  const data = await markCustomerUnreachable(req.user.id, req.params.orderId, {
    lat: num(req.body?.lat),
    lng: num(req.body?.lng),
    note: req.body?.note,
  });
  return handleResponse(res, 200, "Reported to admin as customer unreachable", data);
});

/* ---------------- Admin ---------------- */

export const adminListCases = run(async (req, res) => {
  const { tab, search, page, limit } = req.query;
  const data = await listCases({ tab, search, page, limit });
  return handleResponse(res, 200, "Customer unreachable orders", data);
});

export const adminPendingCount = run(async (req, res) => {
  const count = await getPendingCaseCount();
  return handleResponse(res, 200, "Pending count", { count });
});

export const adminGetCase = run(async (req, res) => {
  const data = await getCaseDetail(req.params.caseId);
  return handleResponse(res, 200, "Case detail", data);
});

export const adminCancel = run(async (req, res) => {
  const data = await adminCancelCase(req.params.caseId, {
    adminId: req.user.id,
    chargeAmount: req.body?.chargeAmount,
    note: req.body?.note,
  });
  return handleResponse(res, 200, "Order cancelled – customer unreachable", data);
});

export const adminRetry = run(async (req, res) => {
  const data = await adminRetryCase(req.params.caseId, {
    adminId: req.user.id,
    note: req.body?.note,
  });
  return handleResponse(res, 200, "Delivery retry approved", data);
});

export const adminListCharges = run(async (req, res) => {
  await reconcileAppliedCharges();
  const { status, search, page, limit } = req.query;
  const data = await listCharges({ status, search, page, limit });
  return handleResponse(res, 200, "Unreachable charges", data);
});

export const adminWaive = run(async (req, res) => {
  const data = await waiveCharge(req.params.chargeId, {
    adminId: req.user.id,
    reason: req.body?.reason,
  });
  return handleResponse(res, 200, "Charge waived", data);
});

export const adminEarnings = run(async (req, res) => {
  const data = await getEarningsSummary();
  return handleResponse(res, 200, "Unreachable charge earnings", data);
});

/* ---------------- Customer ---------------- */

export const customerMyCharges = run(async (req, res) => {
  const data = await getCustomerCharges(req.user.id);
  return handleResponse(res, 200, "Pending charges", data);
});
