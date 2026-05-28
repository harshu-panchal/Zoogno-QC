const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');

const MONGO_URI = 'mongodb+srv://zoogno:zoognuapp123@cluster0.bj0klhd.mongodb.net/Quick_commerce?retryWrites=true&w=majority';

async function seedAdmin() {
  let client;
  try {
    console.log('Connecting to MongoDB...');
    client = new MongoClient(MONGO_URI);
    await client.connect();
    console.log('✅ Connected successfully!\n');

    const db = client.db();
    const adminsCollection = db.collection('admins');

    const email = 'zoogno61@gmail.com';

    // Check if admin already exists
    const existing = await adminsCollection.findOne({ email });
    if (existing) {
      console.log(`⚠️  Admin with email "${email}" already exists. Updating password...`);
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('zoognu#123', salt);
      await adminsCollection.updateOne(
        { email },
        { $set: { password: hashedPassword, role: 'admin', isVerified: true, updatedAt: new Date() } }
      );
      console.log('✅ Admin password updated successfully!');
    } else {
      console.log('Creating new admin user...');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('zoognu#123', salt);

      const adminDoc = {
        name: 'Zoogno Admin',
        email: email,
        password: hashedPassword,
        role: 'admin',
        isVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        __v: 0,
      };

      const result = await adminsCollection.insertOne(adminDoc);
      console.log(`✅ Admin seeded successfully!`);
      console.log(`   ID: ${result.insertedId}`);
    }

    console.log(`\n📧 Email:    ${email}`);
    console.log(`🔑 Password: zoognu#123`);
    console.log(`👤 Role:     admin`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (client) await client.close();
    console.log('\nConnection closed.');
  }
}

seedAdmin();
