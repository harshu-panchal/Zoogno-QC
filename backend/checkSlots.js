import mongoose from 'mongoose';
import DriverSlot from './app/models/driverSlot.js';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const slots = await DriverSlot.find({ status: { $ne: 'CANCELLED' } });
    console.log(`Total active driver slots: ${slots.length}`);
    const byDate = {};
    slots.forEach(s => {
        if (!byDate[s.date]) byDate[s.date] = 0;
        byDate[s.date]++;
    });
    console.log("By Date:", byDate);
    process.exit(0);
});
