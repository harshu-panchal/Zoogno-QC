import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Building2, Gavel, History, Search, Truck } from 'lucide-react';
import Card from '@shared/components/ui/Card';
import Modal from '@shared/components/ui/Modal';
import Pagination from '@shared/components/ui/Pagination';
import { cn } from '@/lib/utils';
import { adminApi } from '../../services/adminApi';
import ApplyPenaltyModal from './ApplyPenaltyModal';
import PenaltyHistoryTable from './PenaltyHistoryTable';
import { money } from './penaltyUtils';

const nameOf = (b) => b?.shopName || b?.name || 'Unknown';

/**
 * "Penalties" tab of /admin/withdrawals: for every seller / delivery partner shows earnings,
 * penalties, what is already settled, what is still payable and the wallet balance.
 * Penalties are already deducted from the payable (remaining) amount.
 */
const PenaltyBeneficiariesSection = ({ onChanged }) => {
    const [type, setType] = useState('SELLER');
    const [search, setSearch] = useState('');
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [historyFor, setHistoryFor] = useState(null); // row
    const [applyFor, setApplyFor] = useState(null); // row
    const [reloadKey, setReloadKey] = useState(0);

    const fetchRows = useCallback(async () => {
        setLoading(true);
        try {
            const fetcher = type === 'SELLER' ? adminApi.getSellerBeneficiaries : adminApi.getDeliveryBeneficiaries;
            const res = await fetcher({ page, limit: pageSize, ...(search.trim() ? { search: search.trim() } : {}) });
            const payload = res.data?.result || {};
            setRows(payload.items || []);
            setTotal(payload.total || 0);
            setTotalPages(payload.totalPages || 1);
        } catch {
            toast.error('Failed to load penalties summary');
        } finally {
            setLoading(false);
        }
    }, [type, page, pageSize, search]);

    useEffect(() => {
        const t = setTimeout(fetchRows, 350);
        return () => clearTimeout(t);
    }, [fetchRows, reloadKey]);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
                    {[
                        ['SELLER', 'Sellers', Building2],
                        ['DELIVERY_PARTNER', 'Delivery Partners', Truck],
                    ].map(([val, label, Icon]) => (
                        <button
                            key={val}
                            onClick={() => {
                                setType(val);
                                setPage(1);
                            }}
                            className={cn(
                                'flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-bold transition-all',
                                type === val ? 'bg-white text-slate-900 shadow' : 'text-slate-500',
                            )}
                        >
                            <Icon className="h-3.5 w-3.5" /> {label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setPage(1);
                            }}
                            placeholder="Search by name, phone, email..."
                            className="pl-10 pr-4 py-2.5 bg-white ring-1 ring-slate-200 rounded-2xl text-xs font-semibold outline-none w-64"
                        />
                    </div>
                    <Link to="/admin/penalties" className="text-xs font-bold text-brand-600 hover:underline">
                        Full penalty history →
                    </Link>
                </div>
            </div>

            <Card className="border-none shadow-2xl ring-1 ring-slate-100 overflow-hidden bg-white rounded-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                <th className="ds-table-header-cell pl-8">{type === 'SELLER' ? 'Seller' : 'Delivery Partner'}</th>
                                <th className="ds-table-header-cell text-right">Total Earnings</th>
                                <th className="ds-table-header-cell text-right">Total Penalties</th>
                                <th className="ds-table-header-cell text-right">Total Penalty Amount</th>
                                <th className="ds-table-header-cell text-right">Amount Settled</th>
                                <th className="ds-table-header-cell text-right">Remaining Payable</th>
                                <th className="ds-table-header-cell text-right">Wallet Balance</th>
                                <th className="ds-table-header-cell text-right pr-8">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-16 text-center text-slate-400 font-bold text-sm">
                                        Loading...
                                    </td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-16 text-center text-slate-400 font-bold text-sm">
                                        No records found.
                                    </td>
                                </tr>
                            ) : (
                                rows.map((row) => (
                                    <tr key={row.beneficiary?._id} className="hover:bg-slate-50/30">
                                        <td className="px-6 py-4 pl-8">
                                            <p className="text-sm font-bold text-slate-900">{nameOf(row.beneficiary)}</p>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                                                {row.beneficiary?.phone || row.beneficiary?.email || '—'}
                                            </p>
                                        </td>
                                        <td className="px-6 py-4 text-right text-sm font-black text-slate-900">{money(row.totalEarned)}</td>
                                        <td className="px-6 py-4 text-right text-sm font-bold text-slate-700">{row.penaltyCount || 0}</td>
                                        <td className="px-6 py-4 text-right text-sm font-black text-rose-600">
                                            {row.totalPenalties > 0 ? `-${money(row.totalPenalties)}` : money(0)}
                                        </td>
                                        <td className="px-6 py-4 text-right text-sm font-black text-emerald-600">{money(row.totalPaid)}</td>
                                        <td className="px-6 py-4 text-right text-sm font-black text-amber-600">{money(row.remaining)}</td>
                                        <td className="px-6 py-4 text-right text-sm font-black text-slate-800">{money(row.walletBalance)}</td>
                                        <td className="px-6 py-4 text-right pr-8">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => setHistoryFor(row)}
                                                    className="p-2 bg-slate-50 text-slate-500 rounded-xl hover:bg-slate-900 hover:text-white"
                                                    title="Penalty history"
                                                >
                                                    <History className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => setApplyFor(row)}
                                                    className="p-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-600 hover:text-white"
                                                    title="Apply penalty"
                                                >
                                                    <Gavel className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="px-6 py-3 border-t border-slate-100">
                    <Pagination
                        page={page}
                        totalPages={totalPages}
                        total={total}
                        pageSize={pageSize}
                        onPageChange={setPage}
                        onPageSizeChange={(s) => {
                            setPageSize(s);
                            setPage(1);
                        }}
                        loading={loading}
                    />
                </div>
            </Card>

            <p className="text-[11px] text-slate-500 px-1">
                Remaining Payable = Total Earnings − Total Penalty Amount − Amount Settled. Penalties automatically reduce the
                amount available for settlement.
            </p>

            {historyFor && (
                <Modal isOpen onClose={() => setHistoryFor(null)} title={`Penalty history — ${nameOf(historyFor.beneficiary)}`} size="full">
                    <PenaltyHistoryTable
                        fixedType={type}
                        fixedBeneficiaryId={historyFor.beneficiary?._id}
                        showFilters={false}
                        onChanged={() => {
                            setReloadKey((k) => k + 1);
                            onChanged?.();
                        }}
                    />
                </Modal>
            )}

            {applyFor && (
                <ApplyPenaltyModal
                    preset={{
                        beneficiaryType: type,
                        beneficiary: {
                            _id: applyFor.beneficiary?._id,
                            name: nameOf(applyFor.beneficiary),
                            phone: applyFor.beneficiary?.phone,
                        },
                    }}
                    onClose={() => setApplyFor(null)}
                    onApplied={() => {
                        setApplyFor(null);
                        setReloadKey((k) => k + 1);
                        onChanged?.();
                    }}
                />
            )}
        </div>
    );
};

export default PenaltyBeneficiariesSection;
