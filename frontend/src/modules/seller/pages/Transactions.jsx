import React, { useState, useMemo } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import Input from "@shared/components/ui/Input";
import Button from "@shared/components/ui/Button";
import Modal from "@shared/components/ui/Modal";
import {
  HiOutlineCreditCard,
  HiOutlineArrowDownTray,
  HiOutlineFunnel,
  HiOutlineMagnifyingGlass,
  HiOutlineDocumentText,
  HiOutlineBanknotes,
  HiOutlineClock,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineArrowUpRight,
  HiOutlineArrowDownLeft,
  HiOutlineCalendarDays,
  HiOutlineArrowUturnLeft,
} from "react-icons/hi2";
import { HiOutlineCurrencyRupee, HiOutlineBriefcase } from "react-icons/hi2";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { BlurFade } from "@/components/ui/blur-fade";
import { MagicCard } from "@/components/ui/magic-card";
import { toast } from "sonner";
import { exportToCSV } from "@/lib/exportUtils";
import { useSellerEarnings } from "../context/SellerEarningsContext";
import Pagination from "@shared/components/ui/Pagination";
import { sellerApi } from "../services/sellerApi";

const GST_CURRENT_FY = (() => {
  const now = new Date();
  const yr = now.getFullYear();
  const mo = now.getMonth() + 1;
  return mo >= 4 ? `${yr}-${String(yr + 1).slice(-2)}` : `${yr - 1}-${String(yr).slice(-2)}`;
})();

const GST_FY_OPTIONS = (() => {
  const yr = new Date().getFullYear();
  return [`${yr - 1}-${String(yr).slice(-2)}`, `${yr}-${String(yr + 1).slice(-2)}`];
})();

const GST_REPORT_TYPES = [
  {
    id: "seller_sales",
    label: "My Sales GST",
    desc: "Your product sales with HSN, taxable value & GST breakdown",
    icon: HiOutlineDocumentText,
  },
  {
    id: "commission",
    label: "Commission Invoice GST",
    desc: "Zoogno's commission invoices to you, including GST on commission",
    icon: HiOutlineBriefcase,
  },
  {
    id: "settlement",
    label: "Settlement Report",
    desc: "Reconciliation of your payouts per settlement",
    icon: HiOutlineBanknotes,
  },
];

function downloadBlobFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** axios with responseType "blob" still wraps a JSON error as a Blob — detect that
 * before treating the response as a real CSV. */
async function resolveGstCsvBlob(blob) {
  if (!(blob instanceof Blob)) {
    throw new Error("Invalid download response");
  }
  const peek = await blob.slice(0, 80).text();
  const trimmed = peek.trimStart();
  const looksJson =
    trimmed.startsWith("{") || trimmed.startsWith("[") || (blob.type || "").includes("json");
  if (looksJson) {
    let message = "Failed to download GST report";
    try {
      const json = JSON.parse(await blob.text());
      message = json.message || message;
    } catch {
      /* keep default message */
    }
    throw new Error(message);
  }
  return blob;
}

const Transactions = () => {
  const { earningsData: data, earningsLoading: loading } = useSellerEarnings();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // GST report downloads
  const [gstFinancialYear, setGstFinancialYear] = useState(GST_CURRENT_FY);
  const [gstDownloading, setGstDownloading] = useState({});
  const [gstStatus, setGstStatus] = useState({});

  const handleDownloadGstReport = async (reportType, label) => {
    setGstDownloading((prev) => ({ ...prev, [reportType]: true }));
    setGstStatus((prev) => ({ ...prev, [reportType]: null }));
    try {
      const res = await sellerApi.downloadGstReport({
        reportType,
        financialYear: gstFinancialYear,
      });
      const blob = await resolveGstCsvBlob(res.data);
      downloadBlobFile(blob, `${label.replace(/\s+/g, "_")}_${gstFinancialYear}.csv`);
      setGstStatus((prev) => ({ ...prev, [reportType]: "ok" }));
      toast.success("GST report downloaded successfully");
    } catch (error) {
      setGstStatus((prev) => ({ ...prev, [reportType]: "err" }));
      toast.error(error.message || "Failed to download GST report");
    } finally {
      setGstDownloading((prev) => ({ ...prev, [reportType]: false }));
    }
  };

  const stats = [
    {
      label: "Settled Balance",
      value: `₹${(data?.balances?.settledBalance || 0).toLocaleString()}`,
      icon: HiOutlineBanknotes,
      color: "text-brand-600",
      bg: "bg-brand-50",
    },
    {
      label: "Pending Payouts",
      value: `₹${(data?.balances?.pendingPayouts || 0).toLocaleString()}`,
      icon: HiOutlineClock,
      color: "text-brand-600",
      bg: "bg-brand-50",
    },
    {
      label: "Total Order Value",
      value: `₹${(data?.balances?.totalRevenue || 0).toLocaleString()}`,
      icon: HiOutlineCreditCard,
      color: "text-brand-600",
      bg: "bg-brand-50",
    },
    {
      label: "Total Refunds",
      value: `₹${(data?.balances?.totalRefunds || 0).toLocaleString()}`,
      icon: HiOutlineArrowUturnLeft,
      color: "text-rose-600",
      bg: "bg-rose-50",
    },
  ];

  const ledger = Array.isArray(data?.ledger) ? data.ledger : [];
  const filteredTransactions = useMemo(() => {
    const term = searchTerm.toLowerCase();
    const result = ledger.filter((txn) => {
      if (!term && activeTab === "All") return true;
      const id = (txn.id ?? txn.ref ?? "").toString().toLowerCase();
      const customer = (txn.customer ?? "").toString().toLowerCase();
      const ref = (txn.ref ?? "").toString().toLowerCase();
      const status = (txn.status ?? "").toString().toLowerCase();
      const type = (txn.type ?? "").toString().toLowerCase();
      const amount = Math.abs(Number(txn.amount ?? 0)).toString();
      const matchesSearch =
        !term ||
        id.includes(term) ||
        customer.includes(term) ||
        ref.includes(term) ||
        status.includes(term) ||
        type.includes(term) ||
        amount.includes(term);
      const txnType = (txn.type ?? "").toString();
      const matchesType = activeTab === "All" || txnType === activeTab;
      return matchesSearch && matchesType;
    });
    const totalPages = Math.max(1, Math.ceil(result.length / pageSize));
    if (page > totalPages) {
      setPage(1);
    }
    return result;
  }, [searchTerm, activeTab, ledger, page, pageSize]);

  const paginatedTransactions = useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return filteredTransactions.slice(start, end);
  }, [filteredTransactions, page, pageSize]);

  const handleDownloadReceipt = (txn) => {
    try {
      const record = {
        id: txn.id ?? txn.ref ?? "",
        type: txn.type ?? "",
        amount: `₹${Math.abs(Number(txn.amount ?? 0)).toLocaleString()}`,
        status: txn.status ?? "",
        date:
          txn.date ??
          (txn.createdAt
            ? new Date(txn.createdAt).toLocaleDateString()
            : ""),
        time:
          txn.time ??
          (txn.createdAt
            ? new Date(txn.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : ""),
        customer: txn.customer ?? "",
        ref: txn.ref ?? "",
      };
      exportToCSV([record], `Transaction_${record.id || "receipt"}`, {
        id: "Transaction ID",
        type: "Type",
        amount: "Amount",
        status: "Status",
        date: "Date",
        time: "Time",
        customer: "Customer/Recipient",
        ref: "Reference",
      });
      toast.success("Receipt downloaded");
    } catch (error) {
      console.error("Receipt download error:", error);
      toast.error("Failed to download receipt");
    }
  };

  // Handle body scroll locking for modals
  React.useEffect(() => {
      const hasOpenModal = isDetailModalOpen;
      if (hasOpenModal) {
          document.body.style.overflow = 'hidden';
          if (window.lenis) window.lenis.stop();
      } else {
          document.body.style.overflow = '';
          if (window.lenis) window.lenis.start();
      }
      return () => {
          document.body.style.overflow = '';
          if (window.lenis) window.lenis.start();
      };
  }, [isDetailModalOpen]);

  if (loading) {
    return <div className="flex items-center justify-center h-screen font-black text-slate-600">LOADING TRANSACTIONS...</div>;
  }

  return (
    <div className="space-y-8 pb-16">
      <BlurFade delay={0.1}>
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
              Transaction Ledger
              <Badge
                variant="primary"
                className="text-[10px] sm:text-xs px-1.5 py-0 font-bold tracking-wider uppercase bg-brand-100 text-brand-700">
                Audit Trail
              </Badge>
            </h1>
            <p className="text-slate-600 text-sm mt-0.5 font-medium">
              Keep track of all financial movements, payouts, and settlements.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => {
                setIsDownloading(true);
                try {
                  const exportData = filteredTransactions.map((txn) => ({
                    id: txn.id ?? txn.ref ?? "",
                    type: txn.type ?? "",
                    amount: `₹${Number(txn.amount ?? 0).toLocaleString()}`,
                    status: txn.status ?? "",
                    date: txn.date ?? (txn.createdAt ? new Date(txn.createdAt).toLocaleDateString() : ""),
                    time: txn.time ?? (txn.createdAt ? new Date(txn.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""),
                    customer: txn.customer ?? "",
                    ref: txn.ref ?? "",
                  }));

                  exportToCSV(exportData, "Seller_Transactions", {
                    id: "Transaction ID",
                    type: "Type",
                    amount: "Amount",
                    status: "Status",
                    date: "Date",
                    time: "Time",
                    customer: "Customer",
                    ref: "Reference"
                  });
                  toast.success("Statement downloaded successfully!");
                } catch (error) {
                  console.error("Download Error:", error);
                  toast.error("Failed to download statement");
                } finally {
                  setIsDownloading(false);
                }
              }}
              className="rounded-lg px-4 py-2 shadow-lg shadow-primary/20 disabled:opacity-50"
              disabled={isDownloading || filteredTransactions.length === 0}>
              <HiOutlineDocumentText className="h-4 w-4 mr-2" />
              {isDownloading ? "DOWNLOADING..." : "DOWNLOAD STATEMENTS"}
            </Button>
          </div>
        </div>
      </BlurFade>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <BlurFade key={i} delay={0.1 + i * 0.05}>
            <MagicCard
              className="border-none shadow-md overflow-hidden bg-white p-0"
              gradientColor="#f8fafc">
              <div className="p-6 relative z-10 flex items-center gap-4">
                <div
                  className={cn(
                    "h-14 w-14 rounded-lg flex items-center justify-center shadow-lg shadow-black/5",
                    stat.bg,
                    stat.color,
                  )}>
                  <stat.icon className="h-7 w-7" />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-600 uppercase tracking-widest">
                    {stat.label}
                  </p>
                  <h4 className="text-3xl font-black text-slate-900 tracking-tight">
                    {stat.value}
                  </h4>
                </div>
              </div>
            </MagicCard>
          </BlurFade>
        ))}
      </div>

      {/* GST Reports */}
      <BlurFade delay={0.35}>
        <Card className="border-none shadow-xl shadow-slate-200/50 overflow-hidden rounded-lg p-6 bg-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                GST Reports
              </h3>
              <p className="text-slate-600 text-sm mt-0.5 font-medium">
                Download your GST-ready CSVs for filing or your CA.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <label className="text-xs font-black uppercase tracking-widest text-slate-600">
                Financial Year
              </label>
              <select
                value={gstFinancialYear}
                onChange={(e) => setGstFinancialYear(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-slate-300 transition-all"
              >
                {GST_FY_OPTIONS.map((fy) => (
                  <option key={fy} value={fy}>{fy}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {GST_REPORT_TYPES.map((report) => {
              const isBusy = !!gstDownloading[report.id];
              const status = gstStatus[report.id];
              return (
                <div
                  key={report.id}
                  className="flex flex-col gap-3 p-4 border border-slate-100 rounded-xl hover:border-slate-300 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                      <report.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800">{report.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{report.desc}</p>
                    </div>
                  </div>
                  <Button
                    onClick={() => handleDownloadGstReport(report.id, report.label)}
                    disabled={isBusy}
                    variant="outline"
                    className="w-full justify-center gap-2 text-xs font-bold disabled:opacity-60"
                  >
                    {isBusy ? (
                      "Generating..."
                    ) : status === "ok" ? (
                      <>
                        <HiOutlineCheckCircle className="h-4 w-4 text-emerald-500" /> Downloaded
                      </>
                    ) : status === "err" ? (
                      <>
                        <HiOutlineXCircle className="h-4 w-4 text-rose-500" /> Failed — Retry
                      </>
                    ) : (
                      <>
                        <HiOutlineArrowDownTray className="h-4 w-4" /> Download CSV
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      </BlurFade>

      <BlurFade delay={0.4}>
        <Card className="border-none shadow-xl shadow-slate-200/50 overflow-hidden rounded-lg p-0 bg-white">
          {/* Toolbar */}
          <div className="p-6 border-b border-slate-50 flex flex-col md:flex-row gap-4 items-center justify-between bg-white">
            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 shrink-0">
              {["All", "Order Payment", "Withdrawal", "Refund"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap",
                    activeTab === tab
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-700",
                  )}>
                  {tab === "Order Payment" ? "Payments" : tab}
                </button>
              ))}
            </div>
            <div className="relative w-full md:w-80">
              <HiOutlineMagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600" />
              <Input
                placeholder="Search by customer..."
                className="pl-10 pr-4 py-2.5 rounded-lg border-none ring-1 ring-slate-100 bg-slate-50/50 focus:ring-2 focus:ring-primary/20 transition-all text-xs font-semibold"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[720px]">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-4 text-xs font-black text-slate-600 uppercase tracking-widest">
                    Transaction Details
                  </th>
                  <th className="px-6 py-4 text-xs font-black text-slate-600 uppercase tracking-widest">
                    Reference
                  </th>
                  <th className="px-6 py-4 text-xs font-black text-slate-600 uppercase tracking-widest">
                    Amount
                  </th>
                  <th className="px-6 py-4 text-xs font-black text-slate-600 uppercase tracking-widest">
                    Status
                  </th>
                  <th className="px-6 py-4 text-xs font-black text-slate-600 uppercase tracking-widest text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                <AnimatePresence>
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-600 text-sm font-medium">
                        {ledger.length === 0 ? "No transactions yet." : "No matches for your search or filter."}
                      </td>
                    </tr>
                  ) : paginatedTransactions.map((txn, idx) => (
                    <motion.tr
                      key={txn.id || txn.ref || txn.reference || `txn-${idx}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => {
                        setSelectedTxn(txn);
                        setIsDetailModalOpen(true);
                      }}
                      className="group hover:bg-slate-50/50 transition-all cursor-pointer">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-4">
                          <div
                            className={cn(
                              "h-10 w-10 rounded-lg flex items-center justify-center font-black transition-all group-hover:scale-110",
                              txn.amount > 0
                                ? "bg-brand-50 text-brand-600"
                                : "bg-rose-50 text-rose-600",
                            )}>
                            {txn.amount > 0 ? (
                              <HiOutlineArrowDownLeft className="h-5 w-5" />
                            ) : (
                              <HiOutlineArrowUpRight className="h-5 w-5" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900 group-hover:text-primary transition-colors">
                              {txn.id ?? txn.ref ?? "—"}
                            </p>
                            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                              {txn.type ?? "—"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-xs font-bold text-slate-900">
                          {txn.customer ?? "—"}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge className="text-[10px] sm:text-xs px-1 py-0 bg-slate-100 text-slate-600 font-bold border-none">
                            {txn.ref ?? "—"}
                          </Badge>
                          <span className="text-[10px] sm:text-xs text-slate-600 font-bold uppercase tracking-tighter">
                            {txn.date ?? (txn.createdAt ? new Date(txn.createdAt).toLocaleDateString() : "—")} • {txn.time ?? (txn.createdAt ? new Date(txn.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—")}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <p
                          className={cn(
                            "text-sm font-black tracking-tight",
                            Number(txn.amount ?? 0) > 0
                              ? "text-brand-600"
                              : "text-rose-600",
                          )}>
                          {Number(txn.amount ?? 0) > 0 ? "+" : ""}₹
                          {Math.abs(Number(txn.amount ?? 0)).toLocaleString()}
                        </p>
                        <p className="text-[10px] sm:text-xs font-bold text-slate-600 mt-0.5">
                          Settlement: {(txn.status ?? "") === "Settled" ? "Complete" : "T+2"}
                        </p>
                      </td>
                      <td className="px-6 py-5">
                        <Badge
                          variant={
                            txn.status === "Settled"
                              ? "success"
                              : txn.status === "Pending" || txn.status === "Processing"
                                ? "warning"
                                : "default"
                          }
                          className="text-[10px] sm:text-xs font-black uppercase tracking-widest px-2-5 py-0.5 rounded-lg">
                          {txn.status === "Settled" ? (
                            <HiOutlineCheckCircle className="mr-1 h-3 w-3" />
                          ) : (
                            <HiOutlineClock className="mr-1 h-3 w-3" />
                          )}
                          {txn.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadReceipt(txn);
                          }}
                          className="h-9 w-9 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all ml-auto">
                          <HiOutlineArrowDownTray className="h-5 w-5" />
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          {filteredTransactions.length > 0 && (
            <div className="p-4 border-t border-slate-50 bg-slate-50/40">
              <Pagination
                page={page}
                totalPages={Math.max(1, Math.ceil(filteredTransactions.length / pageSize))}
                total={filteredTransactions.length}
                pageSize={pageSize}
                onPageChange={(newPage) => setPage(newPage)}
                onPageSizeChange={(newSize) => {
                  setPageSize(newSize);
                  setPage(1);
                }}
                loading={loading}
              />
            </div>
          )}
        </Card>
      </BlurFade>

      {/* Transaction Detail Modal */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title="Transaction Receipt">
        {selectedTxn && (
          <div className="space-y-6">
            <div className="text-center p-6 bg-slate-50 rounded-lg border border-slate-100">
              <p className="text-xs font-black text-slate-600 uppercase tracking-widest mb-1">
                Total Amount
              </p>
              <h2
                className={cn(
                  "text-4xl font-black tracking-tight",
                  Number(selectedTxn.amount ?? 0) > 0 ? "text-brand-600" : "text-rose-600",
                )}>
                {Number(selectedTxn.amount ?? 0) > 0 ? "+" : ""}₹
                {Math.abs(Number(selectedTxn.amount ?? 0)).toLocaleString()}
              </h2>
              <Badge className="mt-4 uppercase font-black text-[10px] sm:text-xs px-3 py-1">
                {selectedTxn.status ?? "—"}
              </Badge>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-600 font-bold">Transaction ID</span>
                <span className="text-slate-900 font-black">
                  {selectedTxn.id ?? selectedTxn.ref ?? "—"}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-600 font-bold">Type</span>
                <span className="text-slate-900 font-black">
                  {selectedTxn.type ?? "—"}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-600 font-bold">
                  Customer/Recipient
                </span>
                <span className="text-slate-900 font-black">
                  {selectedTxn.customer ?? "—"}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-600 font-bold">Reference</span>
                <span className="text-slate-900 font-black">
                  {selectedTxn.ref ?? "—"}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-600 font-bold">Date & Time</span>
                <span className="text-slate-900 font-black">
                  {selectedTxn.date && selectedTxn.time
                    ? `${selectedTxn.date} at ${selectedTxn.time}`
                    : selectedTxn.createdAt
                      ? `${new Date(selectedTxn.createdAt).toLocaleDateString()} at ${new Date(selectedTxn.createdAt).toLocaleTimeString()}`
                      : "—"}
                </span>
              </div>
            </div>

            <div className="p-4 bg-amber-50 rounded-lg border border-amber-100 flex gap-3">
              <HiOutlineClock className="h-5 w-5 text-amber-600 shrink-0" />
              <p className="text-[10px] text-amber-800 font-bold leading-relaxed">
                This transaction is scheduled for settlement in your bank
                account via T+2 rolling cycle. Settlements usually occur before
                6:00 PM.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => window.print()}
                className="rounded-lg py-4 font-black bg-white">
                PRINT RECEIPT
              </Button>
              <Button
                onClick={() => setIsDetailModalOpen(false)}
                className="rounded-lg py-4 font-black shadow-xl shadow-primary/20">
                CLOSE
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Transactions;
