import React, { useState, useEffect, useCallback } from "react";
import {
  FileBarChart, Download, Filter, RefreshCw, Package,
  ChevronDown, X, CheckCircle, AlertCircle, Loader
} from "lucide-react";
import adminFinanceApi from "../services/api/financeApi";

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENT_FY = (() => {
  const now = new Date();
  const yr = now.getFullYear();
  const mo = now.getMonth() + 1;
  return mo >= 4 ? `${yr}-${String(yr + 1).slice(-2)}` : `${yr - 1}-${String(yr).slice(-2)}`;
})();

const MONTHS = [
  "Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"
];

const FY_OPTIONS = (() => {
  const yr = new Date().getFullYear();
  return [`${yr - 1}-${String(yr).slice(-2)}`, `${yr}-${String(yr + 1).slice(-2)}`];
})();

const REPORT_TYPES = [
  {
    id: "seller_sales",
    label: "Seller Sales GST",
    desc: "Seller product sales with HSN, taxable value, IGST/CGST/SGST, TCS",
    color: "#6366f1",
    icon: "📦",
  },
  {
    id: "service_invoice",
    label: "Zoogno Service Invoices",
    desc: "Platform fee & delivery fee invoices raised by Zoogno",
    color: "#0ea5e9",
    icon: "🧾",
  },
  {
    id: "commission",
    label: "Seller Commission",
    desc: "Commission invoices Zoogno raises to sellers with GST",
    color: "#f59e0b",
    icon: "💼",
  },
  {
    id: "settlement",
    label: "Settlement Report",
    desc: "Per-settlement reconciliation for CA accounting",
    color: "#10b981",
    icon: "⚖️",
  },
  {
    id: "reconciliation",
    label: "GST Reconciliation Summary",
    desc: "Monthly consolidated GST working (GSTR-1/3B/8 ready)",
    color: "#ec4899",
    icon: "📊",
  },
];

const TXN_TYPE_LABELS = {
  SELLER_PRODUCT_SALE: "Seller Sale",
  ZOOGNO_SERVICE_SALE: "Zoogno Service",
  ZOOGNO_SELLER_COMMISSION: "Commission",
  CREDIT_NOTE: "Credit Note",
  DEBIT_NOTE: "Debit Note",
};

const STATUS_COLORS = {
  SELLER_PRODUCT_SALE: "#6366f1",
  ZOOGNO_SERVICE_SALE: "#0ea5e9",
  ZOOGNO_SELLER_COMMISSION: "#f59e0b",
  CREDIT_NOTE: "#ef4444",
  DEBIT_NOTE: "#f97316",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadCaPackageFromJson(data) {
  const files = data?.files || [];
  files.forEach((f) => {
    const bytes = atob(f.content);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const blob = new Blob([arr], { type: "text/csv" });
    downloadBlob(blob, `${data.dirName}/${f.filename}`);
  });
}

function fmt(n) {
  return n != null ? Number(n).toFixed(2) : "—";
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function GstReports() {
  const [filters, setFilters] = useState({
    financialYear: CURRENT_FY,
    taxPeriod: "",
    sellerGstin: "",
    sellerGstStatus: "",
    supplyType: "",
    section: "",
    txnType: "",
    isInterState: "",
  });

  const [downloading, setDownloading] = useState({});
  const [dlStatus, setDlStatus] = useState({});
  const [txns, setTxns] = useState([]);
  const [txnTotal, setTxnTotal] = useState(0);
  const [txnPage, setTxnPage] = useState(1);
  const [txnLoading, setTxnLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const fetchTxns = useCallback(async () => {
    setTxnLoading(true);
    try {
      const params = { ...filters, page: txnPage, limit: 25 };
      // Remove empty filters
      Object.keys(params).forEach((k) => { if (!params[k] && params[k] !== 0) delete params[k]; });
      const res = await adminFinanceApi.getGstTransactions(params);
      const d = res.data?.data || {};
      setTxns(d.items || []);
      setTxnTotal(d.total || 0);
    } catch {
      setTxns([]);
    } finally {
      setTxnLoading(false);
    }
  }, [filters, txnPage]);

  useEffect(() => { fetchTxns(); }, [fetchTxns]);

  const handleDownload = async (reportId) => {
    setDownloading((p) => ({ ...p, [reportId]: true }));
    setDlStatus((p) => ({ ...p, [reportId]: null }));
    try {
      const params = {};
      if (filters.financialYear) params.financialYear = filters.financialYear;
      if (filters.taxPeriod) params.taxPeriod = filters.taxPeriod;
      if (filters.sellerGstin) params.sellerGstin = filters.sellerGstin;
      if (filters.sellerGstStatus) params.sellerGstStatus = filters.sellerGstStatus;
      if (filters.supplyType) params.supplyType = filters.supplyType;
      if (filters.section) params.section = filters.section;

      if (reportId === "ca_package") {
        const res = await adminFinanceApi.downloadCaPackage(params);
        downloadCaPackageFromJson(res.data?.data);
      } else {
        const res = await adminFinanceApi.downloadGstReport(reportId, params);
        const fy = filters.financialYear || "ALL";
        const period = filters.taxPeriod || "ALL";
        downloadBlob(res.data, `Zoogno_GST_${reportId}_${fy}_${period}.csv`);
      }
      setDlStatus((p) => ({ ...p, [reportId]: "ok" }));
    } catch {
      setDlStatus((p) => ({ ...p, [reportId]: "err" }));
    } finally {
      setDownloading((p) => ({ ...p, [reportId]: false }));
    }
  };

  const setFilter = (key, val) => {
    setFilters((p) => ({ ...p, [key]: val }));
    setTxnPage(1);
  };

  const clearFilters = () => {
    setFilters({
      financialYear: CURRENT_FY,
      taxPeriod: "", sellerGstin: "",
      sellerGstStatus: "", supplyType: "", section: "", txnType: "", isInterState: "",
    });
    setTxnPage(1);
  };

  const activeFilterCount = Object.entries(filters).filter(
    ([k, v]) => v && !(k === "financialYear" && v === CURRENT_FY)
  ).length;

  return (
    <div style={{ padding: "24px", maxWidth: 1200, margin: "0 auto", fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14,
          background: "linear-gradient(135deg, #6366f1, #4f46e5)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <FileBarChart size={24} color="#fff" />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a" }}>GST Reports</h1>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#64748b" }}>
            CA-ready GST reports for GSTR-1, GSTR-3B &amp; GSTR-8 filing
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <button
            onClick={() => setShowFilters((p) => !p)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 8,
              border: `1.5px solid ${activeFilterCount > 0 ? "#6366f1" : "#e2e8f0"}`,
              background: activeFilterCount > 0 ? "#ede9fe" : "#fff",
              color: activeFilterCount > 0 ? "#6366f1" : "#334155",
              fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}
          >
            <Filter size={14} />
            Filters
            {activeFilterCount > 0 && (
              <span style={{
                background: "#6366f1", color: "#fff",
                borderRadius: "999px", padding: "1px 7px", fontSize: 11,
              }}>
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            onClick={() => handleDownload("ca_package")}
            disabled={downloading.ca_package}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 18px", borderRadius: 8,
              background: "linear-gradient(135deg, #10b981, #059669)",
              color: "#fff", fontSize: 13, fontWeight: 600,
              cursor: downloading.ca_package ? "not-allowed" : "pointer",
              border: "none", boxShadow: "0 2px 8px rgba(16,185,129,0.3)",
            }}
          >
            {downloading.ca_package ? <Loader size={14} className="spin" /> : <Package size={14} />}
            Download CA Package
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div style={{
          background: "#fff", borderRadius: 14,
          border: "1.5px solid #e2e8f0",
          padding: "20px 24px", marginBottom: 24,
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Filters</h3>
            <button onClick={clearFilters} style={{ background: "none", border: "none", color: "#6366f1", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
              Clear All
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
            {/* Financial Year */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 5 }}>Financial Year</label>
              <select value={filters.financialYear} onChange={(e) => setFilter("financialYear", e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1.5px solid #e2e8f0", fontSize: 12, color: "#0f172a", background: "#f8fafc" }}>
                <option value="">All Years</option>
                {FY_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            {/* Tax Period */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 5 }}>Month</label>
              <select value={filters.taxPeriod} onChange={(e) => setFilter("taxPeriod", e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1.5px solid #e2e8f0", fontSize: 12, color: "#0f172a", background: "#f8fafc" }}>
                <option value="">All Months</option>
                {MONTHS.map((m) => {
                  const yr = filters.financialYear
                    ? (["Jan","Feb","Mar"].includes(m)
                      ? "20" + filters.financialYear.slice(-2)
                      : filters.financialYear.slice(0, 4))
                    : new Date().getFullYear();
                  const val = `${m}-${yr}`;
                  return <option key={val} value={val}>{val}</option>;
                })}
              </select>
            </div>
            {/* Seller GSTIN */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 5 }}>Seller GSTIN</label>
              <input type="text" placeholder="29XXXXX1234..." value={filters.sellerGstin}
                onChange={(e) => setFilter("sellerGstin", e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1.5px solid #e2e8f0", fontSize: 12, boxSizing: "border-box" }} />
            </div>
            {/* GST Status */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 5 }}>Seller GST Status</label>
              <select value={filters.sellerGstStatus} onChange={(e) => setFilter("sellerGstStatus", e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1.5px solid #e2e8f0", fontSize: 12, color: "#0f172a", background: "#f8fafc" }}>
                <option value="">All</option>
                <option value="REGISTERED">Registered</option>
                <option value="UNREGISTERED">Unregistered</option>
                <option value="COMPOSITION">Composition</option>
              </select>
            </div>
            {/* Supply Type */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 5 }}>Supply Type</label>
              <select value={filters.supplyType} onChange={(e) => setFilter("supplyType", e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1.5px solid #e2e8f0", fontSize: 12, color: "#0f172a", background: "#f8fafc" }}>
                <option value="">All</option>
                <option value="B2B">B2B</option>
                <option value="B2C">B2C</option>
              </select>
            </div>
            {/* Section */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 5 }}>ECO Section</label>
              <select value={filters.section} onChange={(e) => setFilter("section", e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1.5px solid #e2e8f0", fontSize: 12, color: "#0f172a", background: "#f8fafc" }}>
                <option value="">All</option>
                <option value="SECTION_52_TCS">Section 52 (TCS)</option>
                <option value="SECTION_9_5">Section 9(5)</option>
                <option value="NORMAL_SUPPLY">Normal Supply</option>
              </select>
            </div>
            {/* Txn Type */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 5 }}>Record Type</label>
              <select value={filters.txnType} onChange={(e) => setFilter("txnType", e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1.5px solid #e2e8f0", fontSize: 12, color: "#0f172a", background: "#f8fafc" }}>
                <option value="">All</option>
                {Object.entries(TXN_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {/* Inter-State */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 5 }}>Inter-State</label>
              <select value={filters.isInterState} onChange={(e) => setFilter("isInterState", e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1.5px solid #e2e8f0", fontSize: 12, color: "#0f172a", background: "#f8fafc" }}>
                <option value="">All</option>
                <option value="true">Inter-State (IGST)</option>
                <option value="false">Intra-State (CGST+SGST)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Download Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16, marginBottom: 32 }}>
        {REPORT_TYPES.map((r) => (
          <div key={r.id} style={{
            background: "#fff", borderRadius: 14,
            border: "1.5px solid #e2e8f0",
            padding: "20px 22px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            transition: "box-shadow 0.2s",
            display: "flex", flexDirection: "column", gap: 12,
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: `${r.color}18`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, flexShrink: 0,
              }}>
                {r.icon}
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#1e293b" }}>{r.label}</h3>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{r.desc}</p>
              </div>
            </div>
            <button
              onClick={() => handleDownload(r.id)}
              disabled={downloading[r.id]}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "9px 16px", borderRadius: 9,
                background: downloading[r.id] ? "#f1f5f9" : `${r.color}15`,
                color: downloading[r.id] ? "#94a3b8" : r.color,
                border: `1.5px solid ${downloading[r.id] ? "#e2e8f0" : r.color + "40"}`,
                fontSize: 13, fontWeight: 600, cursor: downloading[r.id] ? "not-allowed" : "pointer",
                transition: "all 0.15s",
              }}
            >
              {downloading[r.id] ? (
                <><Loader size={14} /> Generating...</>
              ) : dlStatus[r.id] === "ok" ? (
                <><CheckCircle size={14} color="#10b981" /> Downloaded</>
              ) : dlStatus[r.id] === "err" ? (
                <><AlertCircle size={14} color="#ef4444" /> Failed — Retry</>
              ) : (
                <><Download size={14} /> Download CSV</>
              )}
            </button>
          </div>
        ))}
      </div>

      {/* CA Package Banner */}
      <div style={{
        background: "linear-gradient(135deg, #f0fdf4, #dcfce7)",
        border: "1.5px solid #86efac",
        borderRadius: 14, padding: "20px 24px",
        display: "flex", alignItems: "center", gap: 16,
        marginBottom: 32,
      }}>
        <div style={{ fontSize: 32 }}>📁</div>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#166534" }}>
            Download Complete CA GST Package
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#15803d" }}>
            All 5 reports in one download — Seller Sales, Service Invoices, Commission, Settlement &amp; Reconciliation Summary
          </p>
        </div>
        <button
          onClick={() => handleDownload("ca_package")}
          disabled={downloading.ca_package}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 22px", borderRadius: 10,
            background: "#16a34a", color: "#fff",
            fontSize: 14, fontWeight: 700,
            cursor: downloading.ca_package ? "not-allowed" : "pointer",
            border: "none", flexShrink: 0,
            boxShadow: "0 4px 14px rgba(22,163,74,0.3)",
          }}
        >
          {downloading.ca_package ? <Loader size={14} /> : <Package size={14} />}
          {downloading.ca_package ? "Generating..." : "Download CA Package"}
        </button>
      </div>

      {/* GST Transaction Table */}
      <div style={{
        background: "#fff", borderRadius: 14,
        border: "1.5px solid #e2e8f0",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        overflow: "hidden",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
            GST Transaction Ledger
            <span style={{ marginLeft: 8, fontSize: 12, color: "#64748b", fontWeight: 400 }}>
              ({txnTotal.toLocaleString()} records)
            </span>
          </h3>
          <button onClick={fetchTxns} style={{ background: "none", border: "none", cursor: "pointer", color: "#6366f1", display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600 }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {txnLoading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
            <Loader size={24} className="spin" />
            <p style={{ marginTop: 10, fontSize: 13 }}>Loading transactions...</p>
          </div>
        ) : txns.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
            <FileBarChart size={32} />
            <p style={{ marginTop: 10, fontSize: 13 }}>No GST transactions found for the selected filters.</p>
            <p style={{ fontSize: 12 }}>Transactions are created automatically when orders are delivered &amp; settled.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["GST Txn ID", "Period", "Type", "Order ID", "Seller", "GST Status", "Supply Type", "Taxable Value", "GST", "TCS", "Section"].map((h) => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap", borderBottom: "1px solid #e2e8f0" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {txns.map((t, i) => (
                  <tr key={t._id || i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "9px 12px", color: "#6366f1", fontWeight: 600, fontFamily: "monospace", fontSize: 11, whiteSpace: "nowrap" }}>{t.gstTxnId}</td>
                    <td style={{ padding: "9px 12px", whiteSpace: "nowrap", color: "#334155" }}>{t.taxPeriod}</td>
                    <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>
                      <span style={{
                        background: `${STATUS_COLORS[t.txnType] || "#94a3b8"}18`,
                        color: STATUS_COLORS[t.txnType] || "#94a3b8",
                        padding: "3px 8px", borderRadius: 5, fontSize: 10, fontWeight: 700,
                      }}>
                        {TXN_TYPE_LABELS[t.txnType] || t.txnType}
                      </span>
                    </td>
                    <td style={{ padding: "9px 12px", color: "#334155", fontFamily: "monospace", fontSize: 11 }}>{t.orderRefId}</td>
                    <td style={{ padding: "9px 12px", color: "#334155", whiteSpace: "nowrap" }}>{t.sellerName || "—"}</td>
                    <td style={{ padding: "9px 12px" }}>
                      <span style={{
                        background: t.sellerGstStatus === "REGISTERED" ? "#dcfce7" : t.sellerGstStatus === "COMPOSITION" ? "#fef9c3" : "#fee2e2",
                        color: t.sellerGstStatus === "REGISTERED" ? "#16a34a" : t.sellerGstStatus === "COMPOSITION" ? "#ca8a04" : "#dc2626",
                        padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 700,
                      }}>
                        {t.sellerGstStatus}
                      </span>
                    </td>
                    <td style={{ padding: "9px 12px", color: "#334155", fontSize: 11 }}>
                      {t.supplyType} {t.isInterState ? "•IGST" : "•CGST+SGST"}
                    </td>
                    <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 600, color: "#0f172a" }}>₹{fmt(t.taxableValue)}</td>
                    <td style={{ padding: "9px 12px", textAlign: "right", color: "#6366f1", fontWeight: 600 }}>₹{fmt(t.gstAmount)}</td>
                    <td style={{ padding: "9px 12px", textAlign: "right", color: "#f59e0b", fontWeight: 600 }}>₹{fmt(t.tcsAmount)}</td>
                    <td style={{ padding: "9px 12px", fontSize: 10, color: "#64748b", whiteSpace: "nowrap" }}>{t.section}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {txnTotal > 25 && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>
              Page {txnPage} of {Math.ceil(txnTotal / 25)}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button disabled={txnPage <= 1} onClick={() => setTxnPage((p) => p - 1)}
                style={{ padding: "6px 12px", borderRadius: 6, border: "1.5px solid #e2e8f0", background: "#fff", color: "#334155", cursor: txnPage <= 1 ? "not-allowed" : "pointer", fontSize: 12 }}>
                ← Prev
              </button>
              <button disabled={txnPage >= Math.ceil(txnTotal / 25)} onClick={() => setTxnPage((p) => p + 1)}
                style={{ padding: "6px 12px", borderRadius: 6, border: "1.5px solid #e2e8f0", background: "#fff", color: "#334155", cursor: txnPage >= Math.ceil(txnTotal / 25) ? "not-allowed" : "pointer", fontSize: 12 }}>
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
