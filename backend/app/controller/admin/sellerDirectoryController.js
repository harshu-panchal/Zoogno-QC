import handleResponse from "../../utils/helper.js";
import getPagination from "../../utils/pagination.js";
import {
  getActiveSellersData,
  getSellerLocationsData,
  getSellerOptions,
} from "../../services/admin/sellerDirectoryService.js";
import { getIO } from "../../socket/socketManager.js";
import { invalidate, buildKey } from "../../services/cacheService.js";
import Seller from "../../models/seller.js";
import { uploadToCloudinary } from "../../services/mediaService.js";

export const getSellerLocations = async (req, res) => {
  try {
    const {
      q = "",
      category = "all",
      city = "all",
      lifecycle = "all",
      mapLimit: rawMapLimit = "500",
      sort = "orders_desc",
    } = req.query;

    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 100,
    });

    const data = await getSellerLocationsData({
      q,
      category,
      city,
      lifecycle,
      mapLimit: rawMapLimit,
      sort,
      page,
      limit,
      skip,
    });

    return handleResponse(res, 200, "Seller locations fetched successfully", data);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getActiveSellers = async (req, res) => {
  try {
    const { q = "", category = "all", sort = "recent" } = req.query;
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const data = await getActiveSellersData({
      q,
      category,
      sort,
      page,
      limit,
      skip,
    });

    return handleResponse(res, 200, "Active sellers fetched successfully", data);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getSellers = async (req, res) => {
  try {
    const sellers = await getSellerOptions();
    return handleResponse(res, 200, "Sellers fetched", sellers);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const deleteSeller = async (req, res) => {
  try {
    const { id } = req.params;
    const seller = await Seller.findByIdAndDelete(id);
    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }
    return handleResponse(res, 200, "Seller deleted successfully", seller);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const forceToggleStoreStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isOnline } = req.body;
    
    if (typeof isOnline !== 'boolean') {
      return handleResponse(res, 400, "isOnline must be a boolean");
    }

    const seller = await Seller.findByIdAndUpdate(
      id,
      { isOnline },
      { new: true }
    );

    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }

    // Invalidate product caches that might contain this seller's products
    invalidate(buildKey("products", "list", "*"));
    invalidate(buildKey("sellers", "nearby", "*"));
    invalidate(buildKey("category", "list", "*"));

    // Emit socket event to customers and the seller themselves
    try {
      const io = getIO();
      if (io) {
        io.to("customer:online").emit("seller-status-updated", {
          sellerId: seller._id,
          isOnline: seller.isOnline,
        });
        io.to(`seller:${seller._id}`).emit("store-status-updated", {
          isOnline: seller.isOnline,
        });
      }
    } catch (socketError) {
      console.warn("Socket emission failed for admin store status:", socketError.message);
    }

    return handleResponse(res, 200, "Store status updated by admin", {
      isOnline: seller.isOnline
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updateSellerStorefrontImage = async (req, res) => {
  try {
    const { id } = req.params;
    const file = req.file;

    if (!file) {
      return handleResponse(res, 400, "No image provided");
    }

    const seller = await Seller.findById(id);
    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }

    const url = await uploadToCloudinary(file.buffer, "sellers/storefront", {
      mimeType: file.mimetype,
      resourceType: "image",
    });

    seller.storefrontImage = url;
    await seller.save();

    invalidate(buildKey("sellers", "nearby", "*"));

    return handleResponse(res, 200, "Storefront image updated successfully", {
      storefrontImage: url,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
