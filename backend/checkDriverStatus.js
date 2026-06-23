import mongoose from 'mongoose';
import DriverStatus from './app/models/driverStatus.js';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const statuses = await DriverStatus.find();
    console.log("Statuses:", statuses);
    process.exit(0);
});
