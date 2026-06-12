const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://zoogno:zoogno123@cluster0.bj0klhd.mongodb.net/zoogno';

const adminSchema = new mongoose.Schema({
  name: String,
  email: String,
  role: String,
  adminRole: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
  isVerified: Boolean,
  isActive: Boolean,
  lastLogin: Date,
  createdAt: Date,
}, { timestamps: true });

const roleSchema = new mongoose.Schema({
  name: String,
  permissions: [String],
}, { timestamps: true });

const Admin = mongoose.model('Admin', adminSchema);
const Role = mongoose.model('Role', roleSchema);

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const allAdmins = await Admin.find({}).populate('adminRole').lean();
  console.log(`📊 Total admin documents in DB: ${allAdmins.length}\n`);

  allAdmins.forEach((a, i) => {
    console.log(`[${i+1}] ${a.email}`);
    console.log(`    name: ${a.name}`);
    console.log(`    role: ${a.role}`);
    console.log(`    isVerified: ${a.isVerified}`);
    console.log(`    isActive: ${a.isActive}`);
    console.log(`    adminRole: ${a.adminRole ? JSON.stringify(a.adminRole) : 'null (Super Admin)'}`);
    console.log(`    lastLogin: ${a.lastLogin || 'Never'}`);
    console.log('');
  });

  // Simulate the getAdmins query
  const staffQuery = await Admin.find({ role: { $in: ['admin', 'super_admin'] } }).populate('adminRole').lean();
  console.log(`\n🔍 getAdmins query result (role in [admin, super_admin]): ${staffQuery.length} found`);
  staffQuery.forEach(a => console.log(`   → ${a.email} | role: ${a.role}`));

  await mongoose.disconnect();
  console.log('\n✅ Done');
}

run().catch(console.error);
