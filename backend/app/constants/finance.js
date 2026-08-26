export const CURRENCY = "INR";

export const PAYMENT_MODE = {
  ONLINE: "ONLINE",
  COD: "COD",
  WALLET: "WALLET",
};

export const ORDER_PAYMENT_STATUS = {
  CREATED: "CREATED",
  PENDING_CASH_COLLECTION: "PENDING_CASH_COLLECTION",
  PAID: "PAID",
  CASH_COLLECTED: "CASH_COLLECTED",
  PARTIALLY_REMITTED: "PARTIALLY_REMITTED",
  COD_RECONCILED: "COD_RECONCILED",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
};

export const ORDER_SETTLEMENT_STATUS = {
  PENDING: "PENDING",
  PARTIAL: "PARTIAL",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  REFUNDED: "REFUNDED",
};

export const OWNER_TYPE = {
  ADMIN: "ADMIN",
  SELLER: "SELLER",
  DELIVERY_PARTNER: "DELIVERY_PARTNER",
  CUSTOMER: "CUSTOMER",
};

export const WALLET_STATUS = {
  ACTIVE: "ACTIVE",
  FROZEN: "FROZEN",
  CLOSED: "CLOSED",
};

export const LEDGER_DIRECTION = {
  CREDIT: "CREDIT",
  DEBIT: "DEBIT",
};

export const LEDGER_STATUS = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  REVERSED: "REVERSED",
};

export const LEDGER_TRANSACTION_TYPE = {
  ORDER_ONLINE_PAYMENT_CAPTURED: "ORDER_ONLINE_PAYMENT_CAPTURED",
  ORDER_COD_COLLECTED: "ORDER_COD_COLLECTED",
  SELLER_PAYOUT_PENDING: "SELLER_PAYOUT_PENDING",
  SELLER_PAYOUT_PROCESSED: "SELLER_PAYOUT_PROCESSED",
  RIDER_PAYOUT_PENDING: "RIDER_PAYOUT_PENDING",
  RIDER_PAYOUT_PROCESSED: "RIDER_PAYOUT_PROCESSED",
  ADMIN_EARNING_CREDITED: "ADMIN_EARNING_CREDITED",
  COD_REMITTED: "COD_REMITTED",
  REFUND: "REFUND",
  ADJUSTMENT: "ADJUSTMENT",
  WITHDRAWAL: "WITHDRAWAL",
  CANCELLATION_REVERSAL: "CANCELLATION_REVERSAL",
  WALLET_REFUND: "WALLET_REFUND",
};

export const PAYOUT_TYPE = {
  SELLER: "SELLER",
  DELIVERY_PARTNER: "DELIVERY_PARTNER",
};

export const PAYOUT_STATUS = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
};

export const COMMISSION_TYPE = {
  PERCENTAGE: "percentage",
  FIXED: "fixed",
};

export const COMMISSION_FIXED_RULE = {
  PER_ITEM: "per_item",
  PER_QTY: "per_qty",
};

export const HANDLING_FEE_TYPE = {
  NONE: "none",
  FIXED: "fixed",
  PERCENTAGE: "percentage",
};

export const HANDLING_FEE_STRATEGY = {
  HIGHEST_CATEGORY_FEE: "highest_category_fee",
  SUM_OF_CATEGORY_FEES: "sum_of_category_fees",
  MAX_SINGLE_FEE: "max_single_fee",
  PER_ITEM_FEE: "per_item_fee",
};

export const DELIVERY_PRICING_MODE = {
  FIXED_PRICE: "fixed_price",
  DISTANCE_BASED: "distance_based",
};

export const FINANCE_AUDIT_ACTION = {
  ORDER_FINANCE_SNAPSHOT_FROZEN: "ORDER_FINANCE_SNAPSHOT_FROZEN",
  ONLINE_PAYMENT_VERIFIED: "ONLINE_PAYMENT_VERIFIED",
  COD_MARKED_COLLECTED: "COD_MARKED_COLLECTED",
  COD_RECONCILED: "COD_RECONCILED",
  ORDER_DELIVERED_SETTLED: "ORDER_DELIVERED_SETTLED",
  PAYOUT_QUEUED: "PAYOUT_QUEUED",
  PAYOUT_PROCESSED: "PAYOUT_PROCESSED",
  DELIVERY_SETTINGS_UPDATED: "DELIVERY_SETTINGS_UPDATED",
  FINANCE_ADJUSTMENT_APPLIED: "FINANCE_ADJUSTMENT_APPLIED",
  GST_TRANSACTIONS_CREATED: "GST_TRANSACTIONS_CREATED",
};

// --- GST Constants ---

export const SELLER_GST_STATUS = {
  REGISTERED: "REGISTERED",
  UNREGISTERED: "UNREGISTERED",
  COMPOSITION: "COMPOSITION",
};

export const ECO_TAX_MECHANISM = {
  SECTION_52_TCS: "SECTION_52_TCS",   // ECO collects TCS and remits; seller raises invoice
  SECTION_9_5: "SECTION_9_5",         // ECO is deemed supplier; ECO raises invoice & pays GST
  NORMAL_SUPPLY: "NORMAL_SUPPLY",      // Normal supply; no TCS; seller is sole supplier
  NOT_APPLICABLE: "NOT_APPLICABLE",
};

export const GST_SUPPLY_TYPE = {
  B2B: "B2B",                   // Registered buyer
  B2C: "B2C",                   // Unregistered / consumer buyer
  B2B_REVERSE_CHARGE: "B2B_REVERSE_CHARGE",
  EXPORT: "EXPORT",
};

export const GST_TXN_TYPE = {
  SELLER_PRODUCT_SALE: "SELLER_PRODUCT_SALE",     // Seller's outward supply (product)
  ZOOGNO_SERVICE_SALE: "ZOOGNO_SERVICE_SALE",      // Zoogno's platform/delivery fee
  ZOOGNO_SELLER_COMMISSION: "ZOOGNO_SELLER_COMMISSION", // Zoogno's commission charged to seller
  CREDIT_NOTE: "CREDIT_NOTE",                     // Return/refund credit note
  DEBIT_NOTE: "DEBIT_NOTE",
};

export const GST_SERVICE_TYPE = {
  PLATFORM_FEE: "PLATFORM_FEE",
  DELIVERY_FEE: "DELIVERY_FEE",
  HANDLING_FEE: "HANDLING_FEE",
  OTHER: "OTHER",
};

export const GST_TXN_STATUS = {
  ACTIVE: "ACTIVE",
  REVERSED: "REVERSED",
  AMENDED: "AMENDED",
};

export const E_INVOICE_STATUS = {
  NOT_REQUIRED: "NOT_REQUIRED",
  PENDING: "PENDING",
  GENERATED: "GENERATED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
};

export const INVOICE_SERIES = {
  SELLER_INVOICE: "SELLER_INV",        // Seller's invoice captured/stored by Zoogno
  ZOOGNO_SERVICE: "ZG_INV",           // Zoogno service invoice (platform + delivery)
  ZOOGNO_COMMISSION: "ZG_COM",        // Zoogno commission invoice to seller
  CREDIT_NOTE: "ZG_CN",
  DEBIT_NOTE: "ZG_DN",
};

export const ALL_SELLER_GST_STATUSES = Object.values(SELLER_GST_STATUS);
export const ALL_ECO_TAX_MECHANISMS = Object.values(ECO_TAX_MECHANISM);
export const ALL_GST_SUPPLY_TYPES = Object.values(GST_SUPPLY_TYPE);
export const ALL_GST_TXN_TYPES = Object.values(GST_TXN_TYPE);
export const ALL_GST_SERVICE_TYPES = Object.values(GST_SERVICE_TYPE);
export const ALL_GST_TXN_STATUSES = Object.values(GST_TXN_STATUS);
export const ALL_E_INVOICE_STATUSES = Object.values(E_INVOICE_STATUS);

// Indian GST state codes mapping
export const GST_STATE_CODES = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab",
  "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana",
  "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
  "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
  "13": "Nagaland", "14": "Manipur", "15": "Mizoram",
  "16": "Tripura", "17": "Meghalaya", "18": "Assam",
  "19": "West Bengal", "20": "Jharkhand", "21": "Odisha",
  "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "25": "Daman and Diu", "26": "Dadra and Nagar Haveli", "27": "Maharashtra",
  "28": "Andhra Pradesh", "29": "Karnataka", "30": "Goa",
  "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu",
  "34": "Puducherry", "35": "Andaman and Nicobar Islands", "36": "Telangana",
  "37": "Andhra Pradesh (New)", "38": "Ladakh", "97": "Other Territory",
  "99": "Other Country",
};

export const UNION_TERRITORY_CODES = ["04", "07", "25", "26", "31", "34", "35", "38"];

export const ALL_PAYMENT_MODES = Object.values(PAYMENT_MODE);
export const ALL_ORDER_PAYMENT_STATUSES = Object.values(ORDER_PAYMENT_STATUS);
export const ALL_ORDER_SETTLEMENT_STATUSES = Object.values(ORDER_SETTLEMENT_STATUS);
export const ALL_OWNER_TYPES = Object.values(OWNER_TYPE);
export const ALL_WALLET_STATUSES = Object.values(WALLET_STATUS);
export const ALL_LEDGER_DIRECTIONS = Object.values(LEDGER_DIRECTION);
export const ALL_LEDGER_STATUSES = Object.values(LEDGER_STATUS);
export const ALL_LEDGER_TRANSACTION_TYPES = Object.values(LEDGER_TRANSACTION_TYPE);
export const ALL_PAYOUT_TYPES = Object.values(PAYOUT_TYPE);
export const ALL_PAYOUT_STATUSES = Object.values(PAYOUT_STATUS);
export const ALL_COMMISSION_TYPES = Object.values(COMMISSION_TYPE);
export const ALL_COMMISSION_FIXED_RULES = Object.values(COMMISSION_FIXED_RULE);
export const ALL_HANDLING_FEE_TYPES = Object.values(HANDLING_FEE_TYPE);
export const ALL_HANDLING_FEE_STRATEGIES = Object.values(HANDLING_FEE_STRATEGY);
export const ALL_DELIVERY_PRICING_MODES = Object.values(DELIVERY_PRICING_MODE);
export const ALL_FINANCE_AUDIT_ACTIONS = Object.values(FINANCE_AUDIT_ACTION);
