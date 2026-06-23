import DriverStatus from "../../models/driverStatus.js";

export const getDriverStatus = async (req, res) => {
    try {
        const deliveryId = req.user._id || req.user.id;
        
        let status = await DriverStatus.findOne({ deliveryId }).populate("activeSlotId");
        
        if (!status) {
            // Initialize if not exists
            status = new DriverStatus({
                deliveryId,
                isOnline: false,
                activeSlotId: null
            });
            await status.save();
        }

        res.status(200).json({
            success: true,
            isOnline: status.isOnline,
            currentSlotStart: status.currentSlotStart,
            currentSlotEnd: status.currentSlotEnd,
            activeSlotId: status.activeSlotId
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
