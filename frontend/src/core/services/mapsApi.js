import axiosInstance from "@/core/api/axios";

/** Server-side Mapbox geocoding (auth required). */
export const mapsApi = {
  geocodeAddress: (address, params = {}) =>
    axiosInstance.get("/maps/geocode", { params: { address, ...params } }),

  reverseGeocode: (lat, lng, params = {}) =>
    axiosInstance.get("/maps/reverse-geocode", { params: { lat, lng, ...params } }),
};

/** Adapter for MapPicker `geocodeFn` prop. */
export async function mapPickerGeocodeFn({ address, lat, lng } = {}) {
  if (address) {
    return mapsApi.geocodeAddress(address);
  }
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return mapsApi.reverseGeocode(lat, lng);
  }
  throw new Error("address or lat/lng required");
}
