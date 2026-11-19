import mongoose from "mongoose";
import Ticket from "../models/ticket.js";
import Admin from "../models/admin.js";
import Order from "../models/order.js";
import Customer from "../models/customer.js";
import Seller from "../models/seller.js";
import Delivery from "../models/delivery.js";
import handleResponse from "../utils/helper.js";
import getPagination from "../utils/pagination.js";
import { parseSearchTerm, searchRegex, escapeRegex } from "../utils/searchTerm.js";
import { emitTicketCreated, emitTicketMessage } from "../services/ticketSocketEmitter.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import { saveTicketMessage } from "../services/firebaseService.js";

const ALLOWED_ISSUE_TYPES = [
    "PRODUCT_DAMAGED",
    "CONDITION_MISMATCH",
    "DAMAGED_IN_DELIVERY",
    "WRONG_PRODUCT",
    "MISSING_PRODUCT",
    "SELLER_ISSUE",
    "DELIVERY_ISSUE",
    "OTHER",
];

async function getAdminIds() {
    const admins = await Admin.find().select("_id").lean();
    return (admins || []).map((a) => a?._id).filter(Boolean);
}

const ROLE_TO_USER_TYPE = Object.freeze({
    customer: "Customer",
    user: "Customer",
    seller: "Seller",
    delivery: "Rider",
});

function getAuthenticatedUserType(role) {
    return ROLE_TO_USER_TYPE[String(role || "").toLowerCase()] || "";
}

function isTicketOwner(ticket, userId) {
    return String(ticket?.userId || "") === String(userId || "");
}

// Create a new ticket (Customer/Seller/Rider)
export const createTicket = async (req, res) => {
    try {
        const {
            subject,
            description,
            priority,
            mediaUrl,
            mediaType,
            mimeType,
            orderId,
            issueType,
            attachments,
        } = req.body;
        const userId = req.user.id; // From verifyToken middleware
        const authenticatedUserType = getAuthenticatedUserType(req.user.role);

        if (!authenticatedUserType) {
            return handleResponse(res, 403, "This account cannot create support tickets");
        }

        const safeMediaUrl = String(mediaUrl || "").trim();
        const safeMediaType = String(mediaType || "").trim();
        const safeMimeType = String(mimeType || "").trim();

        // Optional order link (issue reported against a specific order). Only the customer
        // who placed the order may link a ticket to it.
        let linkedOrderId = "";
        const requestedOrderId = String(orderId || "").trim();
        if (requestedOrderId) {
            if (authenticatedUserType !== "Customer") {
                return handleResponse(res, 403, "Only customers can link an order to a support ticket");
            }
            const linkedOrder = await Order.findOne({ orderId: requestedOrderId, customer: userId })
                .select("orderId")
                .lean();
            if (!linkedOrder) {
                return handleResponse(res, 404, "Order not found for this account");
            }
            linkedOrderId = linkedOrder.orderId;
        }
        const safeAttachments = Array.isArray(attachments)
            ? attachments
                  .map((u) => String(u || "").trim())
                  .filter((u) => /^https?:\/\//i.test(u))
                  .slice(0, 6)
            : [];

        const newTicket = new Ticket({
            userId,
            userType: authenticatedUserType,
            subject,
            description,
            priority,
            ...(linkedOrderId ? { orderId: linkedOrderId } : {}),
            ...(ALLOWED_ISSUE_TYPES.includes(String(issueType)) ? { issueType: String(issueType) } : {}),
            attachments: safeAttachments,
            messages: []
        });

        await newTicket.save();

        const messageId = new mongoose.Types.ObjectId();

        const initialMessage = {
            _id: messageId.toString(),
            sender: req.user.name || "User",
            senderId: userId,
            senderType: "User",
            text: description,
            mediaUrl: safeMediaUrl,
            mediaType: safeMediaUrl ? (safeMediaType || "image") : "",
            mimeType: safeMediaUrl ? safeMimeType : "",
            isAdmin: false,
            createdAt: new Date().toISOString()
        };

        const savedMessage = await saveTicketMessage(newTicket._id.toString(), initialMessage);

        if (savedMessage) {
            newTicket.messages.push({
                _id: messageId,
                sender: req.user.name || "User",
                senderId: userId,
                senderType: "User",
                text: description,
                mediaUrl: safeMediaUrl,
                mediaType: safeMediaUrl ? (safeMediaType || "image") : "",
                mimeType: safeMediaUrl ? safeMimeType : "",
                isAdmin: false,
                createdAt: new Date(savedMessage.createdAt)
            });
            await newTicket.save();
        } else {
            newTicket.messages.push({
                _id: messageId,
                sender: req.user.name || "User",
                senderId: userId,
                senderType: "User",
                text: description,
                mediaUrl: safeMediaUrl,
                mediaType: safeMediaUrl ? (safeMediaType || "image") : "",
                mimeType: safeMediaUrl ? safeMimeType : "",
                isAdmin: false,
                createdAt: new Date()
            });
            await newTicket.save();
        }

        emitTicketCreated(newTicket);

        try {
            const dbMessage = newTicket.messages?.[newTicket.messages.length - 1];
            const adminIds = await getAdminIds();
            emitNotificationEvent(NOTIFICATION_EVENTS.SUPPORT_TICKET_MESSAGE, {
                fromRole: String(req.user.role || "customer").toLowerCase(),
                ticketId: newTicket._id,
                messageId: dbMessage?._id,
                messageCreatedAt: dbMessage?.createdAt,
                userId,
                userName: req.user.name || "User",
                adminIds,
                messageText: description || (safeMediaUrl ? "Sent an image" : ""),
                data: {
                    subject,
                },
            });
        } catch {
            // Push notifications are best-effort; never block ticket creation.
        }

        return handleResponse(res, 201, "Ticket created successfully", newTicket);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

// Get all tickets for current user
export const getMyTickets = async (req, res) => {
    try {
        const userType = getAuthenticatedUserType(req.user.role);
        if (!userType) return handleResponse(res, 403, "This account does not have support tickets");
        const tickets = await Ticket.find({ userId: req.user.id, userType }).sort({ createdAt: -1 });
        return handleResponse(res, 200, "Tickets fetched successfully", tickets);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

// Admin: Get all tickets
/**
 * Filter for the admin ticket search box. Matches the ticket's subject / description / order id /
 * issue type, the NAME / email / phone of the customer, seller or rider who raised it, and the
 * short ticket code the admin sees (the last characters of the ticket id).
 * Returns {} when there is no search term.
 */
export async function buildTicketSearchQuery(rawSearch) {
    const term = parseSearchTerm(rawSearch);
    if (!term) return {};
    const rx = searchRegex(term);

    const [customers, sellers, riders] = await Promise.all([
        Customer.find({ $or: [{ name: rx }, { email: rx }, { phone: rx }] }).select("_id").limit(200).lean(),
        Seller.find({ $or: [{ name: rx }, { shopName: rx }, { email: rx }, { phone: rx }] }).select("_id").limit(200).lean(),
        Delivery.find({ $or: [{ name: rx }, { email: rx }, { phone: rx }] }).select("_id").limit(200).lean(),
    ]);
    const userIds = [...customers, ...sellers, ...riders].map((u) => u._id);

    const or = [{ subject: rx }, { description: rx }, { orderId: rx }, { issueType: rx }];
    if (userIds.length) or.push({ userId: { $in: userIds } });
    // The code shown in the list is the tail of the ObjectId, so match it against the id's hex
    // text. Only for hex-looking terms: it cannot use an index.
    if (/^[a-f0-9]{4,24}$/i.test(term)) {
        or.push({
            $expr: {
                $regexMatch: { input: { $toString: "$_id" }, regex: escapeRegex(term), options: "i" },
            },
        });
    }
    return { $or: or };
}

export const getAllTickets = async (req, res) => {
    try {
        const { page, limit, skip } = getPagination(req, { defaultLimit: 25, maxLimit: 200 });

        // The admin page sends `search`, but this handler used to ignore it - the list was only
        // ever filtered in the browser, so a ticket not on the current page could never be found.
        const query = await buildTicketSearchQuery(req.query.search);

        const [tickets, total] = await Promise.all([
            Ticket.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            Ticket.countDocuments(query)
        ]);

        const idsByType = tickets.reduce((acc, ticket) => {
            const type = ticket.userType || "Customer";
            if (!acc[type]) acc[type] = [];
            acc[type].push(ticket.userId);
            return acc;
        }, {});
        const [customers, sellers, riders] = await Promise.all([
            Customer.find({ _id: { $in: idsByType.Customer || [] } }).select("name email phone").lean(),
            Seller.find({ _id: { $in: idsByType.Seller || [] } }).select("name email phone shopName").lean(),
            Delivery.find({ _id: { $in: idsByType.Rider || [] } }).select("name email phone").lean(),
        ]);
        const users = new Map(
            [...customers, ...sellers, ...riders].map((user) => [String(user._id), user]),
        );
        const hydratedTickets = tickets.map((ticket) => ({
            ...ticket,
            userId: users.get(String(ticket.userId)) || ticket.userId,
        }));

        return handleResponse(res, 200, "All tickets fetched successfully", {
            items: hydratedTickets,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 1,
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

// Admin/User: Reply to a ticket
export const replyToTicket = async (req, res) => {
    try {
        const { text, mediaUrl, mediaType, mimeType } = req.body;
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return handleResponse(res, 404, "Ticket not found");
        }

        const ticket = await Ticket.findById(id);
        if (!ticket) return handleResponse(res, 404, "Ticket not found");
        const isAdmin = req.user.role === "admin";
        if (!isAdmin && !isTicketOwner(ticket, req.user.id)) {
            return handleResponse(res, 403, "You cannot reply to this ticket");
        }

        const safeText = String(text || "").trim();
        const safeMediaUrl = String(mediaUrl || "").trim();
        const safeMediaType = String(mediaType || "").trim();
        const safeMimeType = String(mimeType || "").trim();

        if (!safeText && !safeMediaUrl) {
            return handleResponse(res, 400, "Message text or mediaUrl is required");
        }

        const messageId = new mongoose.Types.ObjectId();

        const newMessage = {
            _id: messageId.toString(),
            sender: isAdmin ? "Admin" : (req.user.name || "User"),
            senderId: req.user.id,
            senderType: isAdmin ? "Admin" : "User",
            text: safeText,
            mediaUrl: safeMediaUrl,
            mediaType: safeMediaUrl ? (safeMediaType || "image") : "",
            mimeType: safeMediaUrl ? safeMimeType : "",
            isAdmin: !!isAdmin,
            createdAt: new Date().toISOString()
        };

        const savedMessage = await saveTicketMessage(ticket._id.toString(), newMessage);

        if (savedMessage) {
            ticket.messages.push({
                _id: messageId,
                sender: isAdmin ? "Admin" : (req.user.name || "User"),
                senderId: req.user.id,
                senderType: isAdmin ? "Admin" : "User",
                text: safeText,
                mediaUrl: safeMediaUrl,
                mediaType: safeMediaUrl ? (safeMediaType || "image") : "",
                mimeType: safeMediaUrl ? safeMimeType : "",
                isAdmin: !!isAdmin,
                createdAt: new Date(savedMessage.createdAt)
            });
        } else {
            ticket.messages.push({
                _id: messageId,
                sender: isAdmin ? "Admin" : (req.user.name || "User"),
                senderId: req.user.id,
                senderType: isAdmin ? "Admin" : "User",
                text: safeText,
                mediaUrl: safeMediaUrl,
                mediaType: safeMediaUrl ? (safeMediaType || "image") : "",
                mimeType: safeMediaUrl ? safeMimeType : "",
                isAdmin: !!isAdmin,
                createdAt: new Date()
            });
        }

        if (isAdmin) {
            ticket.status = "processing";
        } else if (ticket.status === "closed") {
            ticket.status = "open";
        }

        await ticket.save();

        const dbMessage = ticket.messages[ticket.messages.length - 1];
        emitTicketMessage({
            ticketId: ticket._id,
            userId: ticket.userId,
            message: typeof dbMessage?.toObject === "function" ? dbMessage.toObject() : dbMessage,
        });

        try {
            const fromRole = isAdmin ? "admin" : "customer";
            const payload = {
                fromRole,
                ticketId: ticket._id,
                messageId: dbMessage?._id,
                messageCreatedAt: dbMessage?.createdAt,
                userId: ticket.userId,
                userName: req.user.name || "User",
                messageText: safeText || (safeMediaUrl ? "Sent an image" : ""),
                data: {
                    subject: ticket.subject,
                },
            };

            if (!isAdmin) {
                payload.adminIds = await getAdminIds();
            }

            emitNotificationEvent(NOTIFICATION_EVENTS.SUPPORT_TICKET_MESSAGE, payload);
        } catch {
            // Best-effort; chat must work even if push is misconfigured.
        }

        return handleResponse(res, 200, "Reply sent successfully", ticket);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

// Admin: Update status
export const updateTicketStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return handleResponse(res, 404, "Ticket not found");
        }

        const ticket = await Ticket.findByIdAndUpdate(id, { status }, { new: true });
        if (!ticket) return handleResponse(res, 404, "Ticket not found");

        return handleResponse(res, 200, `Ticket status updated to ${status}`, ticket);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};
