import Payout from "../models/payout.js";
import Wallet from "../models/wallet.js";
import Order from "../models/order.js";
import Seller from "../models/seller.js";
import Delivery from "../models/delivery.js";
import handleResponse from "../utils/helper.js";
import { getAdminFinanceSummary } from "../services/finance/walletService.js";
import { getLedgerEntries } from "../services/finance/ledgerService.js";
import { bulkProcessPayouts } from "../services/finance/payoutService.js";
import { exportFinanceStatement } from "../services/finance/statementService.js";
import {
  FINANCE_AUDIT_ACTION,
  OWNER_TYPE,
} from "../constants/finance.js";
import {
  getOrCreateFinanceSettings,
  updateDeliveryFinanceSettings,
} from "../services/finance/financeSettingsService.js";
import { createFinanceAuditLog } from "../services/finance/auditLogService.js";
import {
  financeLedgerQuerySchema,
  payoutProcessSchema,
  updateDeliverySettingsSchema,
} from "../validation/financeValidation.js";
import { validateBodySafe as validateWithJoi } from "../middleware/validate.js";
import {
  getGstConfig,
  updateGstConfig,
} from "../services/gst/gstConfigService.js";
import {
  listGstTransactions,
  generateSellerSalesGstCsv,
  generateZoognoServiceInvoiceCsv,
  generateSellerCommissionCsv,
  generateSettlementReportCsv,
  generateGstReconciliationCsv,
  generateCaPackage,
} from "../services/gst/gstReportService.js";

export const getAdminFinanceSummaryController = async (req, res) => {
  try {
    const summary = await getAdminFinanceSummary();
    return handleResponse(res, 200, "Admin finance summary fetched", summary);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getAdminFinanceLedgerController = async (req, res) => {
  try {
    const validated = validateWithJoi(financeLedgerQuerySchema, req.query || {});
    if (!validated.isValid) {
      return handleResponse(res, 400, validated.message);
    }
    const ledger = await getLedgerEntries(validated.value);
    return handleResponse(res, 200, "Finance ledger fetched", ledger);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getAdminFinancePayoutsController = async (req, res) => {
  try {
    const {
      seller,
      rider,
      status,
      page = 1,
      limit = 25,
    } = req.query;

    const query = {};
    if (status) query.status = status;

    const includeSeller = String(seller).toLowerCase() === "true";
    const includeRider = String(rider).toLowerCase() === "true";
    if (includeSeller && !includeRider) query.payoutType = "SELLER";
    if (!includeSeller && includeRider) query.payoutType = "DELIVERY_PARTNER";

    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);
    const skip = (safePage - 1) * safeLimit;

    const [rawItems, total] = await Promise.all([
      Payout.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .populate("relatedOrderIds", "orderId paymentMode paymentStatus status")
        .lean(),
      Payout.countDocuments(query),
    ]);

    const sellerIds = rawItems
      .filter((item) => item.payoutType === "SELLER")
      .map((item) => item.beneficiaryId);
    const riderIds = rawItems
      .filter((item) => item.payoutType === "DELIVERY_PARTNER")
      .map((item) => item.beneficiaryId);

    const [sellers, riders] = await Promise.all([
      Seller.find({ _id: { $in: sellerIds } })
        .select("_id shopName name phone")
        .lean(),
      Delivery.find({ _id: { $in: riderIds } })
        .select("_id name phone")
        .lean(),
    ]);

    const sellerMap = new Map(sellers.map((seller) => [String(seller._id), seller]));
    const riderMap = new Map(riders.map((rider) => [String(rider._id), rider]));

    const items = rawItems.map((item) => {
      const beneficiary =
        item.payoutType === "SELLER"
          ? sellerMap.get(String(item.beneficiaryId))
          : riderMap.get(String(item.beneficiaryId));
      return {
        ...item,
        beneficiary: beneficiary || null,
      };
    });

    return handleResponse(res, 200, "Finance payouts fetched", {
      items,
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const processAdminFinancePayoutsController = async (req, res) => {
  try {
    const validated = validateWithJoi(payoutProcessSchema, req.body || {});
    if (!validated.isValid) {
      return handleResponse(res, 400, validated.message);
    }

    const result = await bulkProcessPayouts({
      payoutIds: validated.value.payoutIds,
      payoutType: validated.value.payoutType,
      limit: validated.value.limit,
      remarks: validated.value.remarks || "",
      adminId: req.user?.id || null,
    });

    return handleResponse(res, 200, "Payout processing completed", result);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const exportAdminFinanceStatementController = async (req, res) => {
  try {
    const statement = await exportFinanceStatement(req.query || {});
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${statement.fileName}"`,
    );
    return res.status(200).send(statement.csv);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getDeliverySettingsController = async (req, res) => {
  try {
    const settings = await getOrCreateFinanceSettings();
    return handleResponse(res, 200, "Delivery finance settings fetched", settings);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updateDeliverySettingsController = async (req, res) => {
  try {
    const validated = validateWithJoi(updateDeliverySettingsSchema, req.body || {});
    if (!validated.isValid) {
      return handleResponse(res, 400, validated.message);
    }
    const updated = await updateDeliveryFinanceSettings(validated.value);
    await createFinanceAuditLog({
      action: FINANCE_AUDIT_ACTION.DELIVERY_SETTINGS_UPDATED,
      actorType: OWNER_TYPE.ADMIN,
      actorId: req.user?.id || null,
      metadata: {
        updatedFields: Object.keys(validated.value || {}),
      },
    });
    return handleResponse(res, 200, "Delivery finance settings updated", updated);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getSellerWalletSummaryController = async (req, res) => {
  try {
    const sellerId = req.user?.id;
    const wallet = await Wallet.findOne({ ownerType: "SELLER", ownerId: sellerId }).lean();
    return handleResponse(res, 200, "Seller wallet summary fetched", {
      availableBalance: wallet?.availableBalance || 0,
      pendingBalance: wallet?.pendingBalance || 0,
      totalCredited: wallet?.totalCredited || 0,
      totalDebited: wallet?.totalDebited || 0,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getRiderWalletSummaryController = async (req, res) => {
  try {
    const riderId = req.user?.id;
    const wallet = await Wallet.findOne({
      ownerType: "DELIVERY_PARTNER",
      ownerId: riderId,
    }).lean();
    return handleResponse(res, 200, "Rider wallet summary fetched", {
      availableBalance: wallet?.availableBalance || 0,
      pendingBalance: wallet?.pendingBalance || 0,
      cashInHand: wallet?.cashInHand || 0,
      totalCredited: wallet?.totalCredited || 0,
      totalDebited: wallet?.totalDebited || 0,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getAdminEarningsController = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = "delivered" } = req.query;
    
    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const skip = (safePage - 1) * safeLimit;

    // We only want orders where the platform actually earned something
    const query = {
      status,
      "paymentBreakdown.platformTotalEarning": { $gt: 0 }
    };

    const [items, total] = await Promise.all([
      Order.find(query)
        .select("orderId customer seller paymentMode status createdAt paymentBreakdown pricing")
        .populate("customer", "name email phone")
        .populate("seller", "shopName name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      Order.countDocuments(query),
    ]);

    // Aggregate overall totals for the top summary cards across all such orders
    const [aggregations] = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalEarning: { $sum: "$paymentBreakdown.platformTotalEarning" },
          totalCommission: { $sum: "$paymentBreakdown.adminProductCommissionTotal" },
          totalSurge: { $sum: "$paymentBreakdown.surgeChargeCharged" },
          totalLogisticsMargin: { $sum: "$paymentBreakdown.platformLogisticsMargin" }
        }
      }
    ]);

    const summary = aggregations || {
      totalEarning: 0,
      totalCommission: 0,
      totalSurge: 0,
      totalLogisticsMargin: 0
    };

    return handleResponse(res, 200, "Admin earnings fetched successfully", {
      items,
      summary,
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// ─── GST Controllers ─────────────────────────────────────────────────────────

/** GET /finance/gst/config */
export const getGstConfigController = async (req, res) => {
  try {
    const config = await getGstConfig({ bypassCache: true });
    return handleResponse(res, 200, "GST config fetched", config);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/** PUT /finance/gst/config */
export const updateGstConfigController = async (req, res) => {
  try {
    const updates = req.body || {};
    const updated = await updateGstConfig(updates);
    return handleResponse(res, 200, "GST config updated", updated);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/** GET /finance/gst/transactions */
export const listGstTransactionsController = async (req, res) => {
  try {
    const result = await listGstTransactions(req.query || {});
    return handleResponse(res, 200, "GST transactions fetched", result);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/**
 * GET /finance/gst/download?reportType=seller_sales&...
 * Supported reportType values:
 *   seller_sales | service_invoice | commission | settlement | reconciliation | ca_package
 */
export const downloadGstReportController = async (req, res) => {
  try {
    const { reportType = "seller_sales", ...params } = req.query || {};

    if (reportType === "ca_package") {
      // CA Package: bundle all CSVs into a ZIP
      const pkg = await generateCaPackage(params);

      // Build ZIP in-memory using a simple concatenated approach
      // (No external zip library needed for basic use — we send as multipart or JSON list)
      // For real ZIP, install 'archiver' or 'jszip'. Here we send JSON with base64 CSVs.
      const encoded = pkg.files.map((f) => ({
        filename: f.name,
        content: Buffer.from(f.content, "utf8").toString("base64"),
      }));
      return handleResponse(res, 200, "CA package generated", {
        dirName: pkg.dirName,
        files: encoded,
      });
    }

    const generators = {
      seller_sales: { fn: generateSellerSalesGstCsv, name: "Seller_Sales_GST" },
      service_invoice: { fn: generateZoognoServiceInvoiceCsv, name: "Zoogno_Service_Invoices" },
      commission: { fn: generateSellerCommissionCsv, name: "Seller_Commission" },
      settlement: { fn: generateSettlementReportCsv, name: "Seller_Settlement" },
      reconciliation: { fn: generateGstReconciliationCsv, name: "GST_Reconciliation_Summary" },
    };

    const gen = generators[reportType];
    if (!gen) {
      return handleResponse(res, 400, `Unknown reportType: ${reportType}`);
    }

    const csv = await gen.fn(params);
    const fy = params.financialYear || "ALL";
    const period = params.taxPeriod || "ALL";
    const filename = `${gen.name}_${fy}_${period}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
