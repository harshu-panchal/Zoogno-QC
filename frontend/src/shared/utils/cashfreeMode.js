/**
 * Cashfree JS SDK mode must match the backend CASHFREE_BASE_URL / keys.
 * A production SDK + sandbox session_id returns:
 * payment_session_id is not present or is invalid
 */
export function getCashfreeCheckoutMode() {
  const env = String(
    import.meta.env.VITE_CASHFREE_MODE || import.meta.env.VITE_CASHFREE_ENV || "",
  )
    .trim()
    .toLowerCase();
  return env === "production" || env === "prod" ? "production" : "sandbox";
}
