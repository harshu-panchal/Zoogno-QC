import React, { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { TrendingUp, ArrowUpRight, Download } from "lucide-react";
import { motion } from "framer-motion";
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

const EarningsPage = () => {
  const [activeTab, setActiveTab] = useState("weekly");
  const [loading, setLoading] = useState(true);
  const [earningsData, setEarningsData] = useState({
    totalEarnings: 0,
    incentives: 0,
    bonuses: 0,
    tipsReceived: 0,
    chartData: [],
    recentTransactions: [],
  });

  const fetchEarnings = async () => {
    try {
      setLoading(true);
      const response = await deliveryApi.getEarnings();
      if (response.data.success && response.data.result) {
        const result = response.data.result;
        setEarningsData({
          totalEarnings: result.totalEarnings || 0,
          incentives: result.incentives || 0,
          bonuses: result.bonuses || 0,
          tipsReceived: result.tipsReceived || 0,
          chartData: result.chartData || [],
          recentTransactions: result.transactions || result.recentTransactions || [],
        });
      }
    } catch {
      toast.error("Failed to fetch earnings data");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchEarnings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50/50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="bg-gray-50/50 min-h-screen pb-20 font-poppins">
      <div className="bg-white shadow-sm p-4 sticky top-0 z-30 border-b border-gray-100">
        <div className="flex justify-between items-center mb-3">
          <h1 className="text-xl font-black text-gray-900 tracking-tight">My Earnings</h1>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Download size={16} className="text-gray-600" />
          </Button>
        </div>

        <div className="flex bg-gray-100/80 p-1 rounded-xl">
          {["today", "weekly", "monthly"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all duration-300 capitalize ${
                activeTab === tab
                  ? "bg-white text-primary shadow-sm ring-1 ring-black/5"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <motion.div
        className="p-4 space-y-4 max-w-lg mx-auto"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants}>
          <div className="bg-primary rounded-3xl p-5 text-white shadow-lg shadow-primary/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-8 -mt-8 blur-xl" />
            <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/10 rounded-full -ml-8 -mb-8 blur-lg" />

            <p className="text-white/80 font-bold text-[10px] uppercase tracking-widest mb-1 relative z-10">
              Total Earnings
            </p>
            <div className="flex items-baseline mb-4 relative z-10">
              <span className="text-xl font-bold mr-1 opacity-90">{RUPEE}</span>
              <span className="text-4xl font-black tracking-tight">
                {Number(earningsData.totalEarnings || 0).toLocaleString()}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/10 relative z-10">
              <div>
                <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest mb-0.5">Incentives</p>
                <p className="font-bold text-base">
                  +{RUPEE}{Number(earningsData.incentives || 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest mb-0.5">Tips</p>
                <p className="font-bold text-base">
                  +{RUPEE}{Number(earningsData.tipsReceived || 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="p-4 rounded-3xl border-gray-100 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-black text-sm text-gray-900 flex items-center tracking-tight">
                <TrendingUp size={16} className="mr-2 text-primary" strokeWidth={3} />
                Earnings Trend
              </h3>
              <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold uppercase tracking-wider bg-gray-50 hover:bg-gray-100 text-gray-600">
                Last 7 Days
              </Button>
            </div>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={earningsData.chartData} barSize={20} margin={{ bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    dy={10}
                  />
                  <Tooltip
                    cursor={{ fill: "#f9fafb" }}
                    contentStyle={{
                      borderRadius: "12px",
                      border: "none",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                    }}
                  />
                  <Bar dataKey="earnings" fill="var(--primary)" radius={[4, 4, 0, 0]} stackId="a" />
                  <Bar dataKey="incentives" fill="#93c5fd" radius={[4, 4, 0, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="overflow-hidden rounded-3xl border-gray-100 shadow-sm">
            <div className="p-3.5 border-b border-gray-100 flex justify-between items-center bg-gray-50/80">
              <h3 className="font-black text-sm text-gray-900 tracking-tight">Recent Earnings</h3>
              <Button variant="link" className="text-primary text-[10px] font-bold tracking-widest uppercase h-auto p-0">
                View All
              </Button>
            </div>
            <div className="divide-y divide-gray-50">
              {Array.isArray(earningsData.recentTransactions) && earningsData.recentTransactions.length > 0 ? (
                earningsData.recentTransactions.map((txn, idx) => (
                  <div
                    key={txn._id || txn.id || `txn-${idx}`}
                    className="p-3 flex justify-between items-center hover:bg-gray-50 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center">
                      <div
                        className={`p-2 rounded-xl mr-3 transition-transform group-hover:scale-105 ${
                          txn.status === "Settled" || txn.status === "Completed"
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-amber-50 text-amber-600"
                        }`}
                      >
                        <ArrowUpRight size={14} strokeWidth={2.5} />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-gray-900 tracking-tight">{txn.type}</p>
                        <p className="text-[10px] font-semibold text-gray-500 mt-0.5">
                          {txn.date ||
                            new Date(txn.createdAt).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
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
                        {String(txn.type || "").includes("Withdrawal") ? "-" : "+"}
                        {RUPEE}
                        {Number(txn.amount || 0).toLocaleString()}
                      </p>
                      <p
                        className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${
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
                  No recent earnings or withdrawals.
                </div>
              )}
            </div>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default EarningsPage;

