import DeliveryBonus from "../models/deliveryBonus.js";
import Delivery from "../models/delivery.js";

// @desc    Get all delivery partners with bank details
// @route   GET /api/delivery-bonus/partners
// @access  Admin
export const getDeliveryPartnersWithBankDetails = async (req, res) => {
    try {
        const partners = await Delivery.find(
            { role: "delivery" },
            "name phone vehicleType accountHolder accountNumber ifsc upiId profileImage isVerified isOnline"
        ).sort({ name: 1 });
        
        res.status(200).json({ success: true, count: partners.length, data: partners });
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
        const { deliveryId, amount, reason, paymentMethod, paymentReference } = req.body;
        const adminId = req.user._id;

        if (!deliveryId || !amount || !paymentReference) {
            return res.status(400).json({ success: false, message: "Please provide all required fields" });
        }

        const deliveryPartner = await Delivery.findById(deliveryId);
        if (!deliveryPartner) {
            return res.status(404).json({ success: false, message: "Delivery partner not found" });
        }

        const bonus = await DeliveryBonus.create({
            deliveryId,
            adminId,
            amount,
            reason: reason || "Bonus",
            paymentMethod: paymentMethod || "UPI",
            paymentReference,
            status: "paid"
        });

        res.status(201).json({ success: true, data: bonus, message: "Bonus recorded successfully" });
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
