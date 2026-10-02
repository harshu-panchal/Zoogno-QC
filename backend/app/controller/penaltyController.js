import handleResponse from "../utils/helper.js";
import {
  applyPenalty,
  revokePenalty,
  listPenalties,
  getPenaltyDetail,
  listMyPenalties,
  getBeneficiaryOrders,
  getInvestigation,
} from "../services/penalty/penaltyService.js";
import {
  addEvidence,
  getEvidenceForActor,
} from "../services/penalty/orderEvidenceService.js";

const run = (handler) => async (req, res) => {
  try {
    return await handler(req, res);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

/* ---------------- Order evidence (seller / delivery partner / admin read) ---------------- */

export const uploadEvidence = run(async (req, res) => {
  const doc = await addEvidence({
    actor: { id: req.user.id, role: req.user.role },
    routeOrderId: req.params.orderId,
    images: req.body?.images,
    condition: req.body?.condition,
    note: req.body?.note,
  });
  return handleResponse(res, 200, "Photos saved", doc);
});

export const fetchEvidence = run(async (req, res) => {
  const data = await getEvidenceForActor({
    actor: { id: req.user.id, role: req.user.role },
    routeOrderId: req.params.orderId,
  });
  return handleResponse(res, 200, "Order evidence", data);
});

/* ---------------- Admin ---------------- */

export const adminInvestigation = run(async (req, res) => {
  const data = await getInvestigation(req.params.orderId);
  return handleResponse(res, 200, "Order investigation", data);
});

export const adminBeneficiaryOrders = run(async (req, res) => {
  const data = await getBeneficiaryOrders({
    type: req.query.type,
    beneficiaryId: req.query.beneficiaryId,
    search: req.query.search,
  });
  return handleResponse(res, 200, "Orders", { items: data });
});

export const adminApplyPenalty = run(async (req, res) => {
  const penalty = await applyPenalty({
    adminId: req.user.id,
    beneficiaryType: req.body?.beneficiaryType,
    beneficiaryId: req.body?.beneficiaryId,
    orderId: req.body?.orderId,
    productId: req.body?.productId,
    amount: req.body?.amount,
    reason: req.body?.reason,
    notes: req.body?.notes,
    evidenceUrls: req.body?.evidence,
    relatedTicketId: req.body?.relatedTicketId,
  });
  return handleResponse(res, 201, "Penalty applied", penalty);
});

export const adminListPenalties = run(async (req, res) => {
  const data = await listPenalties(req.query);
  return handleResponse(res, 200, "Penalties", data);
});

export const adminGetPenalty = run(async (req, res) => {
  const data = await getPenaltyDetail(req.params.id);
  return handleResponse(res, 200, "Penalty detail", data);
});

export const adminRevokePenalty = run(async (req, res) => {
  const data = await revokePenalty(req.params.id, {
    adminId: req.user.id,
    reason: req.body?.reason,
  });
  return handleResponse(res, 200, "Penalty revoked", data);
});

/* ---------------- Seller / delivery self view ---------------- */

export const myPenalties = run(async (req, res) => {
  const data = await listMyPenalties(req.user.role, req.user.id, req.query);
  return handleResponse(res, 200, "My penalties", data);
});
