import { jsPDF } from "jspdf";
import { format } from "date-fns";
import QRCode from 'qrcode';

/**
 * Helper to convert number to words
 */
function numberToWords(amount) {
  const units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const scales = ["", "Thousand", "Million", "Billion"];

  if (amount === 0) return "Zero Rupees Only";

  let rupeePart = Math.floor(amount);
  const paisePart = Math.round((amount - rupeePart) * 100);

  function convertGroup(n) {
    let str = "";
    if (n > 99) {
      str += units[Math.floor(n / 100)] + " Hundred ";
      n %= 100;
    }
    if (n > 9 && n < 20) {
      str += teens[n - 10] + " ";
    } else {
      if (n >= 20) {
        str += tens[Math.floor(n / 10)] + " ";
        n %= 10;
      }
      if (n > 0) {
        str += units[n] + " ";
      }
    }
    return str.trim();
  }

  if (rupeePart === 0) {
    return paisePart > 0 ? `${paisePart} Paise Only` : "Zero Rupees Only";
  }

  let words = "";
  let scaleIdx = 0;

  while (rupeePart > 0) {
    const group = rupeePart % 1000;
    if (group !== 0) {
      const groupWords = convertGroup(group);
      words = groupWords + " " + scales[scaleIdx] + " " + words;
    }
    rupeePart = Math.floor(rupeePart / 1000);
    scaleIdx++;
  }

  words = words.trim() + " Rupees And ";

  if (paisePart > 0) {
    words += convertGroup(paisePart) + " Paise Only";
  } else {
    words += "Zero Paisa Only";
  }

  return words;
}

const chunkString = (str, length) => {
  if (!str) return "";
  return str.match(new RegExp('.{1,' + length + '}', 'g'))?.join(' ') || str;
};

export const generateInvoicePdf = async (order, settings = {}, returnDocOnly = false, existingDoc = null, bagId = null, basketId = null) => {
  // Initialize jsPDF document (A4 size) if not provided
  const doc = existingDoc || new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  
  // Set default styling
  doc.setFont("helvetica");

  // ----------------------------------------------------
  // HEADER
  // ----------------------------------------------------
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.crossOrigin = 'Anonymous';
      i.src = '/zoognologo.jpeg';
      i.onload = () => resolve(i);
      i.onerror = reject;
    });
    // Add logo to PDF (image, format, x, y, width, height)
    // Adjusting width and height to maintain aspect ratio (assuming something like 3:1 or 4:1)
    doc.addImage(img, 'JPEG', 12, 12, 35, 12);
  } catch (error) {
    console.error("Failed to load logo", error);
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(50, 168, 82); // Greenish logo color
    doc.text("Zoog", 15, 25);
    const zoogWidth = doc.getTextWidth("Zoog");
    doc.setTextColor(19, 93, 31); // #135d1f
    doc.text("no", 15 + zoogWidth, 25);
  }
  
  doc.setFontSize(18);
  doc.setTextColor(0, 0, 0);
  doc.text("Tax Invoice", pageWidth - 15, 25, { align: "right" });

  // Draw main border rect
  const marginX = 10;
  let startY = 35;
  const contentWidth = pageWidth - 20;
  
  // Header line
  doc.setLineWidth(0.5);
  doc.line(marginX, startY, pageWidth - marginX, startY);
  
  // ----------------------------------------------------
  // SECTION 1: Seller Details
  // ----------------------------------------------------
  let currentY = startY;
  
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Sold By / Seller", marginX + 2, currentY + 5);
  
  const seller = order?.seller || {};
  const sName = seller?.shopName || seller?.name || "Zoogno Seller";
  const sAddressDetails = [seller?.address, seller?.locality, seller?.city, seller?.state, seller?.pincode].filter(Boolean).join(", ");
  const sAddress = sAddressDetails || "Address not provided";
  const sGstin = seller?.gstin || "Not Provided";
  const sFssai = seller?.fssai || seller?.documents?.fssaiLicense || seller?.tradeLicenseNumber || "Not Provided";
  const sCin = seller?.cin || seller?.cinNumber || "Not Provided";
  const sPan = seller?.pan || seller?.panNumber || "Not Provided";

  doc.text(sName.toUpperCase(), marginX + 2, currentY + 10);
  
  doc.setFont("helvetica", "normal");
  const splitAddress = doc.splitTextToSize(sAddress, 100);
  doc.text(splitAddress, marginX + 2, currentY + 15);
  
  let detailsY = currentY + 15 + (splitAddress.length * 4);
  
  // Left side seller meta
  const metaY = detailsY + 2;
  doc.line(marginX, metaY, pageWidth - marginX, metaY);
  
  doc.setFont("helvetica", "bold");
  doc.text("GSTIN", marginX + 2, metaY + 5);
  doc.text("FSSAI License Number", marginX + 2, metaY + 10);
  doc.text("CIN", marginX + 2, metaY + 15);
  doc.text("PAN", marginX + 2, metaY + 20);

  doc.setFont("helvetica", "normal");
  doc.text(`: ${sGstin}`, marginX + 40, metaY + 5);
  doc.text(`: ${sFssai}`, marginX + 40, metaY + 10);
  doc.text(`: ${sCin}`, marginX + 40, metaY + 15);
  doc.text(`: ${sPan}`, marginX + 40, metaY + 20);
  
  // Split Line (Vertical) for right block
  const vLineX = marginX + 105;
  doc.line(vLineX, startY, vLineX, metaY + 23);
  
  // Right side block (QR and Invoice num)
  const qrBaseY = startY + 5;
  
  try {
      let qrX = vLineX + 10;
      if (bagId) {
          const bagQrUrl = await QRCode.toDataURL(bagId, { margin: 1 });
          doc.addImage(bagQrUrl, 'PNG', qrX, qrBaseY, 20, 20);
          doc.setFontSize(6);
          doc.text("Bag QR", qrX + 10, qrBaseY + 23, { align: "center" });
          qrX += 25;
      }
      if (basketId) {
          const basketQrUrl = await QRCode.toDataURL(basketId, { margin: 1 });
          doc.addImage(basketQrUrl, 'PNG', qrX, qrBaseY, 20, 20);
          doc.setFontSize(6);
          doc.text("Basket QR", qrX + 10, qrBaseY + 23, { align: "center" });
      }
      if (!bagId && !basketId) {
          doc.rect(vLineX + 25, qrBaseY, 20, 20);
          doc.setFontSize(7);
          doc.text("QR", vLineX + 33, qrBaseY + 12);
      }
  } catch (error) {
      console.error("Failed to generate QR codes for invoice:", error);
      doc.rect(vLineX + 25, qrBaseY, 20, 20);
      doc.setFontSize(7);
      doc.text("QR", vLineX + 33, qrBaseY + 12);
  }
  
  const displayOrderId = order?.orderId || order?.id || order?._id || "N/A";
  
  doc.setFontSize(7);
  const formattedInvoiceNum = `Invoice No: INV-${chunkString(displayOrderId, 20)}`;
  const splitInvoiceNum = doc.splitTextToSize(formattedInvoiceNum, pageWidth - vLineX - 12);
  doc.text(splitInvoiceNum, vLineX + 10, qrBaseY + 26);
  
  currentY = metaY + 23;
  if (splitInvoiceNum.length > 2) {
    currentY += 5;
  }
  doc.line(marginX, currentY, pageWidth - marginX, currentY);

  // ----------------------------------------------------
  // SECTION 2: Invoice To
  // ----------------------------------------------------
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Invoice To", marginX + 2, currentY + 5);
  
  const cName = order?.customer?.name || order?.address?.name || "Customer";
  
  // Handle case where order.address is already a formatted string vs an object
  let cAddress = "";
  let cPin = "-";
  let cState = "";
  
  const extractState = (addrStr) => {
    if (!addrStr) return "";
    const states = ["Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Delhi", "Chandigarh"];
    for (const state of states) {
      if (new RegExp(`\\b${state}\\b`, 'i').test(addrStr)) {
        return state;
      }
    }
    return "";
  };

  if (typeof order?.address === 'string') {
      cAddress = order.address;
      const pinMatch = cAddress.match(/\b\d{6}\b/);
      if (pinMatch) cPin = pinMatch[0];
      cState = extractState(cAddress);
  } else if (order?.address) {
      cAddress = [order.address.address, order.address.landmark, order.address.city, order.address.state, order.address.zipCode].filter(Boolean).join(", ");
      cPin = order.address.zipCode || order.address.pincode || "-";
      cState = order.address.state || extractState(cAddress);
  }

  doc.text("Name", marginX + 2, currentY + 10);
  doc.text("Address", marginX + 2, currentY + 15);
  doc.text("Pin code", marginX + 2, currentY + 25);
  doc.text("State", marginX + 2, currentY + 30);
  
  doc.setFont("helvetica", "normal");
  doc.text(`: ${cName}`, marginX + 20, currentY + 10);
  
  const splitCAddress = doc.splitTextToSize(`: ${cAddress}`, 80);
  doc.text(splitCAddress, marginX + 20, currentY + 15);
  
  doc.text(`: ${cPin}`, marginX + 20, currentY + 25);
  doc.text(`: ${cState}`, marginX + 20, currentY + 30);

  // Right side (Order details)
  doc.line(vLineX, currentY, vLineX, currentY + 32);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  const chunkedOrderId = chunkString(displayOrderId, 20);
  const splitOrderId = doc.splitTextToSize(`: ${chunkedOrderId}`, pageWidth - vLineX - 25);
  doc.text(splitOrderId, vLineX + 25, currentY + 10);
  
  const orderIdHeight = splitOrderId.length * 4;
  
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Order Id", vLineX + 2, currentY + 5);
  doc.text("Invoice Date", vLineX + 2, currentY + 5 + orderIdHeight);
  doc.text("Place of Supply", vLineX + 2, currentY + 10 + orderIdHeight);
  
  doc.setFont("helvetica", "normal");
  doc.text(`: ${format(new Date(order?.createdAt || Date.now()), "dd-MMM-yyyy")}`, vLineX + 25, currentY + 5 + orderIdHeight);
  doc.text(`: ${cState}`, vLineX + 25, currentY + 10 + orderIdHeight);

  currentY += 32;
  doc.line(marginX, currentY, pageWidth - marginX, currentY);

  // ----------------------------------------------------
  // SECTION 3: Item Table
  // ----------------------------------------------------
  // Table Header
  const tableH = 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  
  const cols = [
    { name: "Sr. no", x: marginX, w: 8 },
    { name: "HSN Code", x: marginX + 8, w: 15 },
    { name: "UPC Number", x: marginX + 23, w: 17 },
    { name: "Item Description", x: marginX + 40, w: 25 },
    { name: "MRP", x: marginX + 65, w: 12 },
    { name: "Discount", x: marginX + 77, w: 13 },
    { name: "Qty.", x: marginX + 90, w: 7 },
    { name: "Taxable Value", x: marginX + 97, w: 18 },
    { name: "CGST (%)", x: marginX + 115, w: 12 },
    { name: "CGST (INR)", x: marginX + 127, w: 15 },
    { name: "SGST (%)", x: marginX + 142, w: 12 },
    { name: "SGST (INR)", x: marginX + 154, w: 15 },
    { name: "Total", x: marginX + 169, w: 18 }
  ];
  
  cols.forEach(col => {
    doc.text(col.name, col.x + 1, currentY + 5);
    doc.line(col.x, currentY, col.x, currentY + tableH); // vertical line
  });
  doc.line(pageWidth - marginX, currentY, pageWidth - marginX, currentY + tableH); // last vertical
  
  currentY += tableH;
  doc.line(marginX, currentY, pageWidth - marginX, currentY);

  // Table Body
  doc.setFont("helvetica", "normal");
  let tableRowsY = currentY;
  
  const items = order?.items || [];
  let totalQty = 0;
  let totalAmount = 0;
  let totalCgst = 0;
  let totalSgst = 0;

  items.forEach((item, index) => {
    const prod = item.product || {};
    const desc = prod.name || item.name || "Product";
    const upc = item.upcNumber || prod.upcNumber || "-";
    const hsn = item.hsnCode || prod.hsnCode || "-";
    const qty = item.quantity || item.qty || 1;
    const sellingPrice = item.price || 0;
    const originalMrp = item.mrp || sellingPrice;
    const itemDiscount = (originalMrp - sellingPrice) * qty;
    const totalItemPrice = item.totalPrice || (sellingPrice * qty);
    
    // Dynamic tax based on item.gstRate (default 18% if not present)
    const itemGstRate = item.gstRate !== undefined ? item.gstRate : 18;
    const taxRate = itemGstRate / 100;
    const halfTaxRate = taxRate / 2;
    const halfTaxPercentage = (itemGstRate / 2).toFixed(2);
    
    const taxableValue = totalItemPrice / (1 + taxRate);
    const cgstInr = (taxableValue * halfTaxRate);
    const sgstInr = (taxableValue * halfTaxRate);

    totalQty += qty;
    totalAmount += totalItemPrice;
    totalCgst += cgstInr;
    totalSgst += sgstInr;

    const splitDesc = doc.splitTextToSize(desc, 23);
    const textHeight = splitDesc.length * 3.5;
    const rowH = Math.max(10, textHeight + 4);
    
    doc.text(`${index + 1}`, cols[0].x + 1, tableRowsY + 5);
    doc.text(hsn.substring(0, 8), cols[1].x + 1, tableRowsY + 5);
    doc.text(upc.substring(0, 14), cols[2].x + 1, tableRowsY + 5);
    
    doc.text(splitDesc, cols[3].x + 1, tableRowsY + 4);
    
    doc.text(originalMrp.toFixed(2), cols[4].x + 1, tableRowsY + 5);
    doc.text(itemDiscount.toFixed(2), cols[5].x + 1, tableRowsY + 5);
    doc.text(`${qty}`, cols[6].x + 1, tableRowsY + 5);
    doc.text(taxableValue.toFixed(2), cols[7].x + 1, tableRowsY + 5);
    doc.text(halfTaxPercentage, cols[8].x + 1, tableRowsY + 5);
    doc.text(cgstInr.toFixed(2), cols[9].x + 1, tableRowsY + 5);
    doc.text(halfTaxPercentage, cols[10].x + 1, tableRowsY + 5);
    doc.text(sgstInr.toFixed(2), cols[11].x + 1, tableRowsY + 5);
    doc.text(totalItemPrice.toFixed(2), cols[12].x + 1, tableRowsY + 5);
    
    cols.forEach(col => {
      doc.line(col.x, tableRowsY, col.x, tableRowsY + rowH);
    });
    doc.line(pageWidth - marginX, tableRowsY, pageWidth - marginX, tableRowsY + rowH);
    
    tableRowsY += rowH;
    doc.line(marginX, tableRowsY, pageWidth - marginX, tableRowsY);
  });
  
  // ----------------------------------------------------
  // SECTION 3B: Extra Charges (Handling, Delivery, Surge)
  // ----------------------------------------------------
  const deliveryFee = Number(order?.pricing?.deliveryFee || order?.paymentBreakdown?.deliveryFeeCharged || 0);
  const handlingFee = Number(order?.pricing?.handlingFee || order?.paymentBreakdown?.handlingFeeCharged || order?.bill?.handlingFee || 0);
  const surgeCharge = Number(order?.pricing?.surgeCharge || order?.paymentBreakdown?.surgeChargeCharged || 0);

  const extraCharges = [];
  if (deliveryFee > 0) extraCharges.push({ desc: "Delivery Fee", amount: deliveryFee, hsn: settings?.hsnCodes?.delivery || "996813" });
  if (handlingFee > 0) extraCharges.push({ desc: "Handling Fee", amount: handlingFee, hsn: settings?.hsnCodes?.handling || "996711" });
  if (surgeCharge > 0) extraCharges.push({ desc: "Surge Charge", amount: surgeCharge, hsn: settings?.hsnCodes?.surge || "999999" });

  extraCharges.forEach((charge, index) => {
    const qty = 1;
    const mrp = charge.amount;
    const taxRate = 0.18; // 18% standard GST for services
    const taxableValue = mrp / (1 + taxRate);
    const cgstInr = (taxableValue * 0.09);
    const sgstInr = (taxableValue * 0.09);

    totalQty += qty;
    totalAmount += mrp;
    totalCgst += cgstInr;
    totalSgst += sgstInr;

    const rowH = 6;
    
    // Sr. no
    doc.text(`${items.length + index + 1}`, cols[0].x + 1, tableRowsY + 5);
    // HSN Code
    doc.text(charge.hsn, cols[1].x + 1, tableRowsY + 5);
    // UPC Number
    doc.text("-", cols[2].x + 1, tableRowsY + 5);
    // Item Description
    doc.text(charge.desc, cols[3].x + 1, tableRowsY + 5);
    // MRP
    doc.text(mrp.toFixed(2), cols[4].x + 1, tableRowsY + 5);
    // Discount
    doc.text("0.00", cols[5].x + 1, tableRowsY + 5);
    // Qty
    doc.text(`${qty}`, cols[6].x + 1, tableRowsY + 5);
    // Taxable Value
    doc.text(taxableValue.toFixed(2), cols[7].x + 1, tableRowsY + 5);
    // CGST (%)
    doc.text("9.00", cols[8].x + 1, tableRowsY + 5);
    // CGST (INR)
    doc.text(cgstInr.toFixed(2), cols[9].x + 1, tableRowsY + 5);
    // SGST (%)
    doc.text("9.00", cols[10].x + 1, tableRowsY + 5);
    // SGST (INR)
    doc.text(sgstInr.toFixed(2), cols[11].x + 1, tableRowsY + 5);
    // Total
    doc.text(mrp.toFixed(2), cols[12].x + 1, tableRowsY + 5);

    cols.forEach(col => {
      doc.line(col.x, tableRowsY, col.x, tableRowsY + rowH);
    });
    doc.line(pageWidth - marginX, tableRowsY, pageWidth - marginX, tableRowsY + rowH);

    tableRowsY += rowH;
    doc.line(marginX, tableRowsY, pageWidth - marginX, tableRowsY);
  });

  // Driver Tip
  if (order.pricing?.tip) {
     const tipVal = order.pricing.tip;
     totalAmount += tipVal;
     const rowH = 6;
     doc.text("Driver Tip", cols[3].x + 1, tableRowsY + 4);
     doc.text(tipVal.toFixed(2), cols[12].x + 1, tableRowsY + 4);
     
     cols.forEach(col => {
       doc.line(col.x, tableRowsY, col.x, tableRowsY + rowH);
     });
     doc.line(pageWidth - marginX, tableRowsY, pageWidth - marginX, tableRowsY + rowH);
     
     tableRowsY += rowH;
     doc.line(marginX, tableRowsY, pageWidth - marginX, tableRowsY);
  }

  // Discount
  if (order.pricing?.discount) {
     const discountVal = order.pricing.discount;
     totalAmount -= discountVal;
     const rowH = 6;
     doc.text("Discount", cols[3].x + 1, tableRowsY + 4);
     doc.text(`-${discountVal.toFixed(2)}`, cols[12].x + 1, tableRowsY + 4);
     
     cols.forEach(col => {
       doc.line(col.x, tableRowsY, col.x, tableRowsY + rowH);
     });
     doc.line(pageWidth - marginX, tableRowsY, pageWidth - marginX, tableRowsY + rowH);
     
     tableRowsY += rowH;
     doc.line(marginX, tableRowsY, pageWidth - marginX, tableRowsY);
  }

  // Total Row
  const totalRowH = 6;
  doc.setFont("helvetica", "bold");
  doc.text("Total", cols[0].x + 1, tableRowsY + 4);
  doc.text(`${totalQty}`, cols[6].x + 1, tableRowsY + 4);
  doc.text(totalCgst.toFixed(2), cols[9].x + 1, tableRowsY + 4);
  doc.text(totalSgst.toFixed(2), cols[11].x + 1, tableRowsY + 4);
  doc.text(totalAmount.toFixed(2), cols[12].x + 1, tableRowsY + 4);
  
  cols.forEach(col => {
    // Only draw vertical lines for boundaries we want in total row
    if (col.name === "Sr. no" || col.name === "Qty." || col.name === "Taxable Value" || col.name === "CGST (INR)" || col.name === "SGST (%)" || col.name === "Total") {
      doc.line(col.x, tableRowsY, col.x, tableRowsY + totalRowH);
    }
  });
  doc.line(pageWidth - marginX, tableRowsY, pageWidth - marginX, tableRowsY + totalRowH);
  
  tableRowsY += totalRowH;
  doc.line(marginX, tableRowsY, pageWidth - marginX, tableRowsY);

  // ----------------------------------------------------
  // SECTION 4: Amount in Words
  // ----------------------------------------------------
  const wordsH = 8;
  doc.setFontSize(8);
  doc.text("Amount in Words:", marginX + 2, tableRowsY + 5);
  doc.setFont("helvetica", "normal");
  doc.text(numberToWords(totalAmount), marginX + 30, tableRowsY + 5);
  
  // Add an overarching border rect for everything so far
  doc.rect(marginX, startY, contentWidth, tableRowsY - startY + wordsH);
  
  currentY = tableRowsY + wordsH + 5;

  // ----------------------------------------------------
  // SECTION 5: Footer / Platform Info
  // ----------------------------------------------------
  doc.rect(marginX, currentY, contentWidth, 30);
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(settings?.companyName || "Zoogno Private Limited", marginX + 2, currentY + 5);
  
  doc.setFontSize(8);
  doc.text("GSTIN", marginX + 2, currentY + 12);
  doc.text("CIN", marginX + 2, currentY + 17);
  
  doc.setFont("helvetica", "normal");
  doc.text(`: ${settings?.gstin || "Not Provided"}`, marginX + 20, currentY + 12);
  doc.text(`: ${settings?.cinNumber || "Not Provided"}`, marginX + 20, currentY + 17);
  
  doc.setFont("helvetica", "bold");
  doc.text("FSSAI License Number", marginX + 70, currentY + 12);
  doc.text("PAN", marginX + 70, currentY + 17);
  
  doc.setFont("helvetica", "normal");
  doc.text(`: ${settings?.fssaiLicense || "Not Provided"}`, marginX + 110, currentY + 12);
  doc.text(`: ${settings?.panNumber || "Not Provided"}`, marginX + 110, currentY + 17);
  
  // Signature Placeholder
  doc.setFontSize(7);
  
  if (settings?.signatureUrl) {
    try {
      const sigImg = await new Promise((resolve, reject) => {
        const i = new Image();
        i.crossOrigin = 'Anonymous';
        i.src = settings.signatureUrl;
        i.onload = () => resolve(i);
        i.onerror = reject;
      });
      // Right aligned box: marginX on right is pageWidth - marginX. Width 40.
      doc.addImage(sigImg, 'PNG', pageWidth - marginX - 45, currentY + 8, 40, 15);
    } catch (err) {
      console.error("Failed to load signature image", err);
      // Fallback line
      doc.line(pageWidth - marginX - 45, currentY + 23, pageWidth - marginX - 5, currentY + 23);
    }
  } else {
      // Fallback line
      doc.line(pageWidth - marginX - 45, currentY + 23, pageWidth - marginX - 5, currentY + 23);
  }
  
  doc.text("Authorised Signatory", pageWidth - marginX - 5, currentY + 28, { align: "right" });
  
  currentY += 30;
  
  // Reverse charge
  doc.rect(marginX, currentY, contentWidth, 6);
  doc.setFont("helvetica", "bold");
  doc.text("Whether the tax is payable on reverse charge - No", marginX + 2, currentY + 4);
  
  currentY += 6;
  
  // Terms & Conditions
  doc.rect(marginX, currentY, contentWidth, 25);
  doc.text("Terms & Conditions:", marginX + 2, currentY + 5);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  const tnc1 = "1. If you have any issues or queries in respect of your order, please contact customer chat support through Zoogno platform.";
  const tnc2 = "2. In case you need to get more information about seller's FSSAI status, please visit https://foscos.fssai.gov.in/ and use the FBO search option.";
  const tnc3 = "3. Please note that we never ask for bank account details such as CVV, account number, UPI Pin, etc. across our support channels. For your safety please do not share these details.";
  
  doc.text(doc.splitTextToSize(tnc1, contentWidth - 4), marginX + 2, currentY + 10);
  doc.text(doc.splitTextToSize(tnc2, contentWidth - 4), marginX + 2, currentY + 14);
  doc.text(doc.splitTextToSize(tnc3, contentWidth - 4), marginX + 2, currentY + 18);
  
  // Save PDF or return doc
  if (!returnDocOnly) {
    doc.save(`Invoice_${displayOrderId}.pdf`);
  }
  return doc;
};
