import handleResponse from "../../utils/helper.js";
import Admin from "../../models/admin.js";
import { BENEFICIARY_TYPE } from "../../models/settlementPayout.js";
import { getSettlementDateRange } from "../../utils/settlementPeriod.js";
import {
  getBeneficiarySummary,
  getPayoutHistory,
  createPayout,
  cancelPayout,
  getPayoutById,
  listPayouts,
  listBeneficiaries,
  getAdminDashboardSummary,
  getRemainingPayable,
  reconcileCashfreeTransferStatus,
} from "../../services/finance/settlementService.js";

function resolveBeneficiaryType(typeParam) {
  const normalized = String(typeParam || "").toUpperCase();
  if (normalized === "SELLER" || normalized === "SELLERS") return BENEFICIARY_TYPE.SELLER;
  if (normalized === "DELIVERY_PARTNER" || normalized === "DELIVERY_PARTNERS" || normalized === "DELIVERY") {
    return BENEFICIARY_TYPE.DELIVERY_PARTNER;
  }
  return null;
}

async function getRequestingAdminName(req) {
  const admin = await Admin.findById(req.user.id).select("name email").lean();
  return admin?.name || admin?.email || "";
}

function resolveDateRange(req) {
  const { period, startDate, endDate } = req.query;
  if (!period || period === "overall" || period === "all") return null;
  return getSettlementDateRange(period, startDate, endDate);
}

/* GET /api/settlements/sellers or /api/settlements/delivery-partners */
export const getBeneficiaries = async (req, res, beneficiaryTypeOverride) => {
  try {
    const beneficiaryType = beneficiaryTypeOverride || resolveBeneficiaryType(req.query.type);
    if (!beneficiaryType) {
      return handleResponse(res, 400, "Invalid or missing beneficiary type");
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const data = await listBeneficiaries(beneficiaryType, {
      search: req.query.search || "",
      status: req.query.status || "",
      dateRange: resolveDateRange(req),
      page,
      limit,
    });

    return handleResponse(res, 200, "Beneficiaries fetched", data);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getSellerBeneficiaries = (req, res) => getBeneficiaries(req, res, BENEFICIARY_TYPE.SELLER);
export const getDeliveryBeneficiaries = (req, res) => getBeneficiaries(req, res, BENEFICIARY_TYPE.DELIVERY_PARTNER);

/* GET /api/settlements/seller/:sellerId and /api/settlements/delivery-partner/:partnerId */
export const getBeneficiaryDetail = async (req, res, beneficiaryTypeOverride) => {
  try {
    const beneficiaryType = beneficiaryTypeOverride || resolveBeneficiaryType(req.query.type);
    const beneficiaryId = req.params.sellerId || req.params.partnerId || req.params.userId;
    if (!beneficiaryType || !beneficiaryId) {
      return handleResponse(res, 400, "Invalid request");
    }

    // Non-admins may only view their own settlement record.
    if (req.user.role !== "admin" && String(req.user.id) !== String(beneficiaryId)) {
      return handleResponse(res, 403, "Access denied");
    }

    const summary = await getBeneficiarySummary(beneficiaryType, beneficiaryId);
    return handleResponse(res, 200, "Beneficiary settlement summary fetched", summary);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getSellerBeneficiaryDetail = (req, res) => getBeneficiaryDetail(req, res, BENEFICIARY_TYPE.SELLER);
export const getDeliveryBeneficiaryDetail = (req, res) => getBeneficiaryDetail(req, res, BENEFICIARY_TYPE.DELIVERY_PARTNER);

/* GET /api/settlements/summary */
export const getDashboardSummary = async (req, res) => {
  try {
    const [sellerSummary, deliverySummary] = await Promise.all([
      getAdminDashboardSummary(BENEFICIARY_TYPE.SELLER),
      getAdminDashboardSummary(BENEFICIARY_TYPE.DELIVERY_PARTNER),
    ]);

    return handleResponse(res, 200, "Settlement dashboard summary fetched", {
      seller: sellerSummary,
      deliveryPartner: deliverySummary,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* GET /api/settlements/history/:userId */
export const getBeneficiaryHistory = async (req, res) => {
  try {
    const roleDefaultType = req.user.role === "seller"
      ? BENEFICIARY_TYPE.SELLER
      : req.user.role === "delivery"
        ? BENEFICIARY_TYPE.DELIVERY_PARTNER
        : null;
    const beneficiaryType = resolveBeneficiaryType(req.query.type) || roleDefaultType;
    if (!beneficiaryType) {
      return handleResponse(res, 400, "type query param (SELLER | DELIVERY_PARTNER) is required");
    }

    if (req.user.role !== "admin" && String(req.user.id) !== String(req.params.userId)) {
      return handleResponse(res, 403, "Access denied");
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const history = await getPayoutHistory(beneficiaryType, req.params.userId, { page, limit });
    return handleResponse(res, 200, "Payout history fetched", history);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* POST /api/settlements/payout */
export const createSettlementPayout = async (req, res) => {
  try {
    const beneficiaryType = resolveBeneficiaryType(req.body.beneficiaryType);
    const { beneficiaryId, amount, paymentMethod, transactionReference, paymentDate, notes } = req.body;

    if (!beneficiaryType || !beneficiaryId || !paymentMethod) {
      return handleResponse(res, 400, "beneficiaryType, beneficiaryId and paymentMethod are required");
    }

    const payout = await createPayout({
      beneficiaryType,
      beneficiaryId,
      amount,
      paymentMethod,
      transactionReference,
      paymentDate,
      notes,
      adminId: req.user.id,
      adminName: await getRequestingAdminName(req),
    });

    return handleResponse(res, 201, "Payout recorded successfully", payout);
  } catch (error) {
    return handleResponse(res, 400, error.message);
  }
};

/* GET /api/settlements/payouts */
export const getAllPayouts = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const data = await listPayouts({
      beneficiaryType: resolveBeneficiaryType(req.query.type) || undefined,
      status: req.query.status || undefined,
      dateRange: resolveDateRange(req),
      page,
      limit,
    });

    return handleResponse(res, 200, "Payouts fetched", data);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* GET /api/settlements/payout/:payoutId */
export const getSettlementPayoutById = async (req, res) => {
  try {
    const payout = await getPayoutById(req.params.payoutId);
    return handleResponse(res, 200, "Payout fetched", payout);
  } catch (error) {
    return handleResponse(res, 404, error.message);
  }
};

/* PUT /api/settlements/payout/:payoutId/cancel */
export const cancelSettlementPayout = async (req, res) => {
  try {
    const payout = await cancelPayout(req.params.payoutId, {
      adminId: req.user.id,
      adminName: await getRequestingAdminName(req),
      reason: req.body.reason || "",
    });

    return handleResponse(res, 200, "Payout cancelled", payout);
  } catch (error) {
    return handleResponse(res, 400, error.message);
  }
};

/* GET /api/settlements/payout/:payoutId/refresh-status — manual reconciliation fallback for Cashfree transfers. */
export const refreshSettlementPayoutStatus = async (req, res) => {
  try {
    const payout = await reconcileCashfreeTransferStatus(req.params.payoutId);
    return handleResponse(res, 200, "Payout status refreshed", payout);
  } catch (error) {
    return handleResponse(res, 400, error.message);
  }
};

/* Used by the "Create Payout" modal to preview earned/paid/remaining before submit. */
export const getBeneficiaryRemaining = async (req, res) => {
  try {
    const beneficiaryType = resolveBeneficiaryType(req.query.type);
    const beneficiaryId = req.params.sellerId || req.params.partnerId || req.params.userId;
    if (!beneficiaryType || !beneficiaryId) {
      return handleResponse(res, 400, "Invalid request");
    }

    const data = await getRemainingPayable(beneficiaryType, beneficiaryId);
    return handleResponse(res, 200, "Remaining payable fetched", data);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
