import express from "express";
import { getChat, sendMessage } from "../controller/orderChatController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/:orderId", verifyToken, getChat);
router.post("/:orderId/send", verifyToken, sendMessage);

export default router;
