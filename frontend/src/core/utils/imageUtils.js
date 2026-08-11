/**
 * Legacy Cloudinary URL checker
 * Kept for backward compatibility, but transformations are now disabled
 * as all images are processed on the server-side via VPS storage.
 */
export function isCloudinaryUrl(url) {
  return !!url && /res\.cloudinary\.com/i.test(url);
}

/**
 * Bypasses Cloudinary transforms and returns the original URL.
 * Server-side Sharp integration handles image optimisation natively now.
 */
export function applyCloudinaryTransform(url, params = "") {
  return url;
}

/**
 * Bypasses Cloudinary SrcSet generation.
 */
export function buildCloudinarySrcSet(url, entries, baseParams = "") {
  return undefined;
}
