import { MongoClient } from 'mongodb';

async function copyDatabase() {
    const sourceUri = "mongodb+srv://playeronline4076_db_user:3e6Kc6Ikodz6vXGs@cluster0.yau7gwg.mongodb.net/Quick_commerce?retryWrites=true&w=majority&appName=Cluster0";
    const targetUri = "mongodb+srv://zoogno:zoogno123@cluster0.bj0klhd.mongodb.net/zoogno";

    const sourceClient = new MongoClient(sourceUri);
    const targetClient = new MongoClient(targetUri);

    try {
        await sourceClient.connect();
        await targetClient.connect();
        console.log("Connected to both databases.");

        // Use the default databases from the connection strings
        const sourceDb = sourceClient.db("Quick_commerce");
        const targetDb = targetClient.db("zoogno");

        const collections = await sourceDb.listCollections().toArray();
        console.log(`Found ${collections.length} collections in the source database.`);

        for (const colInfo of collections) {
            const colName = colInfo.name;
            // Skip system collections if any
            if (colName.startsWith('system.')) {
                continue;
            }
            console.log(`Copying collection: ${colName}`);
            
            const sourceCol = sourceDb.collection(colName);
            const targetCol = targetDb.collection(colName);

            // Fetch all documents from the source collection
            const docs = await sourceCol.find({}).toArray();
            
            if (docs.length > 0) {
                // Clean the target collection to avoid duplicate key errors
                try {
                    await targetDb.collection(colName).drop();
                } catch (e) {
                    // Ignore error if collection doesn't exist
                }
                await targetCol.insertMany(docs);
                console.log(`Inserted ${docs.length} documents into ${colName}`);
            } else {
                console.log(`Collection ${colName} is empty in source.`);
            }
        }
        
        console.log("Database copy completed successfully.");

    } catch (error) {
        console.error("Error copying database:", error);
    } finally {
        await sourceClient.close();
        await targetClient.close();
    }
}

copyDatabase();
