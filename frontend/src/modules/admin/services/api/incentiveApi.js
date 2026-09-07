import axiosInstance from "@core/api/axios";

export const adminIncentiveApi = {
  list: (params) => axiosInstance.get("/incentives", { params }),
  get: (id) => axiosInstance.get(`/incentives/${id}`),
  create: (data) => axiosInstance.post("/incentives", data),
  update: (id, data) => axiosInstance.put(`/incentives/${id}`, data),
  setStatus: (id, status) => axiosInstance.patch(`/incentives/${id}/status`, { status }),
  getProgress: (id, params) => axiosInstance.get(`/incentives/${id}/progress`, { params }),
  assignPartners: (id, data) => axiosInstance.post(`/incentives/${id}/assign`, data),
  eligiblePartners: (params) => axiosInstance.get("/incentives/eligible-partners", { params }),
};

export default adminIncentiveApi;
