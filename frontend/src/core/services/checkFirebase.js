import { initializeApp } from "firebase/app";
import { getDatabase, ref, get } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBmblrdRPB8kE-yBAPu0Fyh1iURun0AzTg",
  authDomain: "zoogno-96f97.firebaseapp.com",
  databaseURL: "https://zoogno-96f97-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "zoogno-96f97",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

async function check() {
  const orderId = "D-100192";
  console.log("Checking Firebase for order:", orderId);
  
  const locSnap = await get(ref(db, `/deliveryLocations/${orderId}`));
  console.log("deliveryLocations:", locSnap.val());

  const riderSnap = await get(ref(db, `/orders/${orderId}/rider`));
  console.log("orders/rider:", riderSnap.val());

  const routeSnap = await get(ref(db, `/orders/${orderId}/route`));
  console.log("orders/route:", routeSnap.val());
}

check().catch(console.error);
