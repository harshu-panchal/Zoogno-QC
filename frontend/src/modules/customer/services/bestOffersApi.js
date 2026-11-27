import { getWithDedupe } from "@core/api/dedupe";

export const bestOffersApi = {
  getBestOffers: (params) => getWithDedupe("/best-offers", params, { ttl: 30 * 1000 }),
};
