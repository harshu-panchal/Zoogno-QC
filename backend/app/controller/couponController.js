import Coupon from "../models/coupon.js";
import handleResponse from "../utils/helper.js";
import Order from "../models/order.js";
import { calculateCouponDiscount } from "../services/couponService.js";

export const listCoupons = async (req, res) => {
    try {
        const { status, search } = req.query;
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
        const { code, cartTotal, items, customerId } = req.body;
        const result = await calculateCouponDiscount({ code, cartTotal, items, customerId });
        return handleResponse(res, 200, "Coupon applied", result);
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

