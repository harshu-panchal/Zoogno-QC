/**
 * Shared Joi request-validation utilities.
 *
 * Exposes two complementary entry points so that:
 *   1. New code can use `validate(schema)` as Express middleware on routes.
 *   2. Existing controllers that historically did inline validation via a
 *      local `validateWithJoi(schema, payload)` helper can switch to
 *      `validateBody(schema, payload)` with a one-line import change.
 *
 * Both share the same Joi options (`abortEarly: false`, `stripUnknown: true`)
 * and the same error contract so behaviour is identical to the previous
 * per-controller copies.
 */

const JOI_OPTIONS = Object.freeze({
  abortEarly: false,
  stripUnknown: true,
});

function joinJoiMessages(error) {
  return error.details.map((detail) => detail.message).join("; ");
}

/**
 * Express middleware factory. Validates `req.body` against the supplied Joi
 * schema, replaces `req.body` with the sanitized value on success, and
 * responds 400 with a uniform error envelope on failure.
 *
 *   router.post("/orders", validate(createOrderSchema), placeOrder);
 *
 * @param {import('joi').Schema} schema
 */
export function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, JOI_OPTIONS);
    if (error) {
      return res.status(400).json({
        success: false,
        error: true,
        message: joinJoiMessages(error),
      });
    }
    req.body = value;
    return next();
  };
}

/**
 * Imperative validator for controllers that need to validate a payload that
 * is NOT `req.body` (for example `req.query` or a hand-assembled object), or
 * that have to run additional logic between validation and the response.
 *
 * On failure it throws an Error with `statusCode = 400` so the controller's
 * existing try/catch + `handleResponse(res, error.statusCode || 500, ...)`
 * pattern keeps producing the same HTTP response.
 *
 * @param {import('joi').Schema} schema
 * @param {*} payload
 * @returns {*} the sanitized value
 */
export function validateBody(schema, payload) {
  const { error, value } = schema.validate(payload, JOI_OPTIONS);
  if (error) {
    const err = new Error(joinJoiMessages(error));
    err.statusCode = 400;
    throw err;
  }
  return value;
}

/**
 * Non-throwing variant. Returns a result object so the caller can decide how
 * to respond. Used by controllers that prefer the `{ isValid, value, message }`
 * pattern over try/catch.
 *
 * @param {import('joi').Schema} schema
 * @param {*} payload
 * @returns {{ isValid: boolean, value?: *, message?: string }}
 */
export function validateBodySafe(schema, payload) {
  const { error, value } = schema.validate(payload, JOI_OPTIONS);
  if (error) {
    return {
      isValid: false,
      message: joinJoiMessages(error),
    };
  }
  return { isValid: true, value };
}

export default validate;
