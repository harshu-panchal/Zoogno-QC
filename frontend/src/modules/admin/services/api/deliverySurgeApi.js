import axiosInstance from "@core/api/axios";

export const adminDeliverySurgeApi = {
  list: (params) => axiosInstance.get("/delivery-surges", { params }),
  get: (id) => axiosInstance.get(`/delivery-surges/${id}`),
  create: (data) => axiosInstance.post("/delivery-surges", data),
  update: (id, data) => axiosInstance.put(`/delivery-surges/${id}`, data),
  setStatus: (id, status) =>
    axiosInstance.patch(`/delivery-surges/${id}/status`, { status }),
  remove: (id) => axiosInstance.delete(`/delivery-surges/${id}`),
  zones: () => axiosInstance.get("/delivery-surges/zones"),
};

export default adminDeliverySurgeApi;
