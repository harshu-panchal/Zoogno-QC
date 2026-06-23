import express from "express";
import { getChat, sendMessage, getMyChats } from "../controller/orderChatController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/my-chats", verifyToken, getMyChats);
router.get("/:orderId", verifyToken, getChat);
router.post("/:orderId/send", verifyToken, sendMessage);

export default router;
