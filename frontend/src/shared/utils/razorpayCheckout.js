/**
 * Razorpay Standard Checkout helper.
 *
 * The backend creates the Razorpay order and returns a `checkout` descriptor
 * ({ keyId, orderId, amount, currency, name, description, prefill }). This
 * helper lazily loads checkout.js (only when a payment actually starts) and
 * opens the popup.
 *
 * Payment confirmation is NOT trusted from the browser: on success we simply
 * send the user to `redirectUrl`, whose page asks our backend to verify the
 * payment with Razorpay (and the webhook confirms it independently).
 */

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

let razorpaySdkPromise = null;

export function loadRazorpaySdk() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay requires a browser"));
  }
  if (typeof window.Razorpay === "function") return Promise.resolve(window.Razorpay);
  if (razorpaySdkPromise) return razorpaySdkPromise;

  razorpaySdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-razorpay-sdk="checkout"]');
    const script = existing || document.createElement("script");
    const onLoad = () => {
      if (typeof window.Razorpay === "function") resolve(window.Razorpay);
      else {
        script.remove();
        reject(new Error("Razorpay SDK loaded without exposing Razorpay"));
      }
    };
    const onError = () => {
      script.remove();
      reject(new Error("Unable to load Razorpay checkout. Check your connection and try again."));
    };

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!existing) {
      script.src = CHECKOUT_SRC;
      script.async = true;
      script.dataset.razorpaySdk = "checkout";
      document.head.appendChild(script);
    }
  }).catch((error) => {
    razorpaySdkPromise = null;
    throw error;
  });

  return razorpaySdkPromise;
}

/**
 * Opens the Razorpay popup.
 *
 * @param {Object}   args
 * @param {Object}   args.checkout     Descriptor returned by the backend.
 * @param {string}   [args.redirectUrl] Where to go after a successful payment.
 * @param {Function} [args.onSuccess]  Called instead of redirecting, if given.
 * @returns {Promise<"success"|"dismissed">} Resolves when the popup is finished.
 */
export async function openRazorpayCheckout({ checkout, redirectUrl, onSuccess }) {
  if (!checkout?.orderId || !checkout?.keyId) {
    throw new Error("Payment gateway did not return a valid checkout session. Please try again.");
  }
  const Razorpay = await loadRazorpaySdk();

  return new Promise((resolve) => {
    const instance = new Razorpay({
      key: checkout.keyId,
      order_id: checkout.orderId,
      amount: checkout.amount,
      currency: checkout.currency || "INR",
      name: checkout.name || "Zoogno",
      description: checkout.description || "Order payment",
      prefill: checkout.prefill || {},
      theme: { color: "#16a34a" },
      handler: (response) => {
        resolve("success");
        if (typeof onSuccess === "function") {
          onSuccess(response);
        } else if (redirectUrl) {
          window.location.assign(redirectUrl);
        }
      },
      modal: {
        ondismiss: () => resolve("dismissed"),
      },
    });
    instance.open();
  });
}
