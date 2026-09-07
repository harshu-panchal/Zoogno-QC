import handleResponse from "../../utils/helper.js";
import getPagination from "../../utils/pagination.js";
import { validateBody } from "../../middleware/validate.js";
import {
  assignPartnersSchema,
  campaignBodySchema,
  campaignUpdateSchema,
  eligiblePartnersQuerySchema,
} from "./incentive.validation.js";
import * as incentiveService from "./incentive.service.js";

function adminId(req) {
  return req.user?._id || req.user?.id;
}

function deliveryId(req) {
  return req.user?._id || req.user?.id;
}

export async function createCampaign(req, res) {
  try {
    const body = validateBody(campaignBodySchema, req.body);
    const result = await incentiveService.createCampaign(body, adminId(req));
    return handleResponse(res, 201, "Incentive created", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function updateCampaign(req, res) {
  try {
    const body = validateBody(campaignUpdateSchema, req.body);
    const result = await incentiveService.updateCampaign(req.params.id, body, adminId(req));
    return handleResponse(res, 200, "Incentive updated", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function listCampaigns(req, res) {
  try {
    const { page, limit } = getPagination(req, { defaultLimit: 20, maxLimit: 100 });
    const result = await incentiveService.listCampaigns({
      status: req.query.status,
      page,
      limit,
    });
    return handleResponse(res, 200, "Incentives fetched", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function getCampaign(req, res) {
  try {
    const result = await incentiveService.getCampaignById(req.params.id);
    return handleResponse(res, 200, "Incentive fetched", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function setCampaignStatus(req, res) {
  try {
    const status = String(req.body?.status || "").trim();
    const result = await incentiveService.setCampaignStatus(req.params.id, status);
    return handleResponse(res, 200, `Incentive ${status}`, result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function listCampaignProgress(req, res) {
  try {
    const { page, limit } = getPagination(req, { defaultLimit: 25, maxLimit: 100 });
    const result = await incentiveService.listCampaignProgress(req.params.id, {
      status: req.query.status,
      page,
      limit,
    });
    return handleResponse(res, 200, "Incentive progress fetched", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function assignPartners(req, res) {
  try {
    const body = validateBody(assignPartnersSchema, req.body);
    const result = await incentiveService.assignPartners(req.params.id, body, adminId(req));
    return handleResponse(res, 200, "Partners assigned", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function previewEligiblePartners(req, res) {
  try {
    const query = { ...req.query };
    if (query.zoneIds != null && !Array.isArray(query.zoneIds)) {
      query.zoneIds = String(query.zoneIds).split(",").map((s) => s.trim()).filter(Boolean);
    }
    const filters = validateBody(eligiblePartnersQuerySchema, query);
    const { page, limit } = getPagination(req, { defaultLimit: 25, maxLimit: 200 });
    const result = await incentiveService.previewEligiblePartners(filters, { page, limit });
    return handleResponse(res, 200, "Eligible partners fetched", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function getMyActiveOffers(req, res) {
  try {
    const result = await incentiveService.getMyActiveOffers(deliveryId(req));
    return handleResponse(res, 200, "Active incentives fetched", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function getMyIncentiveHistory(req, res) {
  try {
    const { page, limit } = getPagination(req, { defaultLimit: 50, maxLimit: 100 });
    const result = await incentiveService.getMyIncentiveHistory(deliveryId(req), { page, limit });
    return handleResponse(res, 200, "Incentive history fetched", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}
