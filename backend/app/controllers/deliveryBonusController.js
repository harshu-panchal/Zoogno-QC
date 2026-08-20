import DeliveryBonus from "../models/deliveryBonus.js";
import Delivery from "../models/delivery.js";
import Transaction from "../models/transaction.js";
import Order from "../models/order.js";
import { invalidateDeliveryCaches } from "../services/delivery/deliveryEarningsService.js";

// @desc    Get all delivery partners with bank details
// @route   GET /api/delivery-bonus/partners
// @access  Admin
export const getDeliveryPartnersWithBankDetails = async (req, res) => {
    try {
        const partners = await Delivery.find(
            { role: "delivery" },
            "name phone vehicleType accountHolder accountNumber ifsc upiId profileImage isVerified isOnline averageRating totalRatings createdAt"
        ).sort({ name: 1 }).lean();

        const deliveryCounts = await Order.aggregate([
            { $match: { deliveryBoy: { $in: partners.map((p) => p._id) }, status: "delivered" } },
            { $group: { _id: "$deliveryBoy", count: { $sum: 1 } } },
        ]);
        const countByPartner = new Map(deliveryCounts.map((d) => [String(d._id), d.count]));

        const data = partners.map((p) => ({
            ...p,
            totalDeliveries: countByPartner.get(String(p._id)) || 0,
        }));

        res.status(200).json({ success: true, count: data.length, data });
    } catch (error) {
        console.error("Error in getDeliveryPartnersWithBankDetails:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// @desc    Grant a bonus to a delivery partner
// @route   POST /api/delivery-bonus/grant
// @access  Admin
export const grantBonus = async (req, res) => {
    try {
        const { deliveryId, amount, reason } = req.body;
        const adminId = req.user._id;

        if (!deliveryId || !amount || Number(amount) <= 0) {
            return res.status(400).json({ success: false, message: "Please provide a delivery partner and a valid amount" });
        }

        const deliveryPartner = await Delivery.findById(deliveryId);
        if (!deliveryPartner) {
            return res.status(404).json({ success: false, message: "Delivery partner not found" });
        }

        const transactionRef = `BONUS-${Date.now()}`;

        // Credits the rider's actual withdrawable balance — computeWithdrawableBalance()
        // sums every Settled Transaction regardless of type, so this Bonus transaction
        // is immediately included in the rider's available-to-withdraw figure, and shows
        // up tagged "Bonus" in their transaction history / earnings feed like any other
        // earning. Previously grantBonus() only wrote a DeliveryBonus audit row with no
        // Transaction at all, so the amount never actually reached the rider's balance.
        await Transaction.create({
            user: deliveryId,
            userModel: "Delivery",
            type: "Bonus",
            amount: Math.abs(Number(amount)),
            status: "Settled",
            reference: transactionRef,
            meta: { reason: reason || "Bonus" },
        });

        const bonus = await DeliveryBonus.create({
            deliveryId,
            adminId,
            amount,
            reason: reason || "Bonus",
            transactionRef,
            status: "paid"
        });

        await invalidateDeliveryCaches(deliveryId).catch(() => {});

        res.status(201).json({ success: true, data: bonus, message: "Bonus credited to rider's wallet" });
    } catch (error) {
        console.error("Error in grantBonus:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// @desc    Get bonus history (for Admin)
// @route   GET /api/delivery-bonus/history
// @access  Admin
export const getBonusHistory = async (req, res) => {
    try {
        const history = await DeliveryBonus.find()
            .populate("deliveryId", "name phone profileImage")
            .populate("adminId", "name email")
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, count: history.length, data: history });
    } catch (error) {
        console.error("Error in getBonusHistory:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// @desc    Get bonuses for the logged-in delivery partner
// @route   GET /api/delivery-bonus/my-bonuses
// @access  Delivery
export const getMyBonuses = async (req, res) => {
    try {
        const deliveryId = req.user._id;

        const bonuses = await DeliveryBonus.find({ deliveryId })
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, count: bonuses.length, data: bonuses });
    } catch (error) {
        console.error("Error in getMyBonuses:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};
