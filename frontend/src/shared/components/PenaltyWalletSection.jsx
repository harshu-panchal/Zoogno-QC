import React, { useCallback, useEffect, useState } from "react";
import { Gavel } from "lucide-react";
import Pagination from "@shared/components/ui/Pagination";

const REASON = {
  PRODUCT_DAMAGED: "Product damaged",
  CONDITION_MISMATCH: "Condition does not match condition at dispatch",
  DAMAGED_IN_DELIVERY: "Product damaged during delivery",
  WRONG_PRODUCT: "Wrong product",
  MISSING_PRODUCT: "Missing product",
  LATE_OR_UNPROFESSIONAL: "Late / unprofessional conduct",
  OTHER: "Other",
};

const rupees = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmt = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

/**
 * Seller / delivery-partner wallet view of penalties:
 *   Total earnings − penalties − settled = remaining payable, plus the list of
 *   penalties with the order, reason and note (when and why money was deducted).
 */
const PenaltyWalletSection = ({ overall, fetchPenalties }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(
    async (p = 1) => {
      setLoading(true);
      try {
        const res = await fetchPenalties({ page: p, limit: 10 });
        const data = res.data?.result || {};
        setItems(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
        setPage(data.page || p);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [fetchPenalties],
  );

  useEffect(() => {
    load(1);
  }, [load]);

  const earned = Number(overall?.earned || 0);
  const penalty = Number(overall?.penalty || 0);
  const paid = Number(overall?.paid || 0);
  const remaining = Number(overall?.remaining || 0);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl ring-1 ring-slate-100 shadow-sm p-5 sm:p-6">
        <h2 className="text-base sm:text-lg font-black text-slate-900 mb-4">Earnings &amp; Deductions</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600 font-semibold">Total Earnings <span className="text-[10px] text-emerald-600 font-bold uppercase ml-1">credit</span></span>
            <span className="font-black text-slate-900">{rupees(earned)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 font-semibold">Penalty Deduction <span className="text-[10px] text-rose-600 font-bold uppercase ml-1">debit</span></span>
            <span className="font-black text-rose-600">-{rupees(penalty)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 font-semibold">Settled / Paid out <span className="text-[10px] text-rose-600 font-bold uppercase ml-1">debit</span></span>
            <span className="font-black text-emerald-600">-{rupees(paid)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-100 pt-2 mt-1">
            <span className="text-slate-900 font-black">Available Earnings</span>
            <span className="font-black text-amber-600 text-lg">{rupees(remaining)}</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl ring-1 ring-slate-100 shadow-xl overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-slate-50">
          <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
            <Gavel className="h-5 w-5 text-rose-500" /> Penalties
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Penalties are applied by the admin after reviewing the order. Each one is deducted from your earnings.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[640px]">
            <thead>
              <tr className="bg-slate-50/50 text-xs font-black text-slate-600 uppercase tracking-widest">
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Order</th>
                <th className="px-6 py-3">Reason</th>
                <th className="px-6 py-3 text-right">Amount</th>
                <th className="px-6 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-slate-500">Loading...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-slate-500">No penalties. Keep it up!</td>
                </tr>
              ) : (
                items.map((p) => (
                  <tr key={p._id}>
                    <td className="px-6 py-4 text-sm font-bold text-slate-800">{fmt(p.createdAt)}</td>
                    <td className="px-6 py-4 text-sm">
                      <div className="font-bold text-slate-800">#{p.orderId}</div>
                      {p.productName && <div className="text-[11px] text-slate-500">{p.productName}</div>}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">
                      {REASON[p.reason] || p.reasonLabel || p.reason}
                      {p.notes && <div className="text-[11px] text-slate-500 mt-0.5">“{p.notes}”</div>}
                      {p.status === "REVOKED" && p.revokeReason && (
                        <div className="text-[11px] text-emerald-600 mt-0.5">Revoked: {p.revokeReason}</div>
                      )}
                    </td>
                    <td className={`px-6 py-4 text-sm font-black text-right ${p.status === "REVOKED" ? "text-slate-400 line-through" : "text-rose-600"}`}>
                      -{rupees(p.amount)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`text-[10px] font-black px-2.5 py-1 rounded-lg uppercase ${
                          p.status === "APPLIED" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {p.status === "APPLIED" ? "Deducted" : "Revoked"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {total > 0 && (
          <div className="p-4 border-t border-slate-50 bg-slate-50/40">
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={10} onPageChange={load} loading={loading} compact />
          </div>
        )}
      </div>
    </div>
  );
};

export default PenaltyWalletSection;
