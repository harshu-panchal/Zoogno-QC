export function getMapboxAccessToken() {
  return import.meta.env.VITE_MAPBOX_ACCESS_TOKEN?.trim() || "";
}

export function getMapboxStyleUrl() {
  return (
    import.meta.env.VITE_MAPBOX_STYLE?.trim() ||
    "mapbox://styles/mapbox/light-v11"
  );
}

export function isMapboxConfigured() {
  const token = getMapboxAccessToken();
  return Boolean(token && !token.includes("dummy"));
}
