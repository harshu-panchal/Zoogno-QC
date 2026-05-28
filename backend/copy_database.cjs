const { MongoClient } = require('mongodb');

const SOURCE_URI = 'mongodb+srv://playeronline4076_db_user:3e6Kc6Ikodz6vXGs@cluster0.yau7gwg.mongodb.net/Quick_commerce?retryWrites=true&w=majority&appName=Cluster0';
const DEST_URI = 'mongodb+srv://zoogno:zoognuapp123@cluster0.bj0klhd.mongodb.net/Quick_commerce?retryWrites=true&w=majority';

async function copyDatabase() {
  let sourceClient, destClient;

  try {
    console.log('Connecting to SOURCE database...');
    sourceClient = new MongoClient(SOURCE_URI);
    await sourceClient.connect();
    const sourceDb = sourceClient.db(); // uses "Quick_commerce" from URI

    console.log('Connecting to DESTINATION database...');
    destClient = new MongoClient(DEST_URI);
    await destClient.connect();
    const destDb = destClient.db(); // uses "Quick_commerce" from URI

    // List all collections in the source database
    const collections = await sourceDb.listCollections().toArray();
    console.log(`\nFound ${collections.length} collections in source database:\n`);
    collections.forEach(c => console.log(`  - ${c.name} (type: ${c.type})`));
    console.log('');

    let totalDocsCopied = 0;

    for (const collInfo of collections) {
      const collName = collInfo.name;

      // Skip system collections
      if (collName.startsWith('system.')) {
        console.log(`⏭  Skipping system collection: ${collName}`);
        continue;
      }

      const sourceCollection = sourceDb.collection(collName);
      const destCollection = destDb.collection(collName);

      // Count documents in source
      const docCount = await sourceCollection.countDocuments();
      console.log(`📦 Copying "${collName}" (${docCount} documents)...`);

      if (docCount === 0) {
        // Still create the collection even if empty
        await destDb.createCollection(collName);
        console.log(`   ✅ Created empty collection "${collName}"`);
        continue;
      }

      // Drop existing collection in destination to avoid duplicates
      try {
        await destCollection.drop();
        console.log(`   🗑  Dropped existing "${collName}" in destination`);
      } catch (e) {
        // Collection doesn't exist yet, that's fine
      }

      // Copy indexes first (excluding _id index which is auto-created)
      const indexes = await sourceCollection.indexes();
      const customIndexes = indexes.filter(idx => idx.name !== '_id_');
      if (customIndexes.length > 0) {
        console.log(`   📑 Creating ${customIndexes.length} custom index(es)...`);
        for (const idx of customIndexes) {
          const { key, ...options } = idx;
          delete options.v; // remove version field
          try {
            await destCollection.createIndex(key, options);
          } catch (e) {
            console.log(`   ⚠️  Index "${idx.name}" warning: ${e.message}`);
          }
        }
      }

      // Copy documents in batches of 1000
      const BATCH_SIZE = 1000;
      let copied = 0;
      const cursor = sourceCollection.find({});

      while (await cursor.hasNext()) {
        const batch = [];
        for (let i = 0; i < BATCH_SIZE && await cursor.hasNext(); i++) {
          batch.push(await cursor.next());
        }

        if (batch.length > 0) {
          await destCollection.insertMany(batch, { ordered: false });
          copied += batch.length;
          process.stdout.write(`   📄 Progress: ${copied}/${docCount}\r`);
        }
      }

      console.log(`   ✅ Copied ${copied} documents from "${collName}"          `);
      totalDocsCopied += copied;
    }

    console.log(`\n🎉 Database copy complete! Total documents copied: ${totalDocsCopied}`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    throw error;
  } finally {
    if (sourceClient) await sourceClient.close();
    if (destClient) await destClient.close();
    console.log('\nConnections closed.');
  }
}

copyDatabase();
