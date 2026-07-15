import { isTokenExpired } from "./token";

function extractTokenCandidate(rawValue) {
  if (rawValue == null) return null;

  const trimmed = String(rawValue).trim();
  if (!trimmed) return null;

  if (/^bearer\s+/i.test(trimmed)) {
    return trimmed.replace(/^bearer\s+/i, "").trim();
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      const nestedToken =
        parsed?.token ||
        parsed?.accessToken ||
        parsed?.jwt ||
        parsed?.result?.token ||
        null;
      return nestedToken ? extractTokenCandidate(nestedToken) : null;
    } catch {
      return trimmed;
    }
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return extractTokenCandidate(trimmed.slice(1, -1));
  }

  return trimmed;
}

export function normalizeStoredToken(rawValue) {
  const token = extractTokenCandidate(rawValue);
  return token ? String(token).trim() : null;
}

export function getStoredAuthToken(storageKey, { allowExpired = false } = {}) {
  const normalized = normalizeStoredToken(localStorage.getItem(storageKey));
  if (!normalized) return null;
  if (!allowExpired && isTokenExpired(normalized)) {
    // If a valid refresh token exists alongside the expired access token,
    // keep the user "authenticated" so the refresh mechanism can kick in
    // (either proactively in AuthContext or reactively via the axios interceptor).
    const refreshToken = getStoredRefreshToken(storageKey);
    if (refreshToken && !isTokenExpired(refreshToken)) {
      return normalized;
    }
    return null;
  }
  return normalized;
}

export function hasValidStoredAuthToken(storageKey) {
  return Boolean(getStoredAuthToken(storageKey));
}

export function getStoredRefreshToken(storageKey) {
  const rawValue = localStorage.getItem(storageKey);
  if (!rawValue) return null;
  const trimmed = String(rawValue).trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      return parsed?.refreshToken || null;
    } catch {
      return null;
    }
  }
  return null;
}
