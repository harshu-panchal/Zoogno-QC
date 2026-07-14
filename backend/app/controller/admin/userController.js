import handleResponse from "../../utils/helper.js";
import User from "../../models/customer.js";
import PushToken from "../../modules/notifications/token.model.js";
import { sendPushNotification } from "../../services/firebaseService.js";
import getPagination from "../../utils/pagination.js";
import {
  getUserByIdData,
  getUsersData,
} from "../../services/admin/userAdminService.js";

export const getUsers = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const data = await getUsersData({ page, limit, skip });
    return handleResponse(res, 200, "Users fetched successfully", data);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await getUserByIdData(id);

    if (!user) {
      return handleResponse(res, 404, "Customer not found");
    }

    return handleResponse(
      res,
      200,
      "Customer details fetched successfully",
      user,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const notifyCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ success: false, message: "Message is required" });
        }

        const user = await User.findById(id).select("fcmTokens name");
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const pushTokensDocs = await PushToken.find({ userId: id, isActive: true }).select('token');
        const pushTokens = pushTokensDocs.map(doc => doc.token);
        
        let allTokens = [];
        if (user.fcmTokens && user.fcmTokens.length > 0) {
            allTokens = [...user.fcmTokens];
        }
        if (pushTokens.length > 0) {
            allTokens = [...allTokens, ...pushTokens];
        }
        
        allTokens = [...new Set(allTokens)]; // deduplicate

        if (allTokens.length === 0) {
            return res.status(400).json({ success: false, message: "User has no device registered for push notifications." });
        }

        const title = "New Notification from Admin";
        const body = message;

        const response = await sendPushNotification(allTokens, title, body);

        if (!response) {
            return res.status(500).json({ success: false, message: "Failed to send push notification via Firebase Admin." });
        }

        res.json({
            success: true,
            message: `Notification sent. Success: ${response.successCount}, Failed: ${response.failureCount}`,
            result: response
        });
    } catch (error) {
        console.error("Error notifying customer:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};
