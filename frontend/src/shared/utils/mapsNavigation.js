/**
 * Opens turn-by-turn directions to a destination, strictly preferring the native
 * Google Maps app over the in-browser/WebView Google Maps page.
 *
 * `https://www.google.com/maps/dir/...` relies on the OS/browser choosing to deep-link
 * into the app (Android App Links / iOS Universal Links), which many browsers and most
 * WebViews (including the one this app runs in) do NOT do reliably — they just render
 * the Google Maps website instead. This uses the explicit, OS-level mechanisms instead:
 *  - Android: an `intent://` URL with `package=com.google.android.apps.maps`, which
 *    launches the Maps app directly (falling back to its Play Store listing if it isn't
 *    installed) regardless of which browser/WebView is handling the link.
 *  - iOS: the Google Maps app's own `comgooglemaps://` URL scheme, with a timed fallback
 *    to Google Maps on the web if the app isn't installed (iOS gives no reliable signal
 *    that a custom scheme failed, so a short timeout + page-visibility check is the
 *    standard technique).
 *  - Everything else (desktop, unknown UA): the regular web directions link.
 */
export function openGoogleMapsDirections(lat, lng) {
  const webFallbackUrl =
    Number.isFinite(lat) && Number.isFinite(lng)
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
      : "https://maps.google.com";

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    window.open(webFallbackUrl, "_blank");
    return;
  }

  const ua =
    (typeof navigator !== "undefined" && (navigator.userAgent || navigator.vendor)) || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isAndroid = /Android/.test(ua);

  if (isAndroid) {
    const intentUrl =
      `intent://maps.google.com/maps?daddr=${lat},${lng}&navigate=yes` +
      `#Intent;scheme=https;package=com.google.android.apps.maps;` +
      `S.browser_fallback_url=${encodeURIComponent(webFallbackUrl)};end`;
    window.location.href = intentUrl;
    return;
  }

  if (isIOS) {
    const appUrl = `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
    let settled = false;

    const onVisibilityChange = () => {
      if (document.hidden) {
        // The app took over — cancel the web fallback.
        settled = true;
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    setTimeout(() => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (!settled) {
        window.location.href = webFallbackUrl;
      }
    }, 1500);

    window.location.href = appUrl;
    return;
  }

  window.open(webFallbackUrl, "_blank");
}

export default openGoogleMapsDirections;
