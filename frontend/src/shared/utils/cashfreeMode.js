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

let cashfreeSdkPromise = null;

/** Load the payment SDK only when a payment flow actually starts. */
export function loadCashfreeSdk() {
  if (typeof window === "undefined") return Promise.reject(new Error("Cashfree requires a browser"));
  if (typeof window.Cashfree === "function") return Promise.resolve(window.Cashfree);
  if (cashfreeSdkPromise) return cashfreeSdkPromise;

  cashfreeSdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-cashfree-sdk="v3"]');
    const script = existing || document.createElement("script");
    const onLoad = () => {
      if (typeof window.Cashfree === "function") resolve(window.Cashfree);
      else {
        script.remove();
        reject(new Error("Cashfree SDK loaded without exposing Cashfree"));
      }
    };
    const onError = () => {
      script.remove();
      reject(new Error("Unable to load Cashfree SDK"));
    };

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!existing) {
      script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
      script.async = true;
      script.dataset.cashfreeSdk = "v3";
      document.head.appendChild(script);
    }
  }).catch((error) => {
    cashfreeSdkPromise = null;
    throw error;
  });

  return cashfreeSdkPromise;
}
