import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, ArrowDownLeft, ChevronLeft, Wallet } from 'lucide-react';
import { customerApi } from '../services/customerApi';

const formatDate = (d) => {
    if (!d) return '';
    const date = new Date(d);
    const now = new Date();
    const today = now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today) return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ', ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const WalletPage = () => {
    const navigate = useNavigate();
    const [balance, setBalance] = useState(0);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pendingCharges, setPendingCharges] = useState({ pendingTotal: 0, charges: [] });
    const [openChargeId, setOpenChargeId] = useState(null);

    useEffect(() => {
        customerApi
            .getMyUnreachableCharges()
            .then((res) => {
                const data = res.data?.result;
                if (data) setPendingCharges({ pendingTotal: data.pendingTotal || 0, charges: data.charges || [] });
            })
            .catch(() => {
                /* optional section — wallet keeps working without it */
            });
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [profileRes, txRes] = await Promise.all([
                    customerApi.getProfile(),
                    customerApi.getWalletTransactions(),
                ]);
                const profile = profileRes.data?.result ?? profileRes.data?.data ?? profileRes.data;
                const txData = txRes.data?.result ?? txRes.data?.data ?? txRes.data;
                const rawTransactions = txData?.items ?? [];
                
                setBalance(profile?.walletBalance ?? 0);
                setTransactions(rawTransactions);
            } catch (err) {
                console.error('Wallet fetch error:', err);
                setBalance(0);
                setTransactions([]);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    return (
        <div className="min-h-screen bg-slate-50 pb-24 font-sans">
            <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-sm px-4 pt-4 pb-3 border-b border-slate-200/60 mb-4 flex items-center gap-2">
                <button
                    onClick={() => navigate(-1)}
                    className="w-10 h-10 flex items-center justify-center hover:bg-slate-200/70 rounded-full transition-colors -ml-1"
                >
                    <ChevronLeft size={22} className="text-slate-800" />
                </button>
                <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Wallet</h1>
            </div>

            <div className="max-w-2xl mx-auto px-4 pt-1 relative z-20 space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Available Balance</p>
                    <h2 className="text-3xl font-semibold text-slate-900 mt-1">
                        {loading ? '...' : `₹${(balance || 0).toLocaleString('en-IN')}`}
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">Return refunds are credited here</p>
                </div>

                {pendingCharges.charges.length > 0 && (
                    <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
                        <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/60">
                            <h3 className="text-base font-semibold text-amber-900">Pending Charges</h3>
                            <p className="text-[11px] text-amber-700 uppercase tracking-wide font-semibold">
                                Customer Unreachable Charges
                            </p>
                        </div>

                        {pendingCharges.pendingTotal > 0 && (
                            <div className="px-4 py-3 border-b border-slate-100">
                                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                                    Pending Unreachable Charge
                                </p>
                                <p className="text-2xl font-semibold text-rose-600 mt-0.5">
                                    -₹{pendingCharges.pendingTotal.toLocaleString('en-IN')}
                                </p>
                                <p className="text-xs text-slate-600 mt-1">
                                    You have a pending ₹{pendingCharges.pendingTotal.toLocaleString('en-IN')} delivery
                                    charge from a previous order. This amount will be added to your next order.
                                </p>
                            </div>
                        )}

                        <div className="divide-y divide-slate-100">
                            {pendingCharges.charges.map((charge) => {
                                const statusMeta = {
                                    PENDING: { label: 'Pending Recovery', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
                                    PENDING_RECOVERY_APPLIED: {
                                        label: charge.appliedOrderId
                                            ? `Added to order #${charge.appliedOrderId}`
                                            : 'Added to your order',
                                        cls: 'bg-blue-50 text-blue-700 border-blue-200',
                                    },
                                    RECOVERED: { label: 'Recovered', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                                    WAIVED: { label: 'Waived', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
                                    CANCELLED: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
                                }[charge.status] || { label: charge.status, cls: 'bg-slate-100 text-slate-600 border-slate-200' };
                                const isOpen = openChargeId === charge._id;
                                return (
                                    <div key={charge._id} className="px-4 py-3.5">
                                        <button
                                            type="button"
                                            onClick={() => setOpenChargeId(isOpen ? null : charge._id)}
                                            className="w-full text-left"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="font-semibold text-slate-800 text-sm">
                                                        Order #{charge.originalOrderId}
                                                    </p>
                                                    <p className="text-[11px] text-slate-500">Reason: {charge.reason}</p>
                                                    <p className="text-[11px] text-slate-500">{formatDate(charge.createdAt)}</p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-sm font-semibold text-slate-900">
                                                        ₹{(charge.amount || 0).toLocaleString('en-IN')}
                                                    </p>
                                                    <span
                                                        className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusMeta.cls}`}
                                                    >
                                                        {statusMeta.label}
                                                    </span>
                                                </div>
                                            </div>
                                        </button>
                                        {isOpen && (
                                            <div className="mt-3 rounded-lg bg-slate-50 border border-slate-100 p-3 text-xs text-slate-600 space-y-1">
                                                <p>
                                                    Original order amount:{' '}
                                                    <b>₹{(charge.originalOrderAmount || 0).toLocaleString('en-IN')}</b>
                                                </p>
                                                {charge.originalOrder?.items?.length > 0 && (
                                                    <ul className="list-disc pl-4">
                                                        {charge.originalOrder.items.map((item, i) => (
                                                            <li key={i}>
                                                                {item.name} × {item.quantity}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                                {charge.recoveredAt && <p>Recovered on {formatDate(charge.recoveredAt)}</p>}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="text-base font-semibold text-slate-800">Transaction History</h3>
                        <Wallet size={18} className="text-slate-400" />
                    </div>

                    {loading ? (
                        <div className="py-12 flex justify-center text-slate-400 text-sm font-semibold">
                            Loading...
                        </div>
                    ) : transactions.length === 0 ? (
                        <div className="py-12 flex flex-col items-center justify-center text-center px-6">
                            <p className="text-sm font-semibold text-slate-500 mb-1">No wallet payments yet</p>
                            <p className="text-xs text-slate-400">
                                Orders paid using wallet will appear here.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {transactions.map((tx) => (
                                <div key={tx._id} className="px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${tx.type === 'credit' ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-700'}`}>
                                            {tx.type === 'credit' ? <ArrowDownLeft size={19} /> : <ArrowUpRight size={19} />}
                                        </div>
                                        <div>
                                            <h4 className="font-semibold text-slate-800 text-sm">{tx.title}</h4>
                                            <p className="text-[11px] text-slate-500">{formatDate(tx.date)}</p>
                                            {tx.orderId && (
                                                <p className="text-[10px] text-slate-500">#{tx.orderId}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className={`text-sm font-semibold ${tx.type === 'credit' ? 'text-brand-600' : 'text-slate-900'}`}>
                                        {tx.type === 'credit' ? '+' : '-'}₹{(tx.amount || 0).toLocaleString('en-IN')}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WalletPage;
