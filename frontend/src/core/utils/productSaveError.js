export function getProductSaveErrorMessage(error) {
  const serverMessage = error?.response?.data?.message;
  if (serverMessage) return serverMessage;

  if (error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT") {
    return "Product save timed out. It may still have completed; refresh the product list before trying again.";
  }

  const status = error?.response?.status;
  if (status) {
    return `Failed to save product (HTTP ${status}). Please try again.`;
  }

  if (error?.message === "Network Error") {
    return "Could not reach the server. Check your connection and try again.";
  }

  return error?.message || "Failed to save product";
}
