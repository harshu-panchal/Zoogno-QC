import Coupon from "../models/coupon.js";
import Order from "../models/order.js";

/**
 * Validates a coupon and calculates the discount amount.
 * Throws an error with `statusCode` if validation fails.
 */
export const calculateCouponDiscount = async ({ code, cartTotal, items, customerId }) => {
    if (!code) {
        const err = new Error("Coupon code is required");
        err.statusCode = 400;
        throw err;
    }

    const now = new Date();
    const coupon = await Coupon.findOne({ code: String(code).toUpperCase() });
    if (!coupon) {
        const err = new Error("Invalid coupon code");
        err.statusCode = 404;
        throw err;
    }

    if (!coupon.isActive || coupon.validFrom > now || coupon.validTill < now) {
        const err = new Error("This coupon is not active");
        err.statusCode = 400;
        throw err;
    }

    // Usage limits (overall)
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
        const err = new Error("This coupon has reached its usage limit");
        err.statusCode = 400;
        throw err;
    }

    // Per-user limit & monthly volume – basic implementation
    let userUsageCount = 0;
    let monthlyVolume = 0;
    if (customerId) {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const userOrders = await Order.find({
            customer: customerId,
            createdAt: { $gte: monthStart, $lte: now },
        }).lean();

        monthlyVolume = userOrders.reduce(
            (sum, o) => sum + (o.pricing?.total || 0),
            0
        );

        userUsageCount = 0;
    }

    if (coupon.perUserLimit && userUsageCount >= coupon.perUserLimit) {
        const err = new Error("You have already used this coupon");
        err.statusCode = 400;
        throw err;
    }

    if (
        coupon.couponType === "monthly_volume" &&
        coupon.monthlyVolumeThreshold &&
        monthlyVolume < coupon.monthlyVolumeThreshold
    ) {
        const err = new Error("This coupon is for high-volume buyers only");
        err.statusCode = 400;
        throw err;
    }

    // Base conditions
    if (coupon.minOrderValue && cartTotal < coupon.minOrderValue) {
        const err = new Error(`Minimum order value should be ₹${coupon.minOrderValue}`);
        err.statusCode = 400;
        throw err;
    }

    const totalQuantity = Array.isArray(items) 
        ? items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0)
        : 0;
        
    if (coupon.minItems && totalQuantity < coupon.minItems) {
        const err = new Error(`Add at least ${coupon.minItems} items to use this coupon`);
        err.statusCode = 400;
        throw err;
    }

    // Category based condition
    if (
        coupon.couponType === "category_based" &&
        Array.isArray(coupon.applicableCategories) &&
        coupon.applicableCategories.length > 0
    ) {
        const hasEligibleItem =
            Array.isArray(items) &&
            items.some((i) => {
                const itemCatIds = [
                    String(i.categoryId),
                    String(i.headerId),
                    String(i.subcategoryId),
                    String(i.category?._id),
                    String(i.headerCategoryId)
                ].filter(id => id && id !== 'undefined' && id !== 'null');
                
                return coupon.applicableCategories.some((cId) =>
                    itemCatIds.includes(String(cId))
                );
            });
        if (!hasEligibleItem) {
            const err = new Error("This coupon is valid only on selected categories");
            err.statusCode = 400;
            throw err;
        }
    }

    // Calculate discount
    let discountAmount = 0;
    let freeDelivery = false;

    if (coupon.discountType === "free_delivery") {
        freeDelivery = true;
    } else if (coupon.discountType === "percentage") {
        discountAmount = Math.round((cartTotal * coupon.discountValue) / 100);
    } else if (coupon.discountType === "fixed") {
        discountAmount = coupon.discountValue;
    }

    if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
        discountAmount = coupon.maxDiscount;
    }

    if (discountAmount <= 0 && !freeDelivery) {
        const err = new Error("This coupon does not provide any discount on current cart");
        err.statusCode = 400;
        throw err;
    }

    return {
        couponId: coupon._id,
        code: coupon.code,
        discountAmount,
        freeDelivery,
    };
};
