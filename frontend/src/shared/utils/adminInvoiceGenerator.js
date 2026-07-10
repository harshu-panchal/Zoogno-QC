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

export const generateAdminInvoicePdf = async (order, settings = {}, returnDocOnly = false, existingDoc = null) => {
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
      i.src = settings?.logoUrl || '/zoognologo.jpeg';
      i.onload = () => resolve(i);
      i.onerror = reject;
    });
    // Add logo to PDF
    doc.addImage(img, 'JPEG', 12, 12, 35, 12);
  } catch (error) {
    console.error("Failed to load logo", error);
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(50, 168, 82);
    doc.text(settings?.appName?.substring(0, 4) || "Zoog", 15, 25);
    const zWidth = doc.getTextWidth(settings?.appName?.substring(0, 4) || "Zoog");
    doc.setTextColor(19, 93, 31);
    doc.text(settings?.appName?.substring(4) || "no", 15 + zWidth, 25);
  }

  doc.setFontSize(18);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.text("Tax Invoice", pageWidth - 15, 25, { align: "right" });

  // Main container border
  const marginX = 10;
  let startY = 35;
  const contentWidth = pageWidth - 20;

  doc.setLineWidth(0.3);
  doc.line(marginX, startY, pageWidth - marginX, startY);

  // ----------------------------------------------------
  // SECTION 1: Sold By (Platform Details)
  // ----------------------------------------------------
  let currentY = startY;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Sold By", marginX + 2, currentY + 5);

  const cName = settings?.companyName || settings?.appName || "Zoogno Private Limited";
  const cAddress = settings?.address || "Headquarters Address";
  const cGstin = settings?.gstin || settings?.taxId || "Not Provided";
  const cFssai = settings?.fssaiLicense || "Not Provided";
  const cCin = settings?.cinNumber || "Not Provided";
  const cPan = settings?.panNumber || "Not Provided";

  doc.setFont("helvetica", "normal");
  doc.text(cName, marginX + 2, currentY + 10);
  const splitAddress = doc.splitTextToSize(cAddress, 100);
  doc.text(splitAddress, marginX + 2, currentY + 15);

  let detailsY = currentY + 15 + (splitAddress.length * 4);

  // Left side platform meta
  const metaY = detailsY + 2;
  doc.line(marginX, metaY, pageWidth - marginX, metaY);

  doc.setFont("helvetica", "bold");
  doc.text("GSTIN", marginX + 2, metaY + 5);
  doc.text("FSSAI License Number", marginX + 2, metaY + 10);
  doc.text("CIN", marginX + 2, metaY + 15);
  doc.text("PAN", marginX + 2, metaY + 20);

  doc.setFont("helvetica", "normal");
  doc.text(`: ${cGstin}`, marginX + 40, metaY + 5);
  doc.text(`: ${cFssai}`, marginX + 40, metaY + 10);
  doc.text(`: ${cCin}`, marginX + 40, metaY + 15);
  doc.text(`: ${cPan}`, marginX + 40, metaY + 20);

  // Right side block split
  const vLineX = marginX + 115;
  doc.line(vLineX, startY, vLineX, metaY + 23);

  const displayOrderId = order?.orderId || order?.id || order?._id || "N/A";

  // Right block (QR placeholder and meta)
  const qrBaseY = startY + 5;
  try {
    const qrUrl = await QRCode.toDataURL(displayOrderId, { margin: 1 });
    doc.addImage(qrUrl, 'PNG', vLineX + 25, qrBaseY, 20, 20);
    doc.setFontSize(6);
    doc.text("Scan to Verify", vLineX + 35, qrBaseY + 23, { align: "center" });
  } catch (error) {
    console.error("Failed to generate QR code", error);
    doc.rect(vLineX + 25, qrBaseY, 20, 20);
    doc.setFontSize(7);
    doc.text("QR", vLineX + 33, qrBaseY + 12);
  }

  const formattedInvoiceNum = `Invoice No: PLT-${chunkString(displayOrderId, 20)}`;
  const splitInvoiceNum = doc.splitTextToSize(formattedInvoiceNum, pageWidth - vLineX - 12);
  doc.text(splitInvoiceNum, vLineX + 10, qrBaseY + 25);

  currentY = metaY + 23;
  doc.line(marginX, currentY, pageWidth - marginX, currentY);

  // ----------------------------------------------------
  // SECTION 2: Invoice To
  // ----------------------------------------------------
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Invoice To", marginX + 2, currentY + 5);

  const custName = order?.customer?.name || order?.address?.name || "Customer";
  let custAddress = "";
  let custPin = "-";
  let custState = "";

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
    custAddress = order.address;
    const pinMatch = custAddress.match(/\b\d{6}\b/);
    if (pinMatch) custPin = pinMatch[0];
    custState = extractState(custAddress);
  } else if (order?.address) {
    custAddress = [order.address.address, order.address.landmark, order.address.city, order.address.state].filter(Boolean).join(", ");
    custPin = order.address.zipCode || order.address.pincode || "-";
    custState = order.address.state || extractState(custAddress);
  }

  doc.text("Name", marginX + 2, currentY + 10);
  doc.text("Address", marginX + 2, currentY + 15);
  doc.text("Pincode", marginX + 2, currentY + 30);

  doc.setFont("helvetica", "normal");
  doc.text(`: ${custName}`, marginX + 20, currentY + 10);

  const splitCAddress = doc.splitTextToSize(`: ${custAddress}`, 90);
  doc.text(splitCAddress, marginX + 20, currentY + 15);
  doc.text(`: ${custPin}`, marginX + 20, currentY + 30);

  // Right side (Order details)
  doc.line(vLineX, currentY, vLineX, currentY + 33);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  const chunkedOrderId = chunkString(displayOrderId, 20);
  const splitOrderIdRight = doc.splitTextToSize(`: ${chunkedOrderId}`, pageWidth - vLineX - 25);
  const orderIdHeight = splitOrderIdRight.length * 4;
  doc.text(splitOrderIdRight, vLineX + 25, currentY + 10);
  
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Order Id", vLineX + 2, currentY + 10);
  doc.text("Invoice Date", vLineX + 2, currentY + 10 + orderIdHeight);
  doc.text("Place of Supply", vLineX + 2, currentY + 15 + orderIdHeight);
  
  doc.setFont("helvetica", "normal");
  let formattedDate = "N/A";
  try {
    const d = order?.createdAt ? new Date(order.createdAt) : new Date();
    formattedDate = isNaN(d.getTime()) ? format(new Date(), "dd-MMM-yyyy") : format(d, "dd-MMM-yyyy");
  } catch(e) {
    formattedDate = "N/A";
  }
  doc.text(`: ${formattedDate}`, vLineX + 25, currentY + 10 + orderIdHeight);
  doc.text(`: ${custState}`, vLineX + 25, currentY + 15 + orderIdHeight);

  currentY += 33;
  doc.line(marginX, currentY, pageWidth - marginX, currentY);

  // ----------------------------------------------------
  // SECTION 3: Admin Charges Table
  // ----------------------------------------------------
  const tableH = 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);

  // Specific columns mimicking Blinkit exactly
  const cols = [
    { name: "Sr. no", x: marginX, w: 10 },
    { name: "HSN Code", x: marginX + 10, w: 15 },
    { name: "Item Description", x: marginX + 25, w: 35 },
    { name: "MRP", x: marginX + 60, w: 12 },
    { name: "Discount", x: marginX + 72, w: 14 },
    { name: "Qty.", x: marginX + 86, w: 8 },
    { name: "Taxable Value", x: marginX + 94, w: 20 },
    { name: "CGST (%)", x: marginX + 114, w: 14 },
    { name: "CGST (INR)", x: marginX + 128, w: 16 },
    { name: "SGST (%)", x: marginX + 144, w: 14 },
    { name: "SGST (INR)", x: marginX + 158, w: 16 },
    { name: "Total", x: marginX + 174, w: 16 }
  ];

  cols.forEach(col => {
    doc.text(col.name, col.x + 1, currentY + 5);
    doc.line(col.x, currentY, col.x, currentY + tableH);
  });
  doc.line(pageWidth - marginX, currentY, pageWidth - marginX, currentY + tableH);

  currentY += tableH;
  doc.line(marginX, currentY, pageWidth - marginX, currentY);

  // Table Data
  doc.setFont("helvetica", "normal");
  let tableRowsY = currentY;

  // Extract fees
  const deliveryFee = Number(order?.pricing?.deliveryFee || order?.paymentBreakdown?.deliveryFeeCharged || 0);
  const handlingFee = Number(order?.paymentBreakdown?.handlingFeeCharged || 0);
  const platformFee = Number(order?.pricing?.platformFee || order?.paymentBreakdown?.adminProductCommissionTotal || 0);
  const surgeCharge = Number(order?.pricing?.surgeCharge || order?.paymentBreakdown?.surgeChargeCharged || 0);

  const adminCharges = [];
  if (deliveryFee > 0) adminCharges.push({ desc: "Delivery charge", amount: deliveryFee, hsn: settings?.hsnCodes?.delivery || "996813" });
  if (handlingFee > 0) adminCharges.push({ desc: "Handling charge", amount: handlingFee, hsn: settings?.hsnCodes?.handling || "996711" });
  if (surgeCharge > 0) adminCharges.push({ desc: "Surge Charge", amount: surgeCharge, hsn: settings?.hsnCodes?.surge || "999999" });

  let totalQty = 0;
  let totalAmount = 0;
  let totalCgstInr = 0;
  let totalSgstInr = 0;

  adminCharges.forEach((charge, index) => {
    const qty = 1;
    const mrp = charge.amount;
    const taxRate = 0.18; // 18% standard GST for services
    const taxableValue = mrp / (1 + taxRate);
    const cgstInr = (taxableValue * 0.09);
    const sgstInr = (taxableValue * 0.09);

    totalQty += qty;
    totalAmount += mrp;
    totalCgstInr += cgstInr;
    totalSgstInr += sgstInr;

    const rowH = 6;

    doc.text(`${index + 1}`, cols[0].x + 1, tableRowsY + 4);
    doc.text(charge.hsn, cols[1].x + 1, tableRowsY + 4);
    doc.text(charge.desc, cols[2].x + 1, tableRowsY + 4);
    doc.text(mrp.toFixed(2), cols[3].x + 1, tableRowsY + 4);
    doc.text("0", cols[4].x + 1, tableRowsY + 4);
    doc.text(`${qty}`, cols[5].x + 1, tableRowsY + 4);
    doc.text(taxableValue.toFixed(2), cols[6].x + 1, tableRowsY + 4);
    doc.text("9", cols[7].x + 1, tableRowsY + 4);
    doc.text(cgstInr.toFixed(2), cols[8].x + 1, tableRowsY + 4);
    doc.text("9", cols[9].x + 1, tableRowsY + 4);
    doc.text(sgstInr.toFixed(2), cols[10].x + 1, tableRowsY + 4);
    doc.text(mrp.toFixed(2), cols[11].x + 1, tableRowsY + 4);

    cols.forEach(col => {
      doc.line(col.x, tableRowsY, col.x, tableRowsY + rowH);
    });
    doc.line(pageWidth - marginX, tableRowsY, pageWidth - marginX, tableRowsY + rowH);

    tableRowsY += rowH;
    doc.line(marginX, tableRowsY, pageWidth - marginX, tableRowsY);
  });

  // Total Row
  const totalRowH = 6;
  doc.setFont("helvetica", "bold");
  doc.text("Total", cols[0].x + 1, tableRowsY + 4);
  doc.text("0", cols[4].x + 1, tableRowsY + 4);
  doc.text(`${totalQty}`, cols[5].x + 1, tableRowsY + 4);
  doc.text((totalAmount / 1.18).toFixed(2), cols[6].x + 1, tableRowsY + 4);
  doc.text(totalCgstInr.toFixed(2), cols[8].x + 1, tableRowsY + 4);
  doc.text(totalSgstInr.toFixed(2), cols[10].x + 1, tableRowsY + 4);
  doc.text(totalAmount.toFixed(2), cols[11].x + 1, tableRowsY + 4);

  cols.forEach(col => {
    // Only vertical borders for specific columns in total row based on Blinkit style
    if (["Sr. no", "Discount", "Qty.", "Taxable Value", "CGST (INR)", "SGST (INR)", "Total"].includes(col.name) || col.name === "CGST (%)" || col.name === "SGST (%)") {
      doc.line(col.x, tableRowsY, col.x, tableRowsY + totalRowH);
    }
  });
  doc.line(pageWidth - marginX, tableRowsY, pageWidth - marginX, tableRowsY + totalRowH);

  tableRowsY += totalRowH;
  doc.line(marginX, tableRowsY, pageWidth - marginX, tableRowsY);

  // ----------------------------------------------------
  // SECTION 4: Amount in Words
  // ----------------------------------------------------
  const wordsH = 6;
  doc.setFontSize(8);
  doc.text(`Amount in Words: ${numberToWords(totalAmount)}`, marginX + 2, tableRowsY + 4);

  // Add an overarching border rect for everything so far
  doc.rect(marginX, startY, contentWidth, tableRowsY - startY + wordsH);

  currentY = tableRowsY + wordsH + 5;

  // ----------------------------------------------------
  // SECTION 5: Footer / Platform Info
  // ----------------------------------------------------
  doc.rect(marginX, currentY, contentWidth, 30);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(`For ${cName}`, marginX + 5, currentY + 5);

  // Signature Placeholder
  doc.setFont("helvetica", "normal");
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
      // Try to fit the signature in a 40x15 box above the text
      doc.addImage(sigImg, 'PNG', marginX + 5, currentY + 7, 40, 15);
    } catch (err) {
      console.error("Failed to load signature image", err);
      doc.line(marginX + 5, currentY + 22, marginX + 45, currentY + 22);
    }
  } else {
    doc.line(marginX + 5, currentY + 22, marginX + 45, currentY + 22);
  }
  
  doc.text("Authorised Signatory", marginX + 5, currentY + 27);

  currentY += 30;

  // Reverse charge
  doc.rect(marginX, currentY, contentWidth, 6);
  doc.setFont("helvetica", "bold");
  doc.text("Whether the tax is payable on reverse charge - No", marginX + 2, currentY + 4);

  currentY += 6;

  // Terms & Conditions
  doc.rect(marginX, currentY, contentWidth, 25);
  doc.text("Terms & Conditions:", marginX + 2, currentY + 4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  const tnc1 = `1. If you have any issues or queries in respect of your order, please contact customer chat support through the ${settings?.appName || 'Zoogno'} platform.`;
  const tnc2 = "2. In case you need to get more information about seller's FSSAI status, please visit https://foscos.fssai.gov.in/ and use the FBO search option.";
  const tnc3 = "3. Please note that we never ask for bank account details such as CVV, account number, UPI Pin, etc. across our support channels. For your safety please do not share these details with anyone over any medium.";

  doc.text(doc.splitTextToSize(tnc1, contentWidth - 4), marginX + 2, currentY + 9);
  doc.text(doc.splitTextToSize(tnc2, contentWidth - 4), marginX + 2, currentY + 13);
  doc.text(doc.splitTextToSize(tnc3, contentWidth - 4), marginX + 2, currentY + 17);

  // Save PDF or return doc
  if (!returnDocOnly) {
    doc.save(`Invoice_${displayOrderId}.pdf`);
  }
  return doc;
};
