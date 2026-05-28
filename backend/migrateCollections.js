import { MongoClient } from 'mongodb';
import bcrypt from 'bcrypt';

async function migrateCollections() {
    const targetUri = "mongodb+srv://zoogno:zoogno123@cluster0.bj0klhd.mongodb.net/zoogno";
    const client = new MongoClient(targetUri);

    try {
        await client.connect();
        const db = client.db("zoogno");
        
        const collections = await db.listCollections().toArray();
        console.log("Renaming collections...");

        for (const colInfo of collections) {
            const colName = colInfo.name;
            if (colName.startsWith('quick_')) {
                const newName = colName.substring(6); // remove 'quick_'
                
                // If the target collection already exists, drop it first
                const targetExists = collections.find(c => c.name === newName);
                if (targetExists) {
                    await db.collection(newName).drop();
                    console.log(`Dropped empty/old collection: ${newName}`);
                }
                
                // Rename the collection
                await db.collection(colName).rename(newName);
                console.log(`Renamed ${colName} to ${newName}`);
            }
        }
        
        // Also ensure passwords are correct in the newly renamed collections
        const newPassword = "Password123!";
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        console.log("--- Credentials Updated in new collections ---");
        
        // 1. Seller
        const sellerCol = db.collection("sellers");
        const updateSellerResult = await sellerCol.updateOne(
            { email: "harsh@appzeto.com" },
            { $set: { password: hashedPassword } }
        );
        if (updateSellerResult.matchedCount > 0) {
            console.log(`Seller: Email: harsh@appzeto.com, Password: ${newPassword}`);
        }
        
        // 2. Admin
        const adminCol = db.collection("admins");
        const adminDoc = await adminCol.findOne({});
        if (adminDoc) {
            await adminCol.updateOne({ _id: adminDoc._id }, { $set: { password: hashedPassword } });
            console.log(`Admin: Email: ${adminDoc.email}, Password: ${newPassword}`);
        }
        
        // 3. User
        const userCol = db.collection("users");
        const userDoc = await userCol.findOne({});
        if (userDoc) {
            await userCol.updateOne({ _id: userDoc._id }, { $set: { password: hashedPassword } });
            console.log(`User: Phone: ${userDoc.phone || userDoc.email}, Password: ${newPassword}`);
        }
        
        // 4. Delivery
        const deliveryCol = db.collection("deliveries");
        const deliveryDoc = await deliveryCol.findOne({});
        if (deliveryDoc) {
            await deliveryCol.updateOne({ _id: deliveryDoc._id }, { $set: { password: hashedPassword } });
            console.log(`Delivery: Phone: ${deliveryDoc.phone || deliveryDoc.email}, Password: ${newPassword}`);
        }
        
        console.log("Migration complete.");

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await client.close();
    }
}

migrateCollections();
