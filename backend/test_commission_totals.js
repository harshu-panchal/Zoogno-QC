/**
 * Quick test: download both commission summary CSVs and compare totals.
 * Run from the backend directory: node test_commission_totals.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import {
  generateZoognoCommissionSummaryCsv,
  generateSellerWiseCommissionSummaryCsv,
} from "./app/services/gst/gstReportService.js";

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Connected to MongoDB\n");

  const params = { financialYear: "2026-27" };

  console.log("─── Generating existing Commission Summary ───");
  const existingCsv = await generateZoognoCommissionSummaryCsv(params);

  console.log("─── Generating Seller-wise Commission Summary ───");
  const newCsv = await generateSellerWiseCommissionSummaryCsv(params);

  // Parse the last line of existing (grand total)
  const existingLines = existingCsv.split("\n").filter(l => l.trim());
  const existingTotalLine = existingLines[existingLines.length - 1];
  console.log("\n📊 EXISTING report last line (Total):");
  console.log("  ", existingTotalLine);

  // Parse the new CSV — find all "Total (" lines and "Grand Total" line
  const newLines = newCsv.split("\n");
  const sellerTotals = [];
  let grandTotalLine = null;

  for (const line of newLines) {
    if (line.startsWith("Total (") || line.startsWith('"Total (')) {
      sellerTotals.push(line);
    }
    if (line.startsWith("Grand Total") || line.startsWith('"Grand Total"')) {
      grandTotalLine = line;
    }
  }

  console.log("\n📊 NEW report — Per-seller Totals:");
  for (const st of sellerTotals) {
    console.log("  ", st);
  }

  console.log("\n📊 NEW report — Grand Total:");
  console.log("  ", grandTotalLine);

  // Verify: sum of seller totals should equal grand total
  // Parse CSV values (cols 3-7 are taxable, igst, cgst, sgst, cess)
  function parseTotalLine(line) {
    // Simple CSV split (handles quoted fields)
    const parts = line.split(",").map(p => p.replace(/"/g, "").trim());
    return {
      label: parts[0],
      taxable: parseFloat(parts[3]) || 0,
      igst: parseFloat(parts[4]) || 0,
      cgst: parseFloat(parts[5]) || 0,
      sgst: parseFloat(parts[6]) || 0,
      cess: parseFloat(parts[7]) || 0,
    };
  }

  let sumTaxable = 0, sumIgst = 0, sumCgst = 0, sumSgst = 0, sumCess = 0;
  for (const st of sellerTotals) {
    const p = parseTotalLine(st);
    sumTaxable += p.taxable;
    sumIgst += p.igst;
    sumCgst += p.cgst;
    sumSgst += p.sgst;
    sumCess += p.cess;
  }

  const grand = grandTotalLine ? parseTotalLine(grandTotalLine) : null;

  console.log("\n─── VERIFICATION ───");
  console.log(`Sum of seller totals:  Taxable=${sumTaxable.toFixed(2)}  IGST=${sumIgst.toFixed(2)}  CGST=${sumCgst.toFixed(2)}  SGST=${sumSgst.toFixed(2)}  CESS=${sumCess.toFixed(2)}`);
  if (grand) {
    console.log(`Grand Total row:       Taxable=${grand.taxable.toFixed(2)}  IGST=${grand.igst.toFixed(2)}  CGST=${grand.cgst.toFixed(2)}  SGST=${grand.sgst.toFixed(2)}  CESS=${grand.cess.toFixed(2)}`);
    
    const match = 
      Math.abs(sumTaxable - grand.taxable) < 0.01 &&
      Math.abs(sumIgst - grand.igst) < 0.01 &&
      Math.abs(sumCgst - grand.cgst) < 0.01 &&
      Math.abs(sumSgst - grand.sgst) < 0.01 &&
      Math.abs(sumCess - grand.cess) < 0.01;
    
    console.log(`\n${match ? "✅ PASS" : "❌ FAIL"}: Seller totals ${match ? "match" : "DO NOT match"} Grand Total`);
  }

  // Also compare with existing report's total
  const existingTotal = parseTotalLine(existingTotalLine);
  console.log(`\nExisting report Total: Taxable=${existingTotal.taxable.toFixed(2)}  IGST=${existingTotal.igst.toFixed(2)}  CGST=${existingTotal.cgst.toFixed(2)}  SGST=${existingTotal.sgst.toFixed(2)}  CESS=${existingTotal.cess.toFixed(2)}`);

  const crossMatch =
    grand &&
    Math.abs(existingTotal.taxable - grand.taxable) < 0.01 &&
    Math.abs(existingTotal.igst - grand.igst) < 0.01 &&
    Math.abs(existingTotal.cgst - grand.cgst) < 0.01 &&
    Math.abs(existingTotal.sgst - grand.sgst) < 0.01 &&
    Math.abs(existingTotal.cess - grand.cess) < 0.01;

  console.log(`${crossMatch ? "✅ PASS" : "❌ FAIL"}: New Grand Total ${crossMatch ? "matches" : "DOES NOT match"} existing report Total`);

  console.log("\n─── Seller count: " + sellerTotals.length + " ───");

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
