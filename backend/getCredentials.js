import { MongoClient } from 'mongodb';
import bcrypt from 'bcrypt';

async function updateAndGetCredentials() {
    const targetUri = "mongodb+srv://zoogno:zoogno123@cluster0.bj0klhd.mongodb.net/zoogno";
    const client = new MongoClient(targetUri);

    try {
        await client.connect();
        const db = client.db("zoogno");
        
        const newPassword = "Password123!";
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        console.log("--- Credentials ---");
        
        // 1. Seller harsh@appzeto.com
        const sellerCol = db.collection("quick_sellers");
        const updateSellerResult = await sellerCol.updateOne(
            { email: "harsh@appzeto.com" },
            { $set: { password: hashedPassword } }
        );
        if (updateSellerResult.matchedCount > 0) {
            console.log(`Seller: Email: harsh@appzeto.com, Password: ${newPassword}`);
        } else {
            console.log(`Seller harsh@appzeto.com not found.`);
        }

        // 2. Admin
        const adminCol = db.collection("quick_admins");
        const adminDoc = await adminCol.findOne({});
        if (adminDoc) {
            await adminCol.updateOne({ _id: adminDoc._id }, { $set: { password: hashedPassword } });
            console.log(`Admin: Email: ${adminDoc.email}, Password: ${newPassword}`);
        } else {
            console.log("No admins found.");
        }

        // 3. User
        const userCol = db.collection("quick_users");
        const userDoc = await userCol.findOne({});
        if (userDoc) {
            await userCol.updateOne({ _id: userDoc._id }, { $set: { password: hashedPassword } });
            console.log(`User: Email: ${userDoc.email}, Phone: ${userDoc.phone}, Password: ${newPassword}`);
        } else {
            console.log("No users found.");
        }

        // 4. Delivery
        const deliveryCol = db.collection("quick_deliveries");
        const deliveryDoc = await deliveryCol.findOne({});
        if (deliveryDoc) {
            await deliveryCol.updateOne({ _id: deliveryDoc._id }, { $set: { password: hashedPassword } });
            console.log(`Delivery: Email: ${deliveryDoc.email}, Phone: ${deliveryDoc.phone}, Password: ${newPassword}`);
        } else {
            console.log("No delivery personnel found.");
        }
        
        console.log("-------------------");

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await client.close();
    }
}

updateAndGetCredentials();
