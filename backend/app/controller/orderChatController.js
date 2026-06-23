import mongoose from "mongoose";
import OrderChat from "../models/orderChat.js";
import Order from "../models/order.js";
import handleResponse from "../utils/helper.js";
import { emitToCustomer, emitToDelivery } from "../services/orderSocketEmitter.js";
import { orderMatchQueryFromRouteParam } from "../utils/orderLookup.js";
import { saveOrderChatMessage, getOrderChatMessages } from "../services/firebaseService.js";

// Get or Create Order Chat
export const getChat = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { id: userId, role } = req.user;

        const orderKey = orderMatchQueryFromRouteParam(orderId);
        if (!orderKey) {
            return handleResponse(res, 404, "Invalid order format");
        }

        const order = await Order.findOne(orderKey).select("orderId customer deliveryBoy returnDeliveryBoy status").lean();
        if (!order) {
            return handleResponse(res, 404, "Order not found");
        }

        // Validate access
        const isCustomer = role === "customer" && order.customer?.toString() === userId;
        const isDelivery = role === "delivery" && (order.deliveryBoy?.toString() === userId || order.returnDeliveryBoy?.toString() === userId);
        const isAdmin = role === "admin";

        if (!isCustomer && !isDelivery && !isAdmin) {
            return handleResponse(res, 403, "Access denied to this chat");
        }

        if (!order.deliveryBoy && !order.returnDeliveryBoy) {
            return handleResponse(res, 400, "Delivery boy not assigned yet");
        }

        let chat = await OrderChat.findOne({ orderId: order.orderId }).lean();

        if (!chat) {
            // Only create if we actually have both parties
            chat = await OrderChat.create({
                orderId: order.orderId,
                customer: order.customer,
                deliveryBoy: order.deliveryBoy || order.returnDeliveryBoy,
                messages: []
            });
            chat = chat.toObject();
        }

        // Fetch messages from Firebase RTDB
        const firebaseMessages = await getOrderChatMessages(order.orderId);
        if (firebaseMessages && firebaseMessages.length > 0) {
            chat.messages = firebaseMessages;
        }

        return handleResponse(res, 200, "Chat fetched successfully", chat);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

// Send Message
export const sendMessage = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { text, mediaUrl, mediaType } = req.body;
        const { id: userId, role } = req.user;

        if (!text && !mediaUrl) {
            return handleResponse(res, 400, "Message cannot be empty");
        }

        const orderKey = orderMatchQueryFromRouteParam(orderId);
        if (!orderKey) {
            return handleResponse(res, 404, "Invalid order format");
        }

        const order = await Order.findOne(orderKey).select("orderId customer deliveryBoy returnDeliveryBoy").lean();
        if (!order) {
            return handleResponse(res, 404, "Order not found");
        }

        const isCustomer = role === "customer" && order.customer?.toString() === userId;
        const isDelivery = role === "delivery" && (order.deliveryBoy?.toString() === userId || order.returnDeliveryBoy?.toString() === userId);

        if (!isCustomer && !isDelivery) {
            return handleResponse(res, 403, "Access denied to this chat");
        }

        let chat = await OrderChat.findOne({ orderId: order.orderId });
        if (!chat) {
            chat = new OrderChat({
                orderId: order.orderId,
                customer: order.customer,
                deliveryBoy: order.deliveryBoy || order.returnDeliveryBoy,
                messages: []
            });
        }

        const senderType = isCustomer ? "Customer" : "Delivery";
        const messageId = new mongoose.Types.ObjectId();

        const newMessage = {
            _id: messageId.toString(),
            senderId: userId,
            senderType,
            text: text || "",
            mediaUrl: mediaUrl || "",
            mediaType: mediaType || "",
            createdAt: new Date().toISOString(),
        };

        // Save to Firebase RTDB
        const savedMessage = await saveOrderChatMessage(order.orderId, newMessage);

        // Sync to MongoDB replica (backup)
        if (savedMessage) {
            chat.messages.push({
                _id: messageId,
                senderId: userId,
                senderType,
                text: text || "",
                mediaUrl: mediaUrl || "",
                mediaType: mediaType || "",
                createdAt: new Date(savedMessage.createdAt),
            });
            await chat.save();
        } else {
            // Fallback if Firebase fails
            chat.messages.push({
                _id: messageId,
                senderId: userId,
                senderType,
                text: text || "",
                mediaUrl: mediaUrl || "",
                mediaType: mediaType || "",
                createdAt: new Date(),
            });
            await chat.save();
        }

        const addedMessage = chat.messages[chat.messages.length - 1];

        // Emit via Socket.IO
        const payload = { orderId: order.orderId, message: addedMessage };
        
        // Always emit to both to ensure sync across all devices
        emitToCustomer(order.customer, { event: "order:chat:message", payload });
        emitToDelivery(order.deliveryBoy, { event: "order:chat:message", payload });

        // Update returned chat with latest messages from Firebase
        const firebaseMessages = await getOrderChatMessages(order.orderId);
        const chatObj = chat.toObject ? chat.toObject() : chat;
        if (firebaseMessages && firebaseMessages.length > 0) {
            chatObj.messages = firebaseMessages;
        }

        return handleResponse(res, 200, "Message sent successfully", chatObj);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

// Get all previous chats for the logged in user
export const getMyChats = async (req, res) => {
    try {
        const { id: userId, role } = req.user;
        let query = {};
        if (role === "customer") {
            query.customer = userId;
        } else if (role === "delivery") {
            // Also include returnDeliveryBoy just in case
            query.$or = [{ deliveryBoy: userId }, { returnDeliveryBoy: userId }];
        } else {
            return handleResponse(res, 403, "Access denied");
        }

        const chats = await OrderChat.find(query).populate("customer", "name email").lean().sort({ updatedAt: -1 });

        console.log(`[getMyChats] role=${role} userId=${userId} found=${chats.length}`);

        // Augment with Firebase latest messages if possible
        for (let chat of chats) {
            const firebaseMessages = await getOrderChatMessages(chat.orderId);
            if (firebaseMessages && firebaseMessages.length > 0) {
                chat.messages = firebaseMessages;
            }
            if (chat.messages && chat.messages.length > 0) {
                chat.lastMessage = chat.messages[chat.messages.length - 1];
            } else {
                chat.lastMessage = null;
            }
        }

        return handleResponse(res, 200, "Chats fetched successfully", chats);
    } catch (error) {
        console.error("[getMyChats] Error:", error);
        return handleResponse(res, 500, error.message);
    }
};
