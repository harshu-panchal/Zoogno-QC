/**
 * Joi schemas for cart endpoints.
 *
 * Part of refactor P5.2 (add missing validation schemas). Schemas here are
 * the canonical source of truth — controllers should swap their inline
 * validation for these progressively via the shared `validate` middleware
 * factory at `app/middleware/validate.js`.
 *
 * Adoption is opt-in: introducing the schema does not break any current
 * call-site, and controllers continue using inline validation until they
 * are migrated one by one.
 */
import Joi from "joi";

const trimmedString = Joi.string().trim();
const objectIdLike = trimmedString.min(8).max(64);

/** POST /cart — add an item to the customer's cart. */
export const addToCartSchema = Joi.object({
  productId: objectIdLike.required(),
  quantity: Joi.number().integer().min(1).max(99).required(),
  variantSlot: trimmedString.max(64).optional(),
});

/** PATCH /cart/:productId — update quantity for an existing line item. */
export const updateCartItemSchema = Joi.object({
  quantity: Joi.number().integer().min(0).max(99).required(),
  variantSlot: trimmedString.max(64).optional(),
});

/** DELETE /cart/:productId — query-only payload variant. */
export const removeCartItemSchema = Joi.object({
  variantSlot: trimmedString.max(64).optional(),
});

/** POST /cart/merge — used when an anonymous cart is merged into a user cart on login. */
export const mergeCartSchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        productId: objectIdLike.required(),
        quantity: Joi.number().integer().min(1).max(99).required(),
        variantSlot: trimmedString.max(64).optional(),
      }),
    )
    .min(1)
    .required(),
});
