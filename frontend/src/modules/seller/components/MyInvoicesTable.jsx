import React, { useState, useEffect, useRef } from "react";
import { HiOutlineMagnifyingGlass } from "react-icons/hi2";
import Card from "@shared/components/ui/Card";
import Pagination from "@shared/components/ui/Pagination";
import { sellerApi } from "../services/sellerApi";

/**
 * The seller's OWN issued documents - tax invoices, credit notes, debit notes - each showing
 * BOTH numbers: the seller's statutory number (from their own series) and Zoogno's platform
 * reference. The list is scoped to the logged-in seller by the server (from the auth token),
 * so another seller's invoices can never appear here.
 */

const TYPE_LABEL = { INVOICE: "Invoice", CREDIT_NOTE: "Credit note", DEBIT_NOTE: "Debit note" };
const TYPE_STYLE = {
  INVOICE: "bg-emerald-50 text-emerald-700",
  CREDIT_NOTE: "bg-amber-50 text-amber-700",
  DEBIT_NOTE: "bg-violet-50 text-violet-700",
};

const inr = (v) =>
  `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MyInvoicesTable = () => {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState({ items: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const seq = useRef(0);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const mine = ++seq.current;
      setLoading(true);
      setError("");
      try {
        const res = await sellerApi.getInvoices({
          ...(search.trim() && { search: search.trim() }),
          page,
          limit: pageSize,
        });
        if (mine !== seq.current) return;
        const result = res?.data?.result || {};
        setData({
          items: Array.isArray(result.items) ? result.items : [],
          total: Number(result.total) || 0,
          totalPages: Number(result.totalPages) || 1,
        });
      } catch (err) {
        if (mine !== seq.current) return;
        setError(err?.response?.data?.message || "Failed to load invoices");
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [search, page, pageSize]);

  return (
    <Card className="border-none shadow-xl shadow-slate-200/50 overflow-hidden rounded-lg p-6 bg-white">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
        <div>
          <h3 className="text-lg font-black text-slate-900">My Invoices</h3>
          <p className="text-slate-600 text-sm mt-0.5 font-medium">
            Tax invoices, credit notes and debit notes issued for your orders. Each has your own invoice
            number and Zoogno&apos;s reference number.
          </p>
        </div>
        <div className="relative w-full md:w-72">
          <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice no, Zoogno ref, order…"
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 outline-none focus:bg-white focus:border-slate-300"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <th className="py-3 pr-4">Invoice No</th>
              <th className="py-3 pr-4">Zoogno Ref No</th>
              <th className="py-3 pr-4">Type</th>
              <th className="py-3 pr-4">Order</th>
              <th className="py-3 pr-4">Date</th>
              <th className="py-3 pr-4 text-right">Total</th>
              <th className="py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan="7" className="py-10 text-center text-xs font-bold uppercase tracking-widest text-slate-400">Loading…</td></tr>
            ) : error ? (
              <tr><td colSpan="7" className="py-10 text-center text-sm font-semibold text-rose-600">{error}</td></tr>
            ) : data.items.length === 0 ? (
              <tr>
                <td colSpan="7" className="py-10 text-center text-sm font-semibold text-slate-400">
                  {search ? "No documents match your search." : "No invoices yet - they are issued when a delivery partner picks up your order."}
                </td>
              </tr>
            ) : (
              data.items.map((d) => (
                <tr key={d._id}>
                  <td className="py-3 pr-4 font-mono text-xs font-bold text-slate-900 whitespace-nowrap">
                    {d.sellerDocNo}
                    {d.originalSellerDocNo && (
                      <div className="text-[10px] font-semibold text-slate-400">against {d.originalSellerDocNo}</div>
                    )}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs font-bold text-teal-700 whitespace-nowrap">{d.zoognoRefNo}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${TYPE_STYLE[d.docType] || "bg-slate-50 text-slate-600"}`}>
                      {TYPE_LABEL[d.docType] || d.docType}
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-slate-600 whitespace-nowrap">{d.orderRefId}</td>
                  <td className="py-3 pr-4 text-xs font-semibold text-slate-600 whitespace-nowrap">
                    {d.issuedAt ? new Date(d.issuedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                  </td>
                  <td className="py-3 pr-4 text-right font-black text-slate-900 whitespace-nowrap">{inr(d.grandTotal)}</td>
                  <td className="py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${d.status === "CANCELLED" ? "bg-rose-50 text-rose-700" : "bg-slate-50 text-slate-600"}`}>
                      {d.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="pt-4 mt-2 border-t border-slate-50">
        <Pagination
          page={page}
          totalPages={data.totalPages}
          total={data.total}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          loading={loading}
        />
      </div>
    </Card>
  );
};

export default MyInvoicesTable;
