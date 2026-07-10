const { MongoClient } = require('mongodb');

async function run() {
  const uri = "mongodb+srv://zoogno:zoogno123@cluster0.bj0klhd.mongodb.net/zoogno";
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('zoogno');
    
    // Check order
    const order = await db.collection('orders').findOne({ 'orderId': 'ORD-01KX5WP6AZ4W6ZPWMP5Z78QNZP' });
    console.log('Order status:', order?.status, order?.orderStatus, 'paymentBreakdown:', order?.paymentBreakdown, 'deliveryBoy:', order?.deliveryBoy);
    
    if (order) {
        // Check transaction by order._id
        const txns = await db.collection('transactions').find({ 'order': order._id }).toArray();
        console.log('Transactions for order by order._id:', JSON.stringify(txns, null, 2));
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}
run();
