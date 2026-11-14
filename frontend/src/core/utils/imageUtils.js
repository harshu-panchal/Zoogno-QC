/**
 * Cloudinary URL checker — this deployment's product/media images are
 * genuinely served from res.cloudinary.com (confirmed against live data),
 * so transform application below is safe and live, not legacy.
 */
export function isCloudinaryUrl(url) {
  return !!url && /res\.cloudinary\.com/i.test(url);
}

export function isVpsVariantUrl(url) {
  if (!url || !/\/images\//i.test(url)) return false;
  try {
    const parsed = new URL(
      url,
      typeof window !== "undefined" ? window.location.origin : "http://localhost",
    );
    return /-w\d+\.(?:webp|avif|jpe?g|png)$/i.test(parsed.pathname)
      && parsed.searchParams.has("vw");
  } catch {
    return false;
  }
}

export function isVpsImageUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(
      url,
      typeof window !== "undefined" ? window.location.origin : "http://localhost",
    );
    return parsed.pathname.startsWith("/images/");
  } catch {
    return false;
  }
}

function getRequestedWidth(params = "") {
  const match = String(params).match(/(?:^|,)w_(\d+)(?:,|$)/i);
  return match ? Number(match[1]) : null;
}

function applyVpsWidth(url, requestedWidth) {
  if (!requestedWidth || !isVpsVariantUrl(url)) return url;
  try {
    const parsed = new URL(
      url,
      typeof window !== "undefined" ? window.location.origin : "http://localhost",
    );
    const widths = String(parsed.searchParams.get("vw") || "")
      .split(",")
      .map(Number)
      .filter((width) => Number.isFinite(width) && width > 0)
      .sort((a, b) => a - b);
    if (!widths.length) return url;
    const selected = widths.find((width) => width >= requestedWidth) || widths.at(-1);
    parsed.pathname = parsed.pathname.replace(/-w\d+(\.[^.]+)$/i, `-w${selected}$1`);
    return parsed.href;
  } catch {
    return url;
  }
}

function applyLegacyVpsWidth(url, requestedWidth) {
  if (!requestedWidth || !isVpsImageUrl(url)) return url;
  try {
    const parsed = new URL(
      url,
      typeof window !== "undefined" ? window.location.origin : "http://localhost",
    );
    const endpoint = new URL("/api/media/image", parsed.origin);
    endpoint.searchParams.set("src", parsed.pathname);
    endpoint.searchParams.set("w", String(requestedWidth));
    return endpoint.href;
  } catch {
    return url;
  }
}

/**
 * Inserts Cloudinary transformation params (e.g. "f_auto,q_auto,w_160") into
 * a Cloudinary delivery URL, right after the "/upload/" segment — the
 * standard way to request a resized/format-optimized variant without a
 * separate upload. Every call site already computes the right params for its
 * context (thumbnail vs. gallery); this used to discard them and always
 * serve the original full-resolution upload.
 *
 * Non-Cloudinary URLs (or anything malformed) pass through unchanged — never
 * mangle a URL we don't recognize.
 */
export function applyCloudinaryTransform(url, params = "") {
  if (!url || !params) return url;
  if (isVpsVariantUrl(url)) return applyVpsWidth(url, getRequestedWidth(params));
  if (isVpsImageUrl(url)) return applyLegacyVpsWidth(url, getRequestedWidth(params));
  if (!isCloudinaryUrl(url)) return url;

  const uploadMarker = "/upload/";
  const idx = url.indexOf(uploadMarker);
  if (idx === -1) return url;

  const insertAt = idx + uploadMarker.length;
  return `${url.slice(0, insertAt)}${params}/${url.slice(insertAt)}`;
}

/**
 * Builds a srcset string from a base Cloudinary URL and a list of
 * { width, params } (or plain width-number) entries, so <img> can let the
 * browser pick the right resolution for its layout/DPR instead of always
 * downloading one fixed size.
 */
export function buildCloudinarySrcSet(url, entries = [], baseParams = "") {
  if (
    !url ||
    (!isCloudinaryUrl(url) && !isVpsImageUrl(url)) ||
    !Array.isArray(entries) ||
    entries.length === 0
  ) {
    return undefined;
  }

  const parts = entries
    .map((entry) => {
      const width = typeof entry === "number" ? entry : (entry?.width || entry?.w);
      if (!width) return null;
      const entryParams = typeof entry === "object" && entry?.params ? entry.params : `w_${width}`;
      const params = [baseParams, entryParams].filter(Boolean).join(",");
      return `${applyCloudinaryTransform(url, params)} ${width}w`;
    })
    .filter(Boolean);

  return parts.length ? parts.join(", ") : undefined;
}
