import cron from "node-cron";
import DriverSlot from "../models/driverSlot.js";
import DriverStatus from "../models/driverStatus.js";
import Delivery from "../models/delivery.js";
import { getIO } from "../socket/socketManager.js";

// Mock FCM integration (to be replaced with actual firebase-admin logic)
const sendPushNotification = async (deliveryId, title, body) => {
    console.log(`[FCM Mock] Push to ${deliveryId}: ${title} - ${body}`);
};

// Activate Slots
// Runs every minute.
cron.schedule("* * * * *", async () => {
    try {
        const now = new Date();
        const upcomingSlots = await DriverSlot.find({
            status: "UPCOMING",
            slotStartTime: { $lte: now }
        }).populate("slotId").populate("deliveryId");

        for (let slot of upcomingSlots) {
            slot.status = "ACTIVE";
            await slot.save();

            let status = await DriverStatus.findOne({ deliveryId: slot.deliveryId._id });
            if (!status) {
                status = new DriverStatus({ deliveryId: slot.deliveryId._id });
            }
            
            status.isOnline = true;
            status.activeSlotId = slot._id;
            status.currentSlotStart = slot.slotId.startTime;
            status.currentSlotEnd = slot.slotId.endTime;
            await status.save();

            await Delivery.findByIdAndUpdate(slot.deliveryId._id, { isOnline: true });

            // Emit socket
            try {
                const io = getIO();
                io.to(`delivery:${slot.deliveryId._id}`).emit("driver-online", { slot });
                io.to(`delivery:${slot.deliveryId._id}`).emit("slot-started", { slot });
                io.to(`delivery:${slot.deliveryId._id}`).emit("status-updated", { isOnline: true });
            } catch (e) { /* ignore if IO not init */ }

            // FCM
            try {
                await sendPushNotification(slot.deliveryId._id, "Your slot has started.", "You are now online.");
            } catch (e) { /* ignore */ }
        }
    } catch (error) {
        console.error("Activate Slots Cron Error:", error);
    }
});

// Complete Slots
// Runs every minute.
cron.schedule("* * * * *", async () => {
    try {
        const now = new Date();
        const activeSlots = await DriverSlot.find({
            status: "ACTIVE",
            slotEndTime: { $lte: now }
        }).populate("deliveryId");

        for (let slot of activeSlots) {
            slot.status = "COMPLETED";
            await slot.save();

            const status = await DriverStatus.findOne({ deliveryId: slot.deliveryId._id });
            if (status) {
                status.isOnline = false;
                status.activeSlotId = null;
                status.currentSlotStart = null;
                status.currentSlotEnd = null;
                await status.save();
            }

            await Delivery.findByIdAndUpdate(slot.deliveryId._id, { isOnline: false });

            try {
                const io = getIO();
                io.to(`delivery:${slot.deliveryId._id}`).emit("driver-offline", { slot });
                io.to(`delivery:${slot.deliveryId._id}`).emit("slot-ended", { slot });
                io.to(`delivery:${slot.deliveryId._id}`).emit("status-updated", { isOnline: false });
            } catch (e) { /* ignore */ }

            try {
                await sendPushNotification(slot.deliveryId._id, "Your slot has ended.", "You are now offline.");
            } catch (e) { /* ignore */ }
        }
    } catch (error) {
        console.error("Complete Slots Cron Error:", error);
    }
});

// Notification Cron
// Runs every minute to send "ending in 15 mins"
cron.schedule("* * * * *", async () => {
    try {
        const now = new Date();
        const fifteenMinsFromNow = new Date(now.getTime() + 15 * 60000);
        
        // Find slots that are active and ending exactly between 14-15 minutes from now to avoid duplicate sending
        const endingSlots = await DriverSlot.find({
            status: "ACTIVE",
            slotEndTime: { 
                $lte: fifteenMinsFromNow,
                $gt: new Date(fifteenMinsFromNow.getTime() - 60000) 
            }
        });

        for (let slot of endingSlots) {
            try {
                await sendPushNotification(slot.deliveryId, "Your slot will end in 15 minutes.", "Please complete your ongoing deliveries.");
            } catch (e) { /* ignore */ }
        }
    } catch (error) {
        console.error("Notification Cron Error:", error);
    }
});

export const startSlotCrons = () => {
    console.log("Slot Management Crons started");
};
