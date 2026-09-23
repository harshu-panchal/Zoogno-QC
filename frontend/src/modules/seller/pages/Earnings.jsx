import React from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import Button from "@shared/components/ui/Button";
import {
  TrendingUp,
  BarChart3,
  DollarSign,
  Download,
  Banknote,
  ArrowDownToLine,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";

import { MagicCard } from "@/components/ui/magic-card";
import { BlurFade } from "@/components/ui/blur-fade";

import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { exportToCSV } from "@/lib/exportUtils";
import { useSellerEarnings } from "../context/SellerEarningsContext";

const Earnings = () => {
  const navigate = useNavigate();
  const { earningsData: data, earningsLoading: loading, refreshEarnings } = useSellerEarnings();

  if (loading) {
    return <div className="flex items-center justify-center h-screen font-black text-slate-600">LOADING EARNINGS...</div>;
  }
  return (
    <div className="space-y-8 pb-16">
      <BlurFade delay={0.1}>
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-800 hidden md:block">
            Earnings Overview
          </h2>
          <div className="flex space-x-3">
            <Button
              onClick={() => {
                const ledger = Array.isArray(data?.ledger) ? data.ledger : [];
                if (ledger.length === 0) {
                  toast.info("No transactions to export.");
                  return;
                }
                const exportData = ledger.map((txn) => ({
                  id: txn.id ?? txn.ref ?? "",
                  type: txn.type ?? "",
                  amount: `₹${Number(txn.amount ?? 0).toLocaleString()}`,
                  status: txn.status ?? "",
                  date: txn.date ?? (txn.createdAt ? new Date(txn.createdAt).toLocaleDateString() : ""),
                  customer: txn.customer ?? "",
                  ref: txn.ref ?? "",
                }));
                exportToCSV(exportData, "Seller_Earnings_Report", {
                  id: "Transaction ID",
                  type: "Type",
                  amount: "Amount",
                  status: "Status",
                  date: "Date",
                  customer: "Customer",
                  ref: "Reference",
                });
                toast.success("Earnings report downloaded successfully!");
              }}
              variant="outline"
              className="border-gray-200">
              <Download className="mr-2 h-5 w-5" />
              Download Report
            </Button>
            <Button
              onClick={() => navigate("/seller/withdrawals")}
              className="px-6 py-2 rounded-xl text-sm font-bold text-white shadow-lg bg-primary hover:bg-primary/90">
              <span className="text-white">View Payouts</span>
            </Button>
          </div>
        </div>
      </BlurFade>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <BlurFade delay={0.2}>
          <Card className="bg-gradient-to-br from-brand-600 to-teal-700 text-white border-none shadow-lg h-full">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-brand-100 font-medium">Total Order Value</p>
                <h3 className="text-4xl font-bold mt-2">₹{Number(data?.balances?.totalRevenue ?? 0).toLocaleString()}</h3>
              </div>
              <div className="p-3 bg-white/20 rounded-xl">
                <DollarSign className="h-8 w-8 text-white" />
              </div>
            </div>
            <div className="mt-8 flex items-center text-brand-100 bg-white/10 w-fit px-3 py-1 rounded-full text-sm">
              <TrendingUp className="mr-2" />
              <span>Incl. fees & undelivered orders — not your payout</span>
            </div>
          </Card>
        </BlurFade>

        <BlurFade delay={0.3}>
          <Card className="h-full border-none shadow-md bg-white p-6 flex flex-col justify-between group hover:shadow-xl transition-all duration-300">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-black text-slate-600 uppercase tracking-widest mb-1">
                  Total Withdrawn
                </p>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                  ₹{Number(data?.balances?.totalWithdrawn ?? 0).toLocaleString()}
                </h2>
              </div>
              <div className="p-3 bg-brand-50 rounded-lg group-hover:scale-110 transition-transform duration-300">
                <Banknote className="h-6 w-6 text-brand-500" />
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs">
                  <ArrowDownToLine className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-600 uppercase">
                    Available to Withdraw
                  </p>
                  <p className="text-xs font-black text-slate-900">
                    ₹{Number(data?.balances?.settledBalance ?? 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </BlurFade>
      </div>

      <BlurFade delay={0.4}>
        <Card className="p-6 border-none shadow-md bg-white">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-brand-500" />
              Monthly Revenue Performance
            </h3>
          </div>
          <div className="h-[300px] w-full min-h-[200px] flex items-center justify-center">
            {(Array.isArray(data?.monthlyChart) ? data.monthlyChart : []).length === 0 ? (
              <p className="text-slate-600 text-sm font-medium">No monthly revenue data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthlyChart}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#f1f5f9"
                  />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }}
                    tickFormatter={(value) => `₹${value}`}
                  />
                  <Tooltip
                    cursor={{ fill: "#f8fafc" }}
                    contentStyle={{
                      borderRadius: "12px",
                      border: "none",
                      boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                      fontSize: "12px",
                      fontWeight: "700",
                    }}
                    formatter={(value) => [`₹${value.toLocaleString()}`, "Revenue"]}
                  />
                  <Bar
                    dataKey="revenue"
                    fill="url(#colorRevenue)"
                    radius={[6, 6, 0, 0]}
                    barSize={40}
                  />
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={1} />
                      <stop offset="95%" stopColor="#818cf8" stopOpacity={1} />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </BlurFade>
    </div>
  );
};

export default Earnings;
