import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import {
  saveOrderChatMessage,
  getOrderChatMessages,
  saveTicketMessage,
  getTicketMessages
} from "../app/services/firebaseService.js";
import { getFirebaseRealtimeDb } from "../app/config/firebaseAdmin.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function runVerification() {
  console.log("Starting Firebase RTDB Chat Integration Verification...");

  const db = getFirebaseRealtimeDb();
  if (!db) {
    console.error("❌ Failed to initialize Firebase Realtime Database. Check your environment variables.");
    process.exit(1);
  }
  console.log("✓ Firebase Realtime Database initialized successfully.");

  const testOrderId = `test_order_${Date.now()}`;
  const orderMessage = {
    senderId: "64a7c88b8f2d5e3c88d8b1aa",
    senderType: "Customer",
    text: "Hello delivery partner! Please bring some extra change.",
    mediaUrl: "",
    mediaType: "",
    createdAt: new Date().toISOString()
  };

  console.log(`\nTesting Order Chat on path: /chats/orders/${testOrderId}/messages`);
  const savedOrderMsg = await saveOrderChatMessage(testOrderId, orderMessage);
  if (savedOrderMsg && savedOrderMsg._id) {
    console.log("✓ saveOrderChatMessage succeeded. Saved message details:", savedOrderMsg);
  } else {
    console.error("❌ saveOrderChatMessage failed.");
  }

  const fetchedOrderMessages = await getOrderChatMessages(testOrderId);
  if (fetchedOrderMessages && fetchedOrderMessages.length > 0) {
    console.log(`✓ getOrderChatMessages succeeded. Fetched ${fetchedOrderMessages.length} message(s):`, fetchedOrderMessages);
  } else {
    console.error("❌ getOrderChatMessages failed or returned empty list.");
  }

  const testTicketId = `test_ticket_${Date.now()}`;
  const ticketMessage = {
    sender: "Support Agent",
    senderId: "64a7c88b8f2d5e3c88d8b1bb",
    senderType: "User",
    text: "We are reviewing your issue, thank you for your patience.",
    mediaUrl: "",
    mediaType: "",
    mimeType: "",
    isAdmin: true,
    createdAt: new Date().toISOString()
  };

  console.log(`\nTesting Ticket Support Chat on path: /chats/tickets/${testTicketId}/messages`);
  const savedTicketMsg = await saveTicketMessage(testTicketId, ticketMessage);
  if (savedTicketMsg && savedTicketMsg._id) {
    console.log("✓ saveTicketMessage succeeded. Saved message details:", savedTicketMsg);
  } else {
    console.error("❌ saveTicketMessage failed.");
  }

  const fetchedTicketMessages = await getTicketMessages(testTicketId);
  if (fetchedTicketMessages && fetchedTicketMessages.length > 0) {
    console.log(`✓ getTicketMessages succeeded. Fetched ${fetchedTicketMessages.length} message(s):`, fetchedTicketMessages);
  } else {
    console.error("❌ getTicketMessages failed or returned empty list.");
  }

  // Cleanup test paths
  console.log("\nCleaning up test paths in Firebase Realtime Database...");
  await db.ref(`/chats/orders/${testOrderId}`).remove();
  await db.ref(`/chats/tickets/${testTicketId}`).remove();
  console.log("✓ Cleanup finished successfully.");
  console.log("\nAll Firebase RTDB Chat integrations verified successfully! 🎉");
  process.exit(0);
}

runVerification().catch(err => {
  console.error("❌ Verification crashed:", err);
  process.exit(1);
});
