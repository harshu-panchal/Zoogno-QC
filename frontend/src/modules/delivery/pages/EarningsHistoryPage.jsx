import React, { useState, useEffect } from "react";
import { ArrowLeft, ArrowUpRight, Calendar, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import { deliveryApi } from "../services/deliveryApi";

const RUPEE = "\u20B9";
const DOT = "\u2022";
const resolveTipAmount = (txn) =>
  Number(
    txn?.meta?.tipAmount ??
      txn?.order?.paymentBreakdown?.riderTipAmount ??
      txn?.order?.pricing?.tip ??
      0,
  );

const EarningsHistoryPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("weekly");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [totalFiltered, setTotalFiltered] = useState(0);

  const fetchEarnings = async () => {
    if (activeTab === "custom" && (!startDate || !endDate)) return;
    
    try {
      setLoading(true);
      const response = await deliveryApi.getEarnings(
        activeTab,
        activeTab === "custom" ? startDate : null,
        activeTab === "custom" ? endDate : null,
        true
      );
      if (response.data.success && response.data.result) {
        const result = response.data.result;
        setTransactions(result.transactions || []);
        
        // Calculate total for this view
        const total = (result.transactions || []).reduce((acc, t) => {
            if (t.status === "Settled" && (t.type === "Delivery Earning" || t.type === "Incentive" || t.type === "Bonus")) {
                return acc + t.amount;
            }
            return acc;
        }, 0);
        setTotalFiltered(total);
      }
    } catch {
      toast.error("Failed to fetch earnings history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "custom") {
      fetchEarnings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleCustomSearch = () => {
    if (!startDate || !endDate) {
      toast.error("Please select both start and end dates");
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      toast.error("Start date cannot be after end date");
      return;
    }
    fetchEarnings();
  };

  return (
    <div className="bg-gray-50/50 min-h-screen pb-20 font-poppins">
      <div className="bg-white shadow-sm px-4 pb-4 pt-[calc(env(safe-area-inset-top,0px)+16px)] sticky top-0 z-30 border-b border-gray-100">
        <div className="flex items-center mb-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors mr-2"
          >
            <ArrowLeft className="text-gray-900" size={24} />
          </button>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">Earnings History</h1>
        </div>

        <div className="flex bg-gray-100/80 p-1 rounded-xl mb-3">
          {["today", "weekly", "monthly", "custom"].map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                if (tab !== "custom") {
                  setStartDate("");
                  setEndDate("");
                } else {
                  setTransactions([]);
                  setTotalFiltered(0);
                }
              }}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all duration-300 capitalize ${
                activeTab === tab
                  ? "bg-[#135D1F] text-white shadow-sm ring-1 ring-black/5"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "custom" && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            className="flex gap-2 items-end mb-2"
          >
            <div className="flex-1 min-w-0">
              <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">From</label>
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full text-[11px] font-medium p-2 rounded-lg border border-gray-200 bg-gray-50 outline-none focus:border-primary/50"
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">To</label>
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full text-[11px] font-medium p-2 rounded-lg border border-gray-200 bg-gray-50 outline-none focus:border-primary/50"
              />
            </div>
            <Button 
                onClick={handleCustomSearch}
                className="h-[36px] w-[36px] p-0 flex items-center justify-center bg-[#135D1F] hover:bg-[#0e4817] shrink-0 rounded-lg"
            >
                <Calendar size={16} />
            </Button>
          </motion.div>
        )}
      </div>

      <div className="p-4 max-w-lg mx-auto">
        <div className="mb-4 bg-primary/10 rounded-2xl p-4 flex justify-between items-center">
            <div>
                <p className="text-xs font-bold text-primary uppercase tracking-widest">Total for Period</p>
                <h2 className="text-2xl font-black text-gray-900 mt-1">{RUPEE}{totalFiltered.toLocaleString()}</h2>
            </div>
            <div className="text-xs font-semibold text-gray-500 bg-white px-3 py-1.5 rounded-lg shadow-sm">
                {transactions.length} Transactions
            </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="animate-spin text-primary" size={32} />
          </div>
        ) : (
          <Card className="overflow-hidden rounded-3xl border-gray-100 shadow-sm">
            <div className="divide-y divide-gray-50">
              {transactions.length > 0 ? (
                transactions.map((txn, idx) => (
                  <div
                    key={txn._id || txn.id || `txn-${idx}`}
                    className="p-3.5 flex justify-between items-center hover:bg-gray-50 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center">
                      <div
                        className={`p-2 rounded-xl mr-3 transition-transform group-hover:scale-105 ${
                          txn.status === "Settled" || txn.status === "Completed"
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-amber-50 text-amber-600"
                        }`}
                      >
                        <ArrowUpRight size={16} strokeWidth={2.5} />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-gray-900 tracking-tight">{txn.type}</p>
                        <p className="text-[11px] font-semibold text-gray-500 mt-0.5">
                          {new Date(txn.date || txn.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric"
                          })}{" "}
                          {DOT}{" "}
                          {txn.id ||
                            (txn._id ? txn._id.toString().slice(-6).toUpperCase() : "N/A")}
                        </p>
                        {resolveTipAmount(txn) > 0 && (
                          <p className="text-[10px] font-bold text-amber-500 mt-0.5">
                            Incl. tip: {RUPEE}{resolveTipAmount(txn).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-sm text-gray-900">
                        {String(txn.type || "").includes("Withdrawal") || Number(txn.amount) < 0 ? "-" : "+"}
                        {RUPEE}
                        {Math.abs(Number(txn.amount || 0)).toLocaleString()}
                      </p>
                      <p
                        className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${
                          txn.status === "Settled" || txn.status === "Completed"
                            ? "text-emerald-500"
                            : "text-amber-500"
                        }`}
                      >
                        {txn.status}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-12 text-center text-gray-400 text-sm italic">
                  No earnings found for this period.
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default EarningsHistoryPage;
