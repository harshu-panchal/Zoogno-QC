import axiosInstance from "@core/api/axios";

export const deliveryBonusApi = {
  getPartners: () => axiosInstance.get("/delivery-bonus/partners"),
  grantBonus: (data) => axiosInstance.post("/delivery-bonus/grant", data),
  getHistory: () => axiosInstance.get("/delivery-bonus/history"),
};
