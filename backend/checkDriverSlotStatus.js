import mongoose from 'mongoose';
import DriverSlot from './app/models/driverSlot.js';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const slots = await DriverSlot.find();
    console.log("Slots:", slots);
    process.exit(0);
});
