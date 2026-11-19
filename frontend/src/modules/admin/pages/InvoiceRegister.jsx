import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Download, ReceiptText, X, Copy, RefreshCw } from 'lucide-react';
import Card from '@shared/components/ui/Card';
import Pagination from '@shared/components/ui/Pagination';
import { useToast } from '@shared/components/ui/Toast';
import { cn } from '@/lib/utils';
import adminFinanceApi from '../services/api/financeApi';

/**
 * Invoice Register - the single place an admin sees EVERY seller's invoices, credit notes and
 * debit notes. Each document carries two numbers:
 *   Zoogno Ref No        platform-wide, sequential          e.g. ZOO/INV/2026-27/000501
 *   Seller Document No   the seller's own statutory series   e.g. ABC/26-27/000001
 * Search matches either one (plus the order id, seller name, and - for notes - the number of
 * the invoice they were raised against).
 */

const DOC_TYPES = [
    { value: '', label: 'All documents' },
    { value: 'INVOICE', label: 'Tax invoices' },
    { value: 'CREDIT_NOTE', label: 'Credit notes' },
    { value: 'DEBIT_NOTE', label: 'Debit notes' },
];

const STATUSES = [
    { value: '', label: 'Any status' },
    { value: 'ISSUED', label: 'Issued' },
    { value: 'CANCELLED', label: 'Cancelled' },
];

const DOC_TYPE_STYLE = {
    INVOICE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    CREDIT_NOTE: 'bg-amber-50 text-amber-700 border-amber-200',
    DEBIT_NOTE: 'bg-violet-50 text-violet-700 border-violet-200',
};

const DOC_TYPE_LABEL = { INVOICE: 'Invoice', CREDIT_NOTE: 'Credit note', DEBIT_NOTE: 'Debit note' };

// India FY runs 1 April - 31 March. Offer the current and previous two.
const fyOptions = () => {
    const now = new Date();
    const start = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    return [0, 1, 2].map((back) => {
        const y = start - back;
        return `${y}-${String(y + 1).slice(-2)}`;
    });
};

const inr = (v) =>
    `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d) =>
    d
        ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : '—';

const fmtDateTime = (d) =>
    d
        ? new Date(d).toLocaleString('en-IN', {
              day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
          })
        : '—';

const Pill = ({ className, children }) => (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', className)}>
        {children}
    </span>
);

const InvoiceRegister = () => {
    const { showToast } = useToast();

    const [search, setSearch] = useState('');
    const [docType, setDocType] = useState('');
    const [status, setStatus] = useState('');
    const [financialYear, setFinancialYear] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    const [data, setData] = useState({ items: [], total: 0, totalPages: 1 });
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState(false);
    const [selected, setSelected] = useState(null);
    const seq = useRef(0);

    const buildParams = useCallback(
        () => ({
            ...(search.trim() && { search: search.trim() }),
            ...(docType && { docType }),
            ...(status && { status }),
            ...(financialYear && { financialYear }),
            ...(startDate && { startDate }),
            ...(endDate && { endDate }),
        }),
        [search, docType, status, financialYear, startDate, endDate],
    );

    const load = useCallback(async () => {
        const mine = ++seq.current;
        setLoading(true);
        try {
            const res = await adminFinanceApi.getInvoices({ ...buildParams(), page, limit: pageSize });
            if (mine !== seq.current) return; // a newer request superseded this one
            const result = res?.data?.result || {};
            setData({
                items: Array.isArray(result.items) ? result.items : [],
                total: Number(result.total) || 0,
                totalPages: Number(result.totalPages) || 1,
            });
        } catch (err) {
            if (mine !== seq.current) return;
            showToast(err?.response?.data?.message || 'Failed to load invoices', 'error');
        } finally {
            if (mine === seq.current) setLoading(false);
        }
    }, [buildParams, page, pageSize, showToast]);

    // Debounce typing; filter/page changes ride the same timer (cheap, and avoids request bursts).
    useEffect(() => {
        const t = setTimeout(load, 350);
        return () => clearTimeout(t);
    }, [load]);

    // Any filter change returns to page 1.
    useEffect(() => {
        setPage(1);
    }, [search, docType, status, financialYear, startDate, endDate, pageSize]);

    const handleDownload = async () => {
        setDownloading(true);
        try {
            const res = await adminFinanceApi.downloadGstReport('documents_issued', buildParams());
            const blob = res.data;
            if (!(blob instanceof Blob)) throw new Error('Invalid download response');
            if ((blob.type || '').includes('json')) {
                const msg = JSON.parse(await blob.text())?.message || 'Download failed';
                throw new Error(msg);
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Documents_Issued_${financialYear || 'ALL'}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('Documents issued report downloaded', 'success');
        } catch (err) {
            showToast(err?.message || 'Download failed', 'error');
        } finally {
            setDownloading(false);
        }
    };

    const copy = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            showToast('Copied', 'success');
        } catch {
            showToast('Copy failed', 'error');
        }
    };

    const clearFilters = () => {
        setSearch(''); setDocType(''); setStatus(''); setFinancialYear(''); setStartDate(''); setEndDate('');
    };
    const hasFilters = search || docType || status || financialYear || startDate || endDate;

    return (
        <div className="ds-section-spacing pb-12">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-1">
                <div>
                    <h1 className="ds-h1 flex items-center gap-3">
                        Invoice Register
                        <span className="p-2 bg-violet-100 rounded-xl"><ReceiptText className="h-5 w-5 text-violet-600" /></span>
                    </h1>
                    <p className="ds-description mt-1">
                        Every seller's tax invoices, credit notes and debit notes - each with its Zoogno reference
                        number and the seller's own statutory number.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={load}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white ring-1 ring-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50"
                    >
                        <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Refresh
                    </button>
                    <button
                        onClick={handleDownload}
                        disabled={downloading}
                        className="bg-[#116A29] hover:bg-[#0e5621] disabled:opacity-60 text-white rounded-lg font-bold uppercase shadow-md flex items-center gap-2 px-5 py-2.5 text-sm"
                    >
                        <Download className={cn('h-4 w-4', downloading && 'animate-bounce')} />
                        {downloading ? 'Preparing…' : 'Export CSV'}
                    </button>
                </div>
            </div>

            <Card className="border-none shadow-2xl ring-1 ring-slate-100/50 bg-white rounded-xl overflow-hidden">
                <div className="p-4 border-b border-slate-50 flex flex-col gap-3">
                    <div className="relative max-w-xl">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search Zoogno Ref No, Seller Invoice No, Order ID or Seller…"
                            className="w-full pl-11 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-semibold outline-none focus:ring-2 focus:ring-violet-500/20"
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <select value={docType} onChange={(e) => setDocType(e.target.value)} className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none">
                            {DOC_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none">
                            {STATUSES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <select value={financialYear} onChange={(e) => setFinancialYear(e.target.value)} className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none">
                            <option value="">All financial years</option>
                            {fyOptions().map((fy) => <option key={fy} value={fy}>FY {fy}</option>)}
                        </select>
                        <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                            From <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-xl bg-slate-50 px-2 py-1.5 text-xs outline-none" />
                        </label>
                        <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                            To <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-xl bg-slate-50 px-2 py-1.5 text-xs outline-none" />
                        </label>
                        {hasFilters && (
                            <button onClick={clearFilters} className="text-xs font-bold text-violet-600 hover:underline">Clear</button>
                        )}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50/50">
                                {['Zoogno Ref No', 'Seller Invoice No', 'Type', 'Seller', 'Order', 'Issued', 'Total', 'Status'].map((h) => (
                                    <th key={h} className={cn('px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest', h === 'Total' && 'text-right')}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                <tr><td colSpan="8" className="px-4 py-16 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">Loading…</td></tr>
                            ) : data.items.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="px-4 py-16 text-center">
                                        <p className="text-sm font-black text-slate-300 uppercase">No documents found</p>
                                        <p className="text-xs font-semibold text-slate-300 mt-1">
                                            Invoices are issued when the delivery partner picks the order up.
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                data.items.map((d) => (
                                    <tr key={d._id} onClick={() => setSelected(d)} className="hover:bg-slate-50/50 cursor-pointer">
                                        <td className="px-4 py-4 font-mono text-xs font-bold text-teal-700 whitespace-nowrap">{d.zoognoRefNo}</td>
                                        <td className="px-4 py-4 font-mono text-xs font-bold text-slate-900 whitespace-nowrap">
                                            {d.sellerDocNo}
                                            {d.originalSellerDocNo && (
                                                <div className="text-[10px] font-semibold text-slate-400">against {d.originalSellerDocNo}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-4"><Pill className={DOC_TYPE_STYLE[d.docType]}>{DOC_TYPE_LABEL[d.docType] || d.docType}</Pill></td>
                                        <td className="px-4 py-4">
                                            <div className="text-xs font-black text-slate-700">{d.sellerName || '—'}</div>
                                            <div className="text-[10px] font-mono text-slate-400">{d.sellerGstin || 'UNREGISTERED'}</div>
                                        </td>
                                        <td className="px-4 py-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">{d.orderRefId}</td>
                                        <td className="px-4 py-4 text-xs font-semibold text-slate-600 whitespace-nowrap">{fmtDate(d.issuedAt)}</td>
                                        <td className="px-4 py-4 text-right text-sm font-black text-slate-900 whitespace-nowrap">{inr(d.grandTotal)}</td>
                                        <td className="px-4 py-4">
                                            <Pill className={d.status === 'CANCELLED' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-50 text-slate-600 border-slate-200'}>
                                                {d.status}
                                            </Pill>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="p-4 border-t border-slate-50">
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

            {selected && (
                <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setSelected(null)}>
                    <aside className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <Pill className={DOC_TYPE_STYLE[selected.docType]}>{DOC_TYPE_LABEL[selected.docType] || selected.docType}</Pill>
                                <h2 className="mt-2 text-lg font-black text-slate-900">
                                    {selected.documentKind === 'BILL_OF_SUPPLY' ? 'Bill of Supply' : 'Tax document'}
                                </h2>
                            </div>
                            <button onClick={() => setSelected(null)} className="rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button>
                        </div>

                        <div className="mt-5 space-y-3">
                            {[
                                ['Zoogno Ref No', selected.zoognoRefNo, 'text-teal-700'],
                                ['Seller Document No', selected.sellerDocNo, 'text-slate-900'],
                            ].map(([label, value, color]) => (
                                <div key={label} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                                        <p className={cn('font-mono text-sm font-black', color)}>{value}</p>
                                    </div>
                                    <button onClick={() => copy(value)} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-700" title="Copy"><Copy className="h-4 w-4" /></button>
                                </div>
                            ))}
                        </div>

                        {selected.status === 'CANCELLED' && (
                            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
                                <p className="font-black uppercase tracking-wide">Cancelled - number retained, never reused</p>
                                <p className="mt-1">{fmtDateTime(selected.cancelledAt)} · by {selected.cancelledBy || 'system'}</p>
                                {selected.cancelReason && <p className="mt-1">Reason: {selected.cancelReason}</p>}
                            </div>
                        )}

                        {selected.originalSellerDocNo && (
                            <div className="mt-4 rounded-xl bg-amber-50 p-4 text-xs text-amber-900">
                                <p className="font-black uppercase tracking-wide">Raised against invoice</p>
                                <p className="mt-1 font-mono">{selected.originalSellerDocNo}</p>
                                <p className="font-mono text-amber-700">{selected.originalZoognoRefNo}</p>
                                {selected.reason && <p className="mt-1">Reason: {selected.reason}</p>}
                            </div>
                        )}

                        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                            {[
                                ['Seller', selected.sellerName],
                                ['Seller GSTIN', selected.sellerGstin || 'UNREGISTERED'],
                                ['Order', selected.orderRefId],
                                ['Customer', selected.customerName || '—'],
                                ['Issued', fmtDateTime(selected.issuedAt)],
                                ['Issued at', selected.issueTrigger === 'DELIVERY_BACKSTOP' ? 'After delivery (late)' : selected.issueTrigger || '—'],
                                ['Financial year', selected.financialYear],
                                ['Place of supply', selected.placeOfSupply || '—'],
                            ].map(([k, v]) => (
                                <div key={k}>
                                    <dt className="text-[10px] font-black uppercase tracking-widest text-slate-400">{k}</dt>
                                    <dd className="mt-0.5 font-semibold text-slate-800 break-words">{v}</dd>
                                </div>
                            ))}
                        </dl>

                        <table className="mt-6 w-full text-xs">
                            <thead>
                                <tr className="border-b border-slate-100 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    <th className="py-2">Item</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Taxable</th><th className="py-2 text-right">GST</th><th className="py-2 text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(selected.lines || []).map((l, i) => (
                                    <tr key={i} className="border-b border-slate-50">
                                        <td className="py-2 font-semibold text-slate-700">{l.productName}<span className="ml-1 text-slate-400">@{l.gstRate}%</span></td>
                                        <td className="py-2 text-right">{l.quantity}</td>
                                        <td className="py-2 text-right">{inr(l.taxableValue)}</td>
                                        <td className="py-2 text-right">{inr(l.gstAmount)}</td>
                                        <td className="py-2 text-right font-bold">{inr(l.lineTotal)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr><td colSpan="4" className="pt-3 text-right text-slate-500">Taxable value</td><td className="pt-3 text-right font-bold">{inr(selected.taxableValue)}</td></tr>
                                <tr><td colSpan="4" className="text-right text-slate-500">CGST / SGST / IGST</td><td className="text-right">{inr(selected.cgstAmount)} / {inr(selected.sgstAmount)} / {inr(selected.igstAmount)}</td></tr>
                                <tr><td colSpan="4" className="pt-1 text-right font-black text-slate-700">Document total</td><td className="pt-1 text-right text-sm font-black text-slate-900">{inr(selected.grandTotal)}</td></tr>
                            </tfoot>
                        </table>
                    </aside>
                </div>
            )}
        </div>
    );
};

export default InvoiceRegister;
