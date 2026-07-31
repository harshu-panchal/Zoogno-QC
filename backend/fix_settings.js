import mongoose from 'mongoose';
(async () => {
  try {
    await mongoose.connect('mongodb+srv://zoogno:zoogno123@cluster0.bj0klhd.mongodb.net/zoogno');
    const result = await mongoose.connection.collection('settings').updateOne(
      {},
      { $set: { paymentGateway: 'cashfree' } }
    );
    console.log('Updated Settings in DB:', result.modifiedCount);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
})();
