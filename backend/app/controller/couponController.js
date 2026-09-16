import Coupon from "../models/coupon.js";
import handleResponse from "../utils/helper.js";
import Order from "../models/order.js";
import { calculateCouponDiscount } from "../services/couponService.js";
import { parseCustomerCoordinates, getCustomerZoneIds } from "../services/customerVisibilityService.js";
import { zoneVisibilityMatch } from "../utils/zoneVisibility.js";

export const listCoupons = async (req, res) => {
    try {
        const { status, search, lat, lng } = req.query;
        const query = {};

        if (status === "active") {
            const now = new Date();
            query.isActive = true;
            query.validFrom = { $lte: now };
            query.validTill = { $gte: now };
        } else if (status === "expired") {
            query.$or = [{ isActive: false }, { validTill: { $lt: new Date() } }];
        }

        if (search) {
            const term = search.trim();
            query.$or = [
                { code: { $regex: term, $options: "i" } },
                { title: { $regex: term, $options: "i" } },
                { description: { $regex: term, $options: "i" } },
            ];
        }

        // Only the customer-facing call sends lat/lng, so this scopes results
        // to the customer's zone(s) without affecting the admin coupon list
        // (which intentionally shows every coupon for management purposes).
        const coords = parseCustomerCoordinates({ lat, lng });
        if (coords.valid) {
            const customerZoneIds = await getCustomerZoneIds(coords.lat, coords.lng);
            Object.assign(query, zoneVisibilityMatch(customerZoneIds, "applicableZones"));
        }

        const coupons = await Coupon.find(query).sort({ createdAt: -1 }).lean();
        return handleResponse(res, 200, "Coupons fetched successfully", coupons);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

export const createCoupon = async (req, res) => {
    try {
        const data = { ...req.body };
        const coupon = await Coupon.create(data);
        return handleResponse(res, 201, "Coupon created successfully", coupon);
    } catch (error) {
        if (error.code === 11000) {
            return handleResponse(res, 400, "Coupon code already exists");
        }
        return handleResponse(res, 500, error.message);
    }
};

export const updateCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const data = { ...req.body };
        const coupon = await Coupon.findByIdAndUpdate(id, data, {
            new: true,
            runValidators: true,
        });
        if (!coupon) {
            return handleResponse(res, 404, "Coupon not found");
        }
        return handleResponse(res, 200, "Coupon updated successfully", coupon);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

export const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        await Coupon.findByIdAndDelete(id);
        return handleResponse(res, 200, "Coupon deleted successfully");
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

// Simple validation engine for checkout
export const validateCoupon = async (req, res) => {
    try {
        const { code, cartTotal, items, customerId, lat, lng } = req.body;
        const result = await calculateCouponDiscount({ code, cartTotal, items, customerId, lat, lng });
        return handleResponse(res, 200, "Coupon applied", result);
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

