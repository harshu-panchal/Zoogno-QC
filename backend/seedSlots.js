import mongoose from "mongoose";
import SlotMaster from "./app/models/slotMaster.js";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/zoognu";

const seedSlots = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB:", MONGO_URI);

        const slots = [];
        let currentH = 0;

        const formatTime = (h) => {
            const isAm = h < 12 || h === 24;
            const ampm = (h >= 12 && h < 24) ? "PM" : "AM";
            let sh = h % 12;
            if (sh === 0) sh = 12;
            return `${sh.toString().padStart(2, '0')}:00 ${ampm}`;
        };

        for (let i = 0; i < 12; i++) {
            const startH = currentH;
            const endH = currentH + 2;

            const start = formatTime(startH);
            const endTimeStr = endH === 24 ? "11:59 PM" : formatTime(endH);

            slots.push({
                startTime: start,
                endTime: endTimeStr,
                duration: 120
            });

            currentH += 2;
        }

        console.log("Slots to create:", slots.length);

        let createdCount = 0;
        for (const slotData of slots) {
            const exists = await SlotMaster.findOne({ startTime: slotData.startTime, endTime: slotData.endTime });
            if (!exists) {
                await SlotMaster.create(slotData);
                console.log('Created slot:', slotData.startTime, '-', slotData.endTime);
                createdCount++;
            } else {
                console.log('Slot already exists:', slotData.startTime, '-', slotData.endTime);
            }
        }

        console.log(`Seeding complete. Created ${createdCount} slots.`);
        process.exit(0);
    } catch (error) {
        console.error("Error seeding slots:", error);
        process.exit(1);
    }
};

seedSlots();
