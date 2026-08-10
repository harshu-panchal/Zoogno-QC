import Order from "../../models/order.js";
import Seller from "../../models/seller.js";

/**
 * Generates GSTR-1 report by aggregating items and computing GST structures.
 * @param {Object} params
 * @param {Date|string} params.startDate
 * @param {Date|string} params.endDate
 * @returns {Promise<Array>} List of line-item GSTR-1 entries
 */
export const generateGstr1Report = async ({ startDate, endDate }) => {
  const query = {
    status: "delivered",
  };

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  // Retrieve all matched orders and populate customer & seller
  const orders = await Order.find(query)
    .populate("customer", "name email phone gstin addresses")
    .populate("seller", "name shopName gstin state address city pincode")
    .sort({ createdAt: -1 })
    .lean();

  const report = [];

  for (const order of orders) {
    const invoiceNo = `INV-${order.orderId}`;
    const invoiceDate = order.deliveredAt || order.createdAt;

    // Customer detail lookup
    const customerName = order.customer?.name || order.address?.name || "Customer";
    // Look for customer GSTIN in customer profile or use a mock/custom field if supported.
    const customerGstin = order.customer?.gstin || "";
    
    // Address detail lookup
    const customerState = order.address?.state || "Unknown";
    const placeOfSupply = customerState;

    const sellerState = order.seller?.state || "Unknown";

    const isIntrastate = sellerState.toLowerCase().trim() === customerState.toLowerCase().trim();

    // Iterate items
    const items = order.items || [];
    for (const item of items) {
      const quantity = item.quantity || 1;
      const unitPrice = item.price || 0;
      const totalItemPrice = unitPrice * quantity;
      
      const itemGstRate = item.gstRate !== undefined ? item.gstRate : 18; // Default 18%
      const taxRate = itemGstRate / 100;
      
      // Reverse-calculate taxable value
      const taxableValue = totalItemPrice / (1 + taxRate);
      const totalGst = totalItemPrice - taxableValue;

      let cgst = 0;
      let sgst = 0;
      let igst = 0;

      if (isIntrastate) {
        cgst = totalGst / 2;
        sgst = totalGst / 2;
      } else {
        igst = totalGst;
      }

      report.push({
        invoiceNo,
        invoiceDate,
        orderId: order.orderId,
        customerName,
        customerGstin,
        customerState,
        placeOfSupply,
        productName: item.name || "Product",
        hsnCode: item.hsnCode || "N/A",
        quantity,
        unitPrice: Number(unitPrice.toFixed(2)),
        taxableValue: Number(taxableValue.toFixed(2)),
        gstRate: itemGstRate,
        cgst: Number(cgst.toFixed(2)),
        sgst: Number(sgst.toFixed(2)),
        igst: Number(igst.toFixed(2)),
        totalGst: Number(totalGst.toFixed(2)),
        invoiceTotal: Number(totalItemPrice.toFixed(2)),
        sellerName: order.seller?.shopName || order.seller?.name || "Seller",
        sellerGstin: order.seller?.gstin || "",
      });
    }
  }

  return report;
};
