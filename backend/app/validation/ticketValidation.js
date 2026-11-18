/**
 * Joi schemas for support-ticket endpoints.
 * Refactor P5.2. Opt-in adoption — see orderValidation.js header.
 */
import Joi from "joi";

const trimmedString = Joi.string().trim();

export const createTicketSchema = Joi.object({
  subject: trimmedString.min(2).max(200).required(),
  description: trimmedString.min(2).max(5000).required(),
  priority: trimmedString.valid("low", "medium", "high").optional(),
  // Kept for backwards compatibility with existing clients. The controller derives
  // the actual type from the authenticated role and never trusts this value.
  userType: trimmedString
    .valid("Customer", "Seller", "Delivery", "Rider", "User")
    .optional(),
  mediaUrl: trimmedString.uri().max(2048).allow("", null).optional(),
  mediaType: trimmedString.max(40).allow("", null).optional(),
  mimeType: trimmedString.max(120).allow("", null).optional(),
  orderId: trimmedString.max(120).allow("").optional(),
  issueType: trimmedString
    .valid(
      "PRODUCT_DAMAGED",
      "CONDITION_MISMATCH",
      "DAMAGED_IN_DELIVERY",
      "WRONG_PRODUCT",
      "MISSING_PRODUCT",
      "SELLER_ISSUE",
      "DELIVERY_ISSUE",
      "OTHER",
    )
    .optional(),
  attachments: Joi.array().items(trimmedString.uri().max(2048)).max(6).optional(),
});

export const addTicketMessageSchema = Joi.object({
  text: trimmedString.max(5000).allow("", null).optional(),
  mediaUrl: trimmedString.uri().max(2048).allow("", null).optional(),
  mediaType: trimmedString.max(40).allow("", null).optional(),
  mimeType: trimmedString.max(120).allow("", null).optional(),
  // Legacy clients send this flag. Authorization is derived from req.user.role.
  isAdmin: Joi.boolean().optional(),
}).or("text", "mediaUrl");

export const updateTicketStatusSchema = Joi.object({
  status: trimmedString
    .valid("open", "processing", "closed")
    .required(),
});
