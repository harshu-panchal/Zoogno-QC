import SlotMaster from "../../models/slotMaster.js";
import DriverStatus from "../../models/driverStatus.js";
import Delivery from "../../models/delivery.js";
import DriverSlot from "../../models/driverSlot.js";

export const createSlot = async (req, res) => {
    try {
        const { startTime, endTime, duration } = req.body;
        
        // Validation: Prevent duplicate slots
        const existingSlot = await SlotMaster.findOne({ startTime, endTime });
        if (existingSlot) {
            return res.status(400).json({ success: false, message: "A slot with this exact time already exists." });
        }

        const slot = new SlotMaster({ startTime, endTime, duration });
        await slot.save();
        res.status(201).json({ success: true, slot });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getSlots = async (req, res) => {
    try {
        const slots = await SlotMaster.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, slots });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateSlot = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const slot = await SlotMaster.findByIdAndUpdate(id, updates, { new: true });
        if (!slot) return res.status(404).json({ success: false, message: "Slot not found" });
        res.status(200).json({ success: true, slot });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteSlot = async (req, res) => {
    try {
        const { id } = req.params;
        const slot = await SlotMaster.findByIdAndDelete(id);
        if (!slot) return res.status(404).json({ success: false, message: "Slot not found" });
        res.status(200).json({ success: true, message: "Slot deleted" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getOnlineDrivers = async (req, res) => {
    try {
        const statuses = await DriverStatus.find({ isOnline: true })
            .populate("deliveryId", "name phone currentArea")
            .populate("activeSlotId");
        
        res.status(200).json({ success: true, data: statuses });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const forceOfflineDriver = async (req, res) => {
    try {
        const { id } = req.params; // Driver (Delivery) ID
        
        const status = await DriverStatus.findOne({ deliveryId: id });
        if (status) {
            status.isOnline = false;
            status.activeSlotId = null;
            status.currentSlotStart = null;
            status.currentSlotEnd = null;
            await status.save();
        }
        
        // Also update the Delivery model to sync the original flag
        await Delivery.findByIdAndUpdate(id, { isOnline: false });
        
        // Emitting socket event could be handled in service layer or here
        res.status(200).json({ success: true, message: "Driver forced offline successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getSlotAnalytics = async (req, res) => {
    try {
        const totalBooked = await DriverSlot.countDocuments({ status: { $ne: 'CANCELLED' } });
        const totalCompleted = await DriverSlot.countDocuments({ status: 'COMPLETED' });
        const activeDrivers = await DriverStatus.countDocuments({ isOnline: true });
        
        // Data for Pie Chart (Status Distribution)
        const statusDistributionRaw = await DriverSlot.aggregate([
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);
        
        // Data for Bar Chart (Bookings over last 7 active days)
        const dailyBookingsRaw = await DriverSlot.aggregate([
            { $match: { status: { $ne: 'CANCELLED' } } },
            { $group: { _id: "$date", count: { $sum: 1 } } },
            { $sort: { "_id": 1 } },
            { $limit: 7 }
        ]);

        const statusDistribution = statusDistributionRaw.map(s => ({
            name: s._id,
            value: s.count
        }));

        const dailyBookings = dailyBookingsRaw.map(d => ({
            date: d._id,
            bookings: d.count
        }));

        // Basic mock utilization rate calculation
        const utilizationRate = totalBooked > 0 ? Math.min(Math.round((activeDrivers / totalBooked) * 100) + 50, 100) : 0;
        
        res.status(200).json({ 
            success: true, 
            data: {
                totalBooked,
                activeDrivers,
                totalCompleted,
                utilizationRate,
                statusDistribution,
                dailyBookings
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
