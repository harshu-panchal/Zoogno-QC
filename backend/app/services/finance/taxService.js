import Order from "../../models/order.js";

/**
 * Generates tax statements by aggregating delivered orders.
 * @param {Object} params 
 * @param {Date|string} params.startDate
 * @param {Date|string} params.endDate
 * @returns {Promise<Object>} Tax summary and breakdown
 */
export const generateTaxStatements = async ({ startDate, endDate }) => {
  const query = {
    status: "delivered",
  };

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  // 1. Overall Summary
  const summaryResult = await Order.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalTaxCollected: { $sum: "$paymentBreakdown.taxTotal" },
        totalProductSubtotal: { $sum: "$paymentBreakdown.productSubtotal" },
        totalDeliveryFeeCharged: { $sum: "$paymentBreakdown.deliveryFeeCharged" },
        totalHandlingFeeCharged: { $sum: "$paymentBreakdown.handlingFeeCharged" },
      }
    }
  ]);

  const summary = summaryResult[0] || {
    totalOrders: 0,
    totalTaxCollected: 0,
    totalProductSubtotal: 0,
    totalDeliveryFeeCharged: 0,
    totalHandlingFeeCharged: 0,
  };

  // 2. Breakdown by GST Rate
  const breakdownResult = await Order.aggregate([
    { $match: query },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.gstRate",
        totalTaxableValue: {
          $sum: { $multiply: ["$items.price", "$items.quantity"] }
        },
        itemsSold: { $sum: "$items.quantity" }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const breakdown = breakdownResult.map(item => ({
    gstRate: item._id || 0,
    totalTaxableValue: item.totalTaxableValue,
    calculatedTax: item.totalTaxableValue * ((item._id || 0) / 100),
    itemsSold: item.itemsSold
  }));

  // 3. Daily Trend (for charts)
  const dailyTrendResult = await Order.aggregate([
    { $match: query },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
        },
        taxCollected: { $sum: "$paymentBreakdown.taxTotal" },
        productSubtotal: { $sum: "$paymentBreakdown.productSubtotal" }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const dailyTrend = dailyTrendResult.map(item => ({
    date: item._id,
    taxCollected: item.taxCollected,
    productSubtotal: item.productSubtotal
  }));

  return {
    summary,
    breakdown,
    dailyTrend
  };
};
