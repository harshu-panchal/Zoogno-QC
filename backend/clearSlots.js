import mongoose from 'mongoose';
import DriverSlot from './app/models/driverSlot.js';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const result = await DriverSlot.deleteMany({});
    console.log(`Deleted ${result.deletedCount} driver slots.`);
    process.exit(0);
});
