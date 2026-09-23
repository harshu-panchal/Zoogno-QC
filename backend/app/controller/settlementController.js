import handleResponse from "../utils/helper.js";
import { BENEFICIARY_TYPE } from "../models/settlementPayout.js";
import {
  getBeneficiarySummary,
  getPayoutHistory,
} from "../services/finance/settlementService.js";

function beneficiaryTypeForRole(role) {
  if (role === "seller") return BENEFICIARY_TYPE.SELLER;
  if (role === "delivery") return BENEFICIARY_TYPE.DELIVERY_PARTNER;
  return null;
}

/* Seller/Delivery self-view: today/this-week/this-month/overall earned-paid-remaining. */
export const getMySettlementSummary = async (req, res) => {
  try {
    const beneficiaryType = beneficiaryTypeForRole(req.user.role);
    if (!beneficiaryType) {
      return handleResponse(res, 403, "Access denied");
    }

    const summary = await getBeneficiarySummary(beneficiaryType, req.user.id);
    return handleResponse(res, 200, "Settlement summary fetched", summary);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* Seller/Delivery self-view: paginated payout history. */
export const getMyPayoutHistory = async (req, res) => {
  try {
    const beneficiaryType = beneficiaryTypeForRole(req.user.role);
    if (!beneficiaryType) {
      return handleResponse(res, 403, "Access denied");
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const history = await getPayoutHistory(beneficiaryType, req.user.id, { page, limit });
    return handleResponse(res, 200, "Payout history fetched", history);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
