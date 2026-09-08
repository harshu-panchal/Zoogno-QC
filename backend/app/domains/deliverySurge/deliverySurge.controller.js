import handleResponse from "../../utils/helper.js";
import getPagination from "../../utils/pagination.js";
import { validateBody } from "../../middleware/validate.js";
import {
  surgeRuleBodySchema,
  surgeRuleUpdateSchema,
  surgeStatusSchema,
} from "./deliverySurge.validation.js";
import * as deliverySurgeService from "./deliverySurge.service.js";

function adminId(req) {
  return req.user?._id || req.user?.id;
}

export async function listZones(req, res) {
  try {
    const result = await deliverySurgeService.listZonesForPicker();
    return handleResponse(res, 200, "Zones fetched", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function createRule(req, res) {
  try {
    const body = validateBody(surgeRuleBodySchema, req.body);
    const result = await deliverySurgeService.createRule(body, adminId(req));
    return handleResponse(res, 201, "Delivery surge created", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function updateRule(req, res) {
  try {
    const body = validateBody(surgeRuleUpdateSchema, req.body);
    const result = await deliverySurgeService.updateRule(req.params.id, body);
    return handleResponse(res, 200, "Delivery surge updated", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function listRules(req, res) {
  try {
    const { page, limit } = getPagination(req, { defaultLimit: 20, maxLimit: 100 });
    const result = await deliverySurgeService.listRules({
      status: req.query.status,
      zoneId: req.query.zoneId,
      search: req.query.search,
      page,
      limit,
    });
    return handleResponse(res, 200, "Delivery surges fetched", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function getRule(req, res) {
  try {
    const result = await deliverySurgeService.getRuleById(req.params.id);
    return handleResponse(res, 200, "Delivery surge fetched", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function setStatus(req, res) {
  try {
    const body = validateBody(surgeStatusSchema, req.body);
    const result = await deliverySurgeService.setRuleStatus(req.params.id, body.status);
    return handleResponse(res, 200, `Delivery surge ${body.status}`, result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function deleteRule(req, res) {
  try {
    const result = await deliverySurgeService.deleteRule(req.params.id);
    return handleResponse(
      res,
      200,
      result.deleted ? "Delivery surge deleted" : "Delivery surge ended (already applied)",
      result,
    );
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}
