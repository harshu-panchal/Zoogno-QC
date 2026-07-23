import SosAlert from "../models/sosAlert.js";
import Delivery from "../models/delivery.js";
import { getIO } from "../socket/socketManager.js";
import Notification from "../models/notification.js";

export const triggerSos = async (req, res) => {
    try {
        const deliveryId = req.user.id;
        const { location } = req.body; // e.g. { type: "Point", coordinates: [lng, lat] }

        const deliveryBoy = await Delivery.findById(deliveryId).select("name phone emergencyContacts");
        if (!deliveryBoy) {
            return res.status(404).json({ success: false, message: "Delivery boy not found" });
        }

        const sosAlert = await SosAlert.create({
            deliveryBoy: deliveryId,
            location: location || { type: "Point", coordinates: [0, 0] },
            status: "active"
        });

        // Emit socket event to admin
        const io = getIO();
        if (io) {
            // Emitting to admin global/orders room
            io.to("admin:orders").emit("new_sos_alert", {
                alertId: sosAlert._id,
                deliveryBoy: deliveryBoy,
                location: sosAlert.location,
                timestamp: sosAlert.createdAt
            });
        }

        // Optional: Save an in-app notification for admin
        await Notification.create({
            role: "admin",
            userId: null, // Broadcast to all admins if you leave it null or omit (depends on your model rules)
            title: "🚨 SOS Alert!",
            message: `SOS triggered by ${deliveryBoy.name} (${deliveryBoy.phone})`,
            type: "alert",
            channel: "in_app"
        }).catch(err => console.error("Failed to create admin notification", err));

        res.status(201).json({
            success: true,
            message: "SOS Alert sent successfully",
            alert: sosAlert
        });
    } catch (error) {
        console.error("Error triggering SOS:", error);
        res.status(500).json({ success: false, message: "Failed to trigger SOS" });
    }
};

export const getSosAlerts = async (req, res) => {
    try {
        const { status } = req.query;
        let query = {};
        if (status) query.status = status;

        const alerts = await SosAlert.find(query)
            .populate("deliveryBoy", "name phone emergencyContacts profileImage currentArea")
            .populate("resolvedBy", "name email")
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            alerts
        });
    } catch (error) {
        console.error("Error fetching SOS alerts:", error);
        res.status(500).json({ success: false, message: "Failed to fetch SOS alerts" });
    }
};

export const resolveSosAlert = async (req, res) => {
    try {
        const alertId = req.params.id;
        const adminId = req.user?.id || req.user?._id; // from admin auth middleware

        const alert = await SosAlert.findByIdAndUpdate(
            alertId,
            {
                status: "resolved",
                resolvedAt: new Date(),
                resolvedBy: adminId
            },
            { new: true }
        );

        if (!alert) {
            return res.status(404).json({ success: false, message: "SOS Alert not found" });
        }

        res.status(200).json({
            success: true,
            message: "SOS Alert resolved",
            alert
        });
    } catch (error) {
        console.error("Error resolving SOS alert:", error);
        res.status(500).json({ success: false, message: "Failed to resolve SOS alert" });
    }
};
