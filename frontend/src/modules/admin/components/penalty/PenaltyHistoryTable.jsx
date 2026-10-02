import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Eye, Search } from 'lucide-react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import Pagination from '@shared/components/ui/Pagination';
import { adminApi } from '../../services/adminApi';
import PenaltyDetailModal from './PenaltyDetailModal';
import { fmtDateTime, money, reasonLabel } from './penaltyUtils';

/**
 * Penalty history list. Pass `fixedType` / `fixedBeneficiaryId` to scope it to one seller or
 * delivery partner (used from the Settlements page). `refreshKey` forces a reload.
 */
const PenaltyHistoryTable = ({ fixedType = '', fixedBeneficiaryId = '', showFilters = true, refreshKey = 0, onChanged }) => {
    const [rows, setRows] = useState([]);
    const [totals, setTotals] = useState({ appliedAmount: 0, appliedCount: 0 });
    const [loading, setLoading] = useState(true);
    const [type, setType] = useState(fixedType);
    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [selectedId, setSelectedId] = useState(null);

    const fetchRows = useCallback(async () => {
        setLoading(true);
        try {
            const res = await adminApi.getPenalties({
                type: fixedType || type,
                status,
                beneficiaryId: fixedBeneficiaryId || undefined,
                search: query,
                page,
                limit: pageSize,
            });
            const data = res.data?.result || {};
            setRows(data.items || []);
            setTotals(data.totals || { appliedAmount: 0, appliedCount: 0 });
            setTotal(data.total || 0);
            setTotalPages(data.totalPages || 1);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to load penalty history');
        } finally {
            setLoading(false);
        }
    }, [fixedType, fixedBeneficiaryId, type, status, query, page, pageSize]);

    useEffect(() => {
        fetchRows();
    }, [fetchRows, refreshKey]);

    return (
        <div className="space-y-3">
            {showFilters && (
                <div className="flex flex-wrap items-center gap-3">
                    {!fixedType && (
                        <select
                            value={type}
                            onChange={(e) => {
                                setType(e.target.value);
                                setPage(1);
                            }}
                            className="px-3 py-2 bg-white ring-1 ring-slate-200 rounded-xl text-xs font-bold"
                        >
                            <option value="">Sellers & Delivery</option>
                            <option value="SELLER">Sellers</option>
                            <option value="DELIVERY_PARTNER">Delivery partners</option>
                        </select>
                    )}
                    <select
                        value={status}
                        onChange={(e) => {
                            setStatus(e.target.value);
                            setPage(1);
                        }}
                        className="px-3 py-2 bg-white ring-1 ring-slate-200 rounded-xl text-xs font-bold"
                    >
                        <option value="">All status</option>
                        <option value="APPLIED">Applied</option>
                        <option value="REVOKED">Revoked</option>
                    </select>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            setPage(1);
                            setQuery(search.trim());
                        }}
                        className="relative"
                    >
                        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Penalty ID, order, name, product"
                            className="pl-9 pr-3 py-2 w-64 rounded-xl border border-slate-200 text-xs bg-white"
                        />
                    </form>
                    <div className="ml-auto text-xs font-bold text-slate-600">
                        Active penalties: {totals.appliedCount} · <span className="text-rose-600">{money(totals.appliedAmount)}</span>
                    </div>
                </div>
            )}

            <Card className="border-none shadow-sm ring-1 ring-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
                            <tr>
                                {[
                                    'Penalty ID',
                                    'Order',
                                    'Product',
                                    'Seller / Delivery Boy',
                                    'Amount',
                                    'Reason',
                                    'Date',
                                    'Applied By',
                                    'Related Issue',
                                    'Evidence',
                                    'Status',
                                    'Deducted',
                                    'Remaining Payable',
                                    '',
                                ].map((h) => (
                                    <th key={h} className="px-3 py-3 text-left font-bold whitespace-nowrap">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={14} className="py-14 text-center text-slate-400">
                                        Loading...
                                    </td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={14} className="py-14 text-center text-slate-400">
                                        No penalties recorded.
                                    </td>
                                </tr>
                            ) : (
                                rows.map((p) => (
                                    <tr key={p._id} className="hover:bg-slate-50/60 cursor-pointer" onClick={() => setSelectedId(p._id)}>
                                        <td className="px-3 py-3 font-mono text-[11px] font-bold whitespace-nowrap">{p.penaltyId}</td>
                                        <td className="px-3 py-3 whitespace-nowrap font-semibold">#{p.orderId}</td>
                                        <td className="px-3 py-3 max-w-[160px] truncate">{p.productName || '—'}</td>
                                        <td className="px-3 py-3">
                                            <div className="font-semibold text-slate-800">{p.beneficiaryName || '—'}</div>
                                            <div className="text-[11px] text-slate-500">
                                                {p.beneficiaryType === 'SELLER' ? 'Seller' : 'Delivery boy'}
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 font-bold text-rose-600 whitespace-nowrap">{money(p.amount)}</td>
                                        <td className="px-3 py-3 max-w-[200px]">{reasonLabel(p.reason)}</td>
                                        <td className="px-3 py-3 whitespace-nowrap text-slate-600">{fmtDateTime(p.createdAt)}</td>
                                        <td className="px-3 py-3 whitespace-nowrap text-slate-600">{p.appliedByName || '—'}</td>
                                        <td className="px-3 py-3 text-xs text-slate-600 max-w-[170px]">
                                            {p.relatedTicketSubject
                                                ? `Ticket: ${p.relatedTicketSubject}`
                                                : p.relatedReturnStatus
                                                  ? `Return: ${p.relatedReturnStatus}`
                                                  : '—'}
                                        </td>
                                        <td className="px-3 py-3">
                                            {p.evidence?.length ? (
                                                <div className="flex -space-x-2">
                                                    {p.evidence.slice(0, 3).map((e) => (
                                                        <img
                                                            key={e.url}
                                                            src={e.url}
                                                            alt=""
                                                            className="h-8 w-8 rounded-md object-cover border-2 border-white"
                                                        />
                                                    ))}
                                                    {p.evidence.length > 3 && (
                                                        <span className="h-8 w-8 rounded-md bg-slate-100 border-2 border-white text-[10px] font-bold flex items-center justify-center">
                                                            +{p.evidence.length - 3}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-slate-400 text-xs">None</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-3">
                                            <Badge variant={p.status === 'APPLIED' ? 'error' : 'gray'}>{p.status}</Badge>
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap">
                                            {p.status === 'APPLIED' ? money(p.amountDeducted) : <span className="text-slate-400">₹0 (revoked)</span>}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap">{money(p.remainingAfter)}</td>
                                        <td className="px-3 py-3">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedId(p._id);
                                                }}
                                                className="p-2 rounded-lg bg-slate-50 hover:bg-slate-900 hover:text-white"
                                            >
                                                <Eye className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="p-3 border-t border-slate-100">
                    <Pagination
                        page={page}
                        totalPages={totalPages}
                        total={total}
                        pageSize={pageSize}
                        onPageChange={setPage}
                        onPageSizeChange={(size) => {
                            setPageSize(size);
                            setPage(1);
                        }}
                        loading={loading}
                    />
                </div>
            </Card>

            {selectedId && (
                <PenaltyDetailModal
                    penaltyId={selectedId}
                    onClose={() => setSelectedId(null)}
                    onChanged={() => {
                        fetchRows();
                        onChanged?.();
                    }}
                />
            )}
        </div>
    );
};

export default PenaltyHistoryTable;
