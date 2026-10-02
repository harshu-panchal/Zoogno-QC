import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import Modal from '@shared/components/ui/Modal';
import { adminApi } from '../../services/adminApi';
import {
    PENALTY_REASONS,
    EVIDENCE_KIND_LABEL,
    ISSUE_TYPE_LABEL,
    collectEvidenceItems,
    fmtDateTime,
    money,
} from './penaltyUtils';

const inputCls =
    'w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-brand-500/20';

/**
 * Apply a penalty to a seller / delivery partner.
 * `preset` may pre-fill { beneficiaryType, beneficiary: {_id, name, phone}, orderId }.
 * The admin always makes the final call — nothing is penalised automatically.
 */
const ApplyPenaltyModal = ({ preset = {}, onClose, onApplied }) => {
    const [type, setType] = useState(preset.beneficiaryType || 'SELLER');
    const [beneficiary, setBeneficiary] = useState(preset.beneficiary || null);
    const [search, setSearch] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);

    const [orders, setOrders] = useState([]);
    const [orderSearch, setOrderSearch] = useState('');
    const [orderId, setOrderId] = useState(preset.orderId || '');
    const [investigation, setInvestigation] = useState(null);
    const [loadingOrder, setLoadingOrder] = useState(false);

    const [productId, setProductId] = useState('');
    const [amount, setAmount] = useState('');
    const [reason, setReason] = useState('');
    const [notes, setNotes] = useState('');
    const [ticketId, setTicketId] = useState('');
    const [picked, setPicked] = useState(new Set());
    const [submitting, setSubmitting] = useState(false);

    // Beneficiary search (skipped when preset)
    useEffect(() => {
        if (preset.beneficiary || beneficiary) return undefined;
        const timer = setTimeout(async () => {
            setSearching(true);
            try {
                const fetcher = type === 'SELLER' ? adminApi.getSellerBeneficiaries : adminApi.getDeliveryBeneficiaries;
                const res = await fetcher({ search: search.trim(), limit: 8, page: 1 });
                setResults(res.data?.result?.items || []);
            } catch {
                setResults([]);
            } finally {
                setSearching(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [type, search, beneficiary, preset.beneficiary]);

    // Orders of the chosen beneficiary (skipped when an order is preset)
    const loadOrders = useCallback(async () => {
        if (!beneficiary?._id) return;
        try {
            const res = await adminApi.getPenaltyBeneficiaryOrders({
                type,
                beneficiaryId: beneficiary._id,
                search: orderSearch.trim(),
            });
            setOrders(res.data?.result?.items || []);
        } catch {
            setOrders([]);
        }
    }, [type, beneficiary, orderSearch]);

    useEffect(() => {
        if (preset.orderId) return undefined;
        const timer = setTimeout(loadOrders, 250);
        return () => clearTimeout(timer);
    }, [loadOrders, preset.orderId]);

    // Evidence + products + tickets for the chosen order
    useEffect(() => {
        if (!orderId) {
            setInvestigation(null);
            return;
        }
        let cancelled = false;
        setLoadingOrder(true);
        adminApi
            .getOrderInvestigation(orderId)
            .then((res) => {
                if (cancelled) return;
                const inv = res.data?.result || null;
                setInvestigation(inv);
                setPicked(new Set(collectEvidenceItems(inv).map((e) => e.url)));
            })
            .catch((error) => {
                if (!cancelled) toast.error(error.response?.data?.message || 'Could not load the order');
            })
            .finally(() => {
                if (!cancelled) setLoadingOrder(false);
            });
        return () => {
            cancelled = true;
        };
    }, [orderId]);

    const evidenceItems = collectEvidenceItems(investigation);
    const amountNumber = Number(amount);
    const canSubmit =
        beneficiary?._id && orderId && reason && Number.isFinite(amountNumber) && amountNumber > 0 && !submitting;

    const submit = async () => {
        if (!canSubmit) return;
        if (reason === 'OTHER' && !notes.trim()) {
            toast.error('Please add a note explaining the penalty');
            return;
        }
        setSubmitting(true);
        try {
            await adminApi.applyPenalty({
                beneficiaryType: type,
                beneficiaryId: beneficiary._id,
                orderId,
                productId: productId || undefined,
                amount: amountNumber,
                reason,
                notes,
                relatedTicketId: ticketId || undefined,
                evidence: evidenceItems.filter((e) => picked.has(e.url)).map((e) => ({ url: e.url, caption: e.caption })),
            });
            toast.success('Penalty applied and deducted from earnings');
            onApplied?.();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Could not apply penalty');
        } finally {
            setSubmitting(false);
        }
    };

    const togglePick = (url) =>
        setPicked((prev) => {
            const next = new Set(prev);
            if (next.has(url)) next.delete(url);
            else next.add(url);
            return next;
        });

    return (
        <Modal isOpen onClose={onClose} title="Apply Penalty" size="lg">
            <div className="space-y-4 text-sm">
                {/* 1. Who */}
                <div>
                    <label className="text-[11px] font-black uppercase tracking-wide text-slate-400">1. Seller / Delivery partner</label>
                    {beneficiary ? (
                        <div className="mt-1 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <div>
                                <div className="font-bold text-slate-900">{beneficiary.name}</div>
                                <div className="text-xs text-slate-500">
                                    {type === 'SELLER' ? 'Seller' : 'Delivery partner'} {beneficiary.phone ? `· ${beneficiary.phone}` : ''}
                                </div>
                            </div>
                            {!preset.beneficiary && (
                                <button
                                    onClick={() => {
                                        setBeneficiary(null);
                                        setOrderId('');
                                        setOrders([]);
                                    }}
                                    className="text-xs font-bold text-brand-600"
                                >
                                    Change
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="mt-1 space-y-2">
                            <div className="flex gap-2">
                                {[
                                    ['SELLER', 'Seller'],
                                    ['DELIVERY_PARTNER', 'Delivery partner'],
                                ].map(([val, label]) => (
                                    <button
                                        key={val}
                                        onClick={() => {
                                            setType(val);
                                            setResults([]);
                                        }}
                                        className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
                                            type === val ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <div className="relative">
                                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search by name or phone"
                                    className={`${inputCls} pl-9`}
                                />
                            </div>
                            <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-100 divide-y divide-slate-100">
                                {searching ? (
                                    <div className="p-3 text-xs text-slate-400">Searching...</div>
                                ) : results.length === 0 ? (
                                    <div className="p-3 text-xs text-slate-400">No results</div>
                                ) : (
                                    results.map((row) => {
                                        const b = row.beneficiary || {};
                                        return (
                                            <button
                                                key={b._id}
                                                onClick={() =>
                                                    setBeneficiary({ _id: b._id, name: b.shopName || b.name || 'Unknown', phone: b.phone })
                                                }
                                                className="w-full text-left px-3 py-2 hover:bg-slate-50"
                                            >
                                                <div className="font-semibold text-slate-800">{b.shopName || b.name}</div>
                                                <div className="text-[11px] text-slate-500">
                                                    {b.phone || b.email || ''} · remaining {money(row.remaining)}
                                                </div>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* 2. Order */}
                {beneficiary && (
                    <div>
                        <label className="text-[11px] font-black uppercase tracking-wide text-slate-400">2. Related order</label>
                        {preset.orderId ? (
                            <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-bold">#{orderId}</div>
                        ) : (
                            <div className="mt-1 space-y-2">
                                <input
                                    value={orderSearch}
                                    onChange={(e) => setOrderSearch(e.target.value)}
                                    placeholder="Search order ID"
                                    className={inputCls}
                                />
                                <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-100 divide-y divide-slate-100">
                                    {orders.length === 0 ? (
                                        <div className="p-3 text-xs text-slate-400">No orders found</div>
                                    ) : (
                                        orders.map((o) => (
                                            <button
                                                key={o._id}
                                                onClick={() => {
                                                    setOrderId(o.orderId);
                                                    setProductId('');
                                                }}
                                                className={`w-full text-left px-3 py-2 hover:bg-slate-50 ${
                                                    orderId === o.orderId ? 'bg-brand-50' : ''
                                                }`}
                                            >
                                                <div className="flex justify-between">
                                                    <span className="font-semibold text-slate-800">#{o.orderId}</span>
                                                    <span className="text-xs text-slate-500">{money(o.total)}</span>
                                                </div>
                                                <div className="text-[11px] text-slate-500">
                                                    {fmtDateTime(o.createdAt)} · {o.status}
                                                    {o.returnStatus && o.returnStatus !== 'none' ? ` · return: ${o.returnStatus}` : ''}
                                                </div>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {orderId && (
                    <>
                        {loadingOrder && <div className="text-xs text-slate-400">Loading order…</div>}

                        {investigation && (
                            <>
                                {/* 3. Product */}
                                <div>
                                    <label className="text-[11px] font-black uppercase tracking-wide text-slate-400">3. Product</label>
                                    <select value={productId} onChange={(e) => setProductId(e.target.value)} className={`${inputCls} mt-1`}>
                                        <option value="">Whole order / not product specific</option>
                                        {(investigation.order?.items || []).map((i, idx) => (
                                            <option key={`${i.productId}-${idx}`} value={i.productId}>
                                                {i.name} × {i.quantity}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Related issue */}
                                {(investigation.tickets?.length > 0 || investigation.returnInfo) && (
                                    <div>
                                        <label className="text-[11px] font-black uppercase tracking-wide text-slate-400">Related issue</label>
                                        {investigation.returnInfo && (
                                            <div className="mt-1 text-xs text-slate-600 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                                                Return request ({investigation.returnInfo.status}): {investigation.returnInfo.reason || '—'}
                                            </div>
                                        )}
                                        {investigation.tickets?.length > 0 && (
                                            <select value={ticketId} onChange={(e) => setTicketId(e.target.value)} className={`${inputCls} mt-1`}>
                                                <option value="">No support ticket linked</option>
                                                {investigation.tickets.map((t) => (
                                                    <option key={t._id} value={t._id}>
                                                        {t.subject} {t.issueType ? `(${ISSUE_TYPE_LABEL[t.issueType] || t.issueType})` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                )}

                                {/* Evidence */}
                                <div>
                                    <label className="text-[11px] font-black uppercase tracking-wide text-slate-400">
                                        Evidence to attach ({picked.size}/{evidenceItems.length})
                                    </label>
                                    {evidenceItems.length === 0 ? (
                                        <div className="mt-1 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                            No photos exist for this order yet. You can still apply the penalty and explain in the notes.
                                        </div>
                                    ) : (
                                        <div className="mt-1 grid grid-cols-4 sm:grid-cols-5 gap-2">
                                            {evidenceItems.map((e) => (
                                                <label key={e.url} className="relative cursor-pointer" title={EVIDENCE_KIND_LABEL[e.kind]}>
                                                    <img
                                                        src={e.url}
                                                        alt={e.kind}
                                                        className={`h-16 w-full object-cover rounded-lg border-2 ${
                                                            picked.has(e.url) ? 'border-brand-500' : 'border-transparent opacity-60'
                                                        }`}
                                                    />
                                                    <input
                                                        type="checkbox"
                                                        checked={picked.has(e.url)}
                                                        onChange={() => togglePick(e.url)}
                                                        className="absolute top-1 left-1"
                                                    />
                                                    <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[8px] text-center leading-tight rounded-b-lg px-0.5">
                                                        {EVIDENCE_KIND_LABEL[e.kind]}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {/* Amount / reason / notes */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="text-[11px] font-black uppercase tracking-wide text-slate-400">Penalty amount (₹)</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    className={`${inputCls} mt-1`}
                                    placeholder="e.g. 200"
                                />
                            </div>
                            <div>
                                <label className="text-[11px] font-black uppercase tracking-wide text-slate-400">Reason</label>
                                <select value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputCls} mt-1`}>
                                    <option value="">Select a reason</option>
                                    {PENALTY_REASONS.map((r) => (
                                        <option key={r.value} value={r.value}>
                                            {r.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="text-[11px] font-black uppercase tracking-wide text-slate-400">Notes / comments</label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={3}
                                maxLength={1000}
                                className={`${inputCls} mt-1`}
                                placeholder="What did you find in the evidence? Why is this party responsible?"
                            />
                        </div>

                        <div className="text-[11px] text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                            The amount is recorded in the penalty history, debited from the wallet and deducted from the
                            payable earnings in Settlements. It can later be revoked (the record stays).
                        </div>
                    </>
                )}

                <div className="flex justify-end gap-3 pt-1">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white border border-slate-300 font-bold text-sm">
                        Cancel
                    </button>
                    <button
                        onClick={submit}
                        disabled={!canSubmit}
                        className="px-4 py-2 rounded-lg bg-rose-600 text-white font-bold text-sm disabled:opacity-40"
                    >
                        {submitting ? 'Applying...' : `Apply penalty${amountNumber > 0 ? ` of ${money(amountNumber)}` : ''}`}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default ApplyPenaltyModal;
