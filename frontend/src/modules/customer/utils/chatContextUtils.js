/**
 * Utility functions to manage Context-Aware Chat & Call Routing.
 */

export const CHAT_CONTEXTS = {
    ZOOGNO_SUPPORT: 'ZOOGNO_SUPPORT',
    SELLER: 'SELLER',
    DRIVER: 'DRIVER',
};

/**
 * Determines the active chat contact (who the customer should be talking to)
 * based on the current order status.
 *
 * @param {Object} order - The active order object.
 * @returns {string} One of the CHAT_CONTEXTS values.
 */
export const getActiveChatContext = (order) => {
    if (!order) {
        // Pre-Order Placement -> Chat with Zoogno
        return CHAT_CONTEXTS.ZOOGNO_SUPPORT;
    }

    const status = order.status?.toUpperCase() || '';

    // After Order Placement (Until Pickup) -> Chat with Seller
    if (['PENDING', 'CONFIRMED', 'PREPARING', 'PACKED', 'READY_FOR_PICKUP'].includes(status)) {
        return CHAT_CONTEXTS.SELLER;
    }

    // After Delivery Partner Assignment -> Chat with Driver
    if (['PICKED_UP', 'OUT_FOR_DELIVERY', 'IN_TRANSIT'].includes(status)) {
        return CHAT_CONTEXTS.DRIVER;
    }

    // After Delivery (or if cancelled/returned) -> Chat with Zoogno
    if (['DELIVERED', 'COMPLETED', 'CANCELLED', 'RETURNED', 'RETURN_PENDING'].includes(status)) {
        return CHAT_CONTEXTS.ZOOGNO_SUPPORT;
    }

    // Default fallback
    return CHAT_CONTEXTS.ZOOGNO_SUPPORT;
};

/**
 * Returns configuration for the chat header based on the active context.
 *
 * @param {string} context - The active CHAT_CONTEXTS.
 * @param {Object} order - The active order.
 * @returns {Object} { title, subtitle, bgColor }
 */
export const getChatHeaderConfig = (context, order) => {
    switch (context) {
        case CHAT_CONTEXTS.SELLER:
            return {
                title: 'Chat with Seller',
                subtitle: order?.seller?.name || order?.sellerName || 'Order Preparation',
                bgColor: 'var(--chat-deep)',
            };
        case CHAT_CONTEXTS.DRIVER:
            return {
                title: 'Chat with Delivery Partner',
                subtitle: order?.deliveryPartner?.name || order?.driverName || 'Out for Delivery',
                bgColor: 'var(--chat-primary)',
            };
        case CHAT_CONTEXTS.ZOOGNO_SUPPORT:
        default:
            return {
                title: 'Zoogno Support',
                subtitle: order ? `Query regarding Order #${order.orderId}` : 'How can we help you?',
                bgColor: 'var(--chat-bg-dark)',
            };
    }
};
