import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
    PhoneOff,
    RefreshCw,
    Eye,
    Search,
    MapPin,
    Phone,
    ExternalLink,
    AlertTriangle,
} from 'lucide-react';
import { adminApi } from '../services/adminApi';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import Modal from '@shared/components/ui/Modal';
import Pagination from '@shared/components/ui/Pagination';

const TABS = [
    { id: 'pending', label: 'Pending' },
    { id: 'cancelled', label: 'Cancelled' },
    { id: 'recovered', label: 'Recovered' },
    { id: 'retry', label: 'Retried' },
    { id: 'history', label: 'History' },
];

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (value) =>
    value
        ? new Date(value).toLocaleString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
          })
        : '—';

const CASE_STATUS = {
    CUSTOMER_UNREACHABLE: { label: 'Customer Unreachable', variant: 'warning' },
    CANCELLED_CUSTOMER_UNREACHABLE: { label: 'Cancelled – Customer Unreachable', variant: 'error' },
    RESOLVED_RETRY: { label: 'Retry Delivery', variant: 'info' },
    REACHED: { label: 'Reached', variant: 'gray' },
};

const CHARGE_STATUS = {
    NONE: { label: 'No charge', variant: 'gray' },
    PENDING: { label: 'Pending Recovery', variant: 'warning' },
    APPLIED: { label: 'Applied to new order', variant: 'info' },
    RECOVERED: { label: 'Recovered', variant: 'success' },
    WAIVED: { label: 'Waived', variant: 'gray' },
    CANCELLED: { label: 'Cancelled', variant: 'gray' },
};

const CustomerUnreachable = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { tab: tabParam } = useParams();
    const tab = TABS.some((t) => t.id === tabParam) ? tabParam : 'pending';

    const [rows, setRows] = useState([]);
    const [counts, setCounts] = useState({});
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    const [selectedId, setSelectedId] = useState(null);

    const fetchRows = useCallback(async () => {
        setLoading(true);
        try {
            const res = await adminApi.getUnreachableCases({ tab, search: query, page, limit: pageSize });
            const data = res.data?.result || {};
            setRows(data.items || []);
            setCounts(data.counts || {});
            setTotal(data.total || 0);
            setTotalPages(data.totalPages || 1);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to load customer unreachable orders');
        } finally {
            setLoading(false);
        }
    }, [tab, query, page, pageSize]);

    useEffect(() => {
        fetchRows();
    }, [fetchRows]);

    // Refresh live when a rider reports a new unreachable order.
    useEffect(() => {
        const handler = () => fetchRows();
        window.addEventListener('customer-unreachable:alert', handler);
        return () => window.removeEventListener('customer-unreachable:alert', handler);
    }, [fetchRows]);

    // Deep-link from the admin notification: /admin/customer-unreachable?case=<id>
    useEffect(() => {
        const caseParam = searchParams.get('case');
        if (caseParam) setSelectedId(caseParam);
    }, [searchParams]);

    const changeTab = (next) => {
        setPage(1);
        navigate(next === 'pending' ? '/admin/customer-unreachable' : `/admin/customer-unreachable/${next}`);
    };

    const submitSearch = (e) => {
        e.preventDefault();
        setPage(1);
        setQuery(search.trim());
    };

    const closeDetail = () => {
        setSelectedId(null);
        if (searchParams.get('case')) {
            const next = new URLSearchParams(searchParams);
            next.delete('case');
            setSearchParams(next, { replace: true });
        }
    };

    return (
        <div className="ds-section-spacing animate-in fade-in duration-700">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="ds-h1 flex items-center gap-3 text-amber-600">
                        <PhoneOff className="h-8 w-8" />
                        Customer Unreachable Orders
                    </h1>
                    <p className="ds-description mt-1">
                        Orders where the delivery partner reached the customer but could not contact them. Only
                        admin can cancel, charge or retry.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => navigate('/admin/customer-unreachable/earnings')}
                        className="px-4 py-2 bg-white rounded-lg shadow-sm border font-semibold text-sm"
                    >
                        Charge Earnings
                    </button>
                    <button
                        onClick={fetchRows}
                        className="px-4 py-2 bg-white rounded-lg shadow-sm border font-semibold text-sm flex items-center gap-2"
                    >
                        <RefreshCw className="h-4 w-4" /> Refresh
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex flex-wrap gap-2">
                    {TABS.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => changeTab(t.id)}
                            className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
                                tab === t.id
                                    ? 'bg-slate-900 text-white border-slate-900'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                        >
                            {t.label}
                            <span
                                className={`ml-2 text-[11px] px-1.5 py-0.5 rounded-full ${
                                    tab === t.id ? 'bg-white/20' : 'bg-slate-100'
                                }`}
                            >
                                {counts[t.id] ?? 0}
                            </span>
                        </button>
                    ))}
                </div>
                <form onSubmit={submitSearch} className="relative">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search order, customer, phone, rider"
                        className="pl-9 pr-3 py-2 w-72 rounded-lg border border-slate-200 text-sm bg-white"
                    />
                </form>
            </div>

            <Card className="border-none shadow-sm ring-1 ring-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
                            <tr>
                                {[
                                    'Order ID',
                                    'Customer',
                                    'Delivery Boy',
                                    'Order Amount',
                                    'Unreachable Charge',
                                    'Reached Time',
                                    'Call Attempts',
                                    'Status',
                                    'Created',
                                    'Action',
                                ].map((h) => (
                                    <th key={h} className="px-4 py-3 text-left font-bold whitespace-nowrap">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={10} className="py-16 text-center text-slate-400">
                                        Loading...
                                    </td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="py-16 text-center text-slate-400">
                                        No orders in this section.
                                    </td>
                                </tr>
                            ) : (
                                rows.map((row) => {
                                    const st = CASE_STATUS[row.status] || CASE_STATUS.REACHED;
                                    const ch = CHARGE_STATUS[row.chargeStatus] || CHARGE_STATUS.NONE;
                                    return (
                                        <tr
                                            key={row._id}
                                            className="hover:bg-slate-50/60 cursor-pointer"
                                            onClick={() => setSelectedId(row._id)}
                                        >
                                            <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">
                                                #{row.orderId}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-semibold text-slate-800">{row.customerName || '—'}</div>
                                                <div className="text-xs text-slate-500">{row.customerPhone || ''}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-semibold text-slate-800">{row.deliveryBoyName || '—'}</div>
                                                <div className="text-xs text-slate-500">{row.deliveryBoyPhone || ''}</div>
                                            </td>
                                            <td className="px-4 py-3 font-semibold whitespace-nowrap">{money(row.orderAmount)}</td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {row.status === 'CANCELLED_CUSTOMER_UNREACHABLE' && row.chargeAmount > 0 ? (
                                                    <div>
                                                        <div className="font-bold text-rose-600">{money(row.chargeAmount)}</div>
                                                        <Badge variant={ch.variant}>{ch.label}</Badge>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-400">
                                                        {row.status === 'CUSTOMER_UNREACHABLE' ? 'Awaiting admin' : '—'}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-slate-600">{fmtDate(row.reachedAt)}</td>
                                            <td className="px-4 py-3 text-center font-semibold">{row.callAttemptCount || 0}</td>
                                            <td className="px-4 py-3">
                                                <Badge variant={st.variant}>{st.label}</Badge>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-slate-600">{fmtDate(row.createdAt)}</td>
                                            <td className="px-4 py-3">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedId(row._id);
                                                    }}
                                                    className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold flex items-center gap-1"
                                                >
                                                    <Eye className="h-3.5 w-3.5" />
                                                    {row.status === 'CUSTOMER_UNREACHABLE' ? 'Review' : 'View'}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="p-4 border-t border-slate-100">
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
                <CaseDetailModal
                    caseId={selectedId}
                    onClose={closeDetail}
                    onChanged={fetchRows}
                    navigate={navigate}
                />
            )}
        </div>
    );
};

/* ------------------------------------------------------------------ */

const CaseDetailModal = ({ caseId, onClose, onChanged, navigate }) => {
    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(true);
    const [mode, setMode] = useState(null); // 'cancel' | 'retry' | 'waive'
    const [chargeAmount, setChargeAmount] = useState('');
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await adminApi.getUnreachableCase(caseId);
            setDetail(res.data?.result || null);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to load case');
            onCloseRef.current();
        } finally {
            setLoading(false);
        }
    }, [caseId]);

    useEffect(() => {
        load();
    }, [load]);

    const c = detail?.case;
    const charge = detail?.charge;
    const order = detail?.order;
    const isPending = c?.status === 'CUSTOMER_UNREACHABLE';

    const amountNumber = Number(chargeAmount || 0);
    const amountInvalid =
        chargeAmount !== '' && (!Number.isFinite(amountNumber) || amountNumber < 0 || amountNumber > (c?.orderAmount || 0));

    const resetForm = () => {
        setMode(null);
        setChargeAmount('');
        setNote('');
    };

    const submit = async () => {
        setSubmitting(true);
        try {
            if (mode === 'cancel') {
                if (amountInvalid) {
                    toast.error(`Charge must be between ₹0 and ${money(c.orderAmount)}`);
                    setSubmitting(false);
                    return;
                }
                await adminApi.cancelUnreachableCase(caseId, { chargeAmount: amountNumber, note });
                toast.success('Order cancelled – customer unreachable');
            } else if (mode === 'retry') {
                await adminApi.retryUnreachableCase(caseId, { note });
                toast.success('Rider asked to retry the delivery');
            } else if (mode === 'waive') {
                await adminApi.waiveUnreachableCharge(charge._id, { reason: note });
                toast.success('Charge waived');
            }
            resetForm();
            await load();
            onChanged();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Action failed');
        } finally {
            setSubmitting(false);
        }
    };

    const st = CASE_STATUS[c?.status] || CASE_STATUS.REACHED;
    const mapLink = (loc) =>
        loc?.lat != null ? `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}` : null;

    return (
        <Modal isOpen onClose={onClose} title={c ? `Order #${c.orderId}` : 'Customer Unreachable'} size="lg">
            {loading || !c ? (
                <div className="py-16 text-center text-slate-400">Loading...</div>
            ) : (
                <div className="space-y-5 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={st.variant}>{st.label}</Badge>
                        {c.status === 'CANCELLED_CUSTOMER_UNREACHABLE' && (
                            <Badge variant={(CHARGE_STATUS[c.chargeStatus] || CHARGE_STATUS.NONE).variant}>
                                Charge: {(CHARGE_STATUS[c.chargeStatus] || CHARGE_STATUS.NONE).label}
                            </Badge>
                        )}
                        <button
                            onClick={() => navigate(`/admin/orders/view/${c.order}`)}
                            className="ml-auto text-xs font-bold text-brand-600 flex items-center gap-1 hover:underline"
                        >
                            Open full order details <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Info title="Customer">
                            <div className="font-semibold">{c.customerName || '—'}</div>
                            {c.customerPhone && (
                                <a href={`tel:${c.customerPhone}`} className="text-brand-600 flex items-center gap-1">
                                    <Phone className="h-3.5 w-3.5" /> {c.customerPhone}
                                </a>
                            )}
                        </Info>
                        <Info title="Delivery Boy">
                            <div className="font-semibold">{c.deliveryBoyName || '—'}</div>
                            {c.deliveryBoyPhone && (
                                <a href={`tel:${c.deliveryBoyPhone}`} className="text-brand-600 flex items-center gap-1">
                                    <Phone className="h-3.5 w-3.5" /> {c.deliveryBoyPhone}
                                </a>
                            )}
                        </Info>
                        <Info title="Order Amount">
                            <div className="font-bold text-lg">{money(c.orderAmount)}</div>
                            <div className="text-xs text-slate-500">
                                {c.paymentMode || '—'}
                                {order?.paymentStatus ? ` · ${order.paymentStatus}` : ''}
                            </div>
                        </Info>
                        <Info title="Delivery Address">
                            <div>{c.address?.address || '—'}</div>
                            <div className="text-xs text-slate-500">
                                {[c.address?.landmark, c.address?.city].filter(Boolean).join(', ')}
                            </div>
                        </Info>
                        <Info title="Reached Customer Location">
                            <div>{fmtDate(c.reachedAt)}</div>
                            {mapLink(c.reachedLocation) && (
                                <a
                                    href={mapLink(c.reachedLocation)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-brand-600 flex items-center gap-1"
                                >
                                    <MapPin className="h-3 w-3" /> Rider GPS
                                    {c.reachedLocation?.distanceFromDropMeters != null &&
                                        ` (${c.reachedLocation.distanceFromDropMeters} m from drop pin)`}
                                </a>
                            )}
                        </Info>
                        <Info title="Marked Unreachable">
                            <div>{fmtDate(c.reportedAt)}</div>
                            {mapLink(c.reportedLocation) && (
                                <a
                                    href={mapLink(c.reportedLocation)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-brand-600 flex items-center gap-1"
                                >
                                    <MapPin className="h-3 w-3" /> Rider GPS
                                </a>
                            )}
                            {c.riderNote && <div className="text-xs text-slate-500 mt-1">Note: {c.riderNote}</div>}
                        </Info>
                    </div>

                    <Info title={`Call attempts (${c.callAttemptCount || 0})`}>
                        {c.callAttempts?.length ? (
                            <ul className="space-y-0.5">
                                {c.callAttempts.map((a, i) => (
                                    <li key={i} className="text-xs text-slate-600">
                                        #{i + 1} · {fmtDate(a.at)}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <span className="text-slate-400">No call attempts recorded</span>
                        )}
                    </Info>

                    <Info title={`Order items (${c.items?.length || 0})`}>
                        <ul className="space-y-0.5">
                            {(c.items || []).map((item, i) => (
                                <li key={i} className="flex justify-between text-xs">
                                    <span>
                                        {item.name} × {item.quantity}
                                    </span>
                                    <span className="text-slate-500">{money((item.price || 0) * (item.quantity || 0))}</span>
                                </li>
                            ))}
                        </ul>
                    </Info>

                    <BillSummary order={order} fallbackTotal={c.orderAmount} />

                    {c.status !== 'CUSTOMER_UNREACHABLE' && c.resolvedAt && (
                        <Info title="Admin decision">
                            <div>
                                {c.status === 'CANCELLED_CUSTOMER_UNREACHABLE' ? 'Cancelled' : 'Retry approved'} by{' '}
                                <b>{c.resolvedByName || 'Admin'}</b> · {fmtDate(c.resolvedAt)}
                            </div>
                            {c.adminNote && <div className="text-xs text-slate-500">Note: {c.adminNote}</div>}
                        </Info>
                    )}

                    {charge && (
                        <Info title="Unreachable Charge">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="font-bold text-lg text-rose-600">{money(charge.amount)}</div>
                                    <div className="text-xs text-slate-500">ID {charge.chargeId}</div>
                                    {charge.appliedOrderId && (
                                        <div className="text-xs text-slate-500">
                                            Added to order #{charge.appliedOrderId}
                                            {charge.recoveredAt ? ` · recovered ${fmtDate(charge.recoveredAt)}` : ''}
                                        </div>
                                    )}
                                </div>
                                <Badge variant={(CHARGE_STATUS[charge.status] || CHARGE_STATUS.NONE).variant}>
                                    {(CHARGE_STATUS[charge.status] || CHARGE_STATUS.NONE).label}
                                </Badge>
                            </div>
                            {charge.history?.length > 0 && (
                                <ul className="mt-2 border-t border-slate-100 pt-2 space-y-0.5">
                                    {charge.history.map((h, i) => (
                                        <li key={i} className="text-[11px] text-slate-500">
                                            {fmtDate(h.at)} · <b>{h.action}</b>
                                            {h.byName ? ` by ${h.byName}` : ''}
                                            {h.note ? ` — ${h.note}` : ''}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Info>
                    )}

                    {/* Actions */}
                    {isPending && !mode && (
                        <div className="flex flex-wrap gap-3 pt-2">
                            <button
                                onClick={() => setMode('cancel')}
                                className="px-4 py-2 rounded-lg bg-rose-600 text-white font-bold text-sm"
                            >
                                Cancel Order – Customer Unreachable
                            </button>
                            <button
                                onClick={() => setMode('retry')}
                                className="px-4 py-2 rounded-lg bg-white border border-slate-300 font-bold text-sm"
                            >
                                Resolve / Retry Delivery
                            </button>
                        </div>
                    )}

                    {charge?.status === 'PENDING' && !mode && (
                        <div className="pt-1">
                            <button
                                onClick={() => setMode('waive')}
                                className="px-4 py-2 rounded-lg bg-white border border-slate-300 font-bold text-sm"
                            >
                                Waive Charge
                            </button>
                        </div>
                    )}

                    {mode && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                            <div className="font-bold text-slate-800">
                                {mode === 'cancel' && 'Cancel order – Customer Unreachable'}
                                {mode === 'retry' && 'Ask rider to retry delivery'}
                                {mode === 'waive' && `Waive ${money(charge?.amount)} charge`}
                            </div>

                            {mode === 'cancel' && (
                                <>
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase">
                                            Unreachable Charge (₹) — optional
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            max={c.orderAmount}
                                            value={chargeAmount}
                                            onChange={(e) => setChargeAmount(e.target.value)}
                                            placeholder={`0 – ${c.orderAmount}`}
                                            className={`mt-1 w-full px-3 py-2 rounded-lg border bg-white ${
                                                amountInvalid ? 'border-red-400' : 'border-slate-200'
                                            }`}
                                        />
                                        <p className="text-xs text-slate-500 mt-1">
                                            This is added to the customer's pending balance (not deducted from their
                                            wallet) and collected with their next order. Max {money(c.orderAmount)}.
                                        </p>
                                    </div>
                                    {c.paymentMode && c.paymentMode !== 'COD' && (
                                        <div className="flex gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                                            <AlertTriangle className="h-4 w-4 shrink-0" />
                                            This was a prepaid ({c.paymentMode}) order. Cancelling does not refund
                                            automatically — handle the refund manually.
                                        </div>
                                    )}
                                </>
                            )}

                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">
                                    {mode === 'waive' ? 'Reason' : 'Admin note (optional)'}
                                </label>
                                <textarea
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    rows={2}
                                    maxLength={500}
                                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={submit}
                                    disabled={submitting || amountInvalid}
                                    className="px-4 py-2 rounded-lg bg-slate-900 text-white font-bold text-sm disabled:opacity-50"
                                >
                                    {submitting ? 'Saving...' : 'Confirm'}
                                </button>
                                <button
                                    onClick={resetForm}
                                    disabled={submitting}
                                    className="px-4 py-2 rounded-lg bg-white border border-slate-300 font-bold text-sm"
                                >
                                    Back
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
};

const BillSummary = ({ order, fallbackTotal }) => {
    const p = order?.pricing || {};
    const b = order?.paymentBreakdown || {};
    const pick = (a, c) => Number(a ?? c ?? 0) || 0;

    const rows = [
        { label: 'Item Total', value: pick(p.subtotal, b.productSubtotal) },
        { label: 'Delivery Fee', value: pick(p.deliveryFee, b.deliveryFeeCharged) },
        { label: 'Handling Fee', value: pick(p.handlingFee, b.handlingFeeCharged) },
        { label: 'Platform Fee', value: pick(p.platformFee, b.platformFeeCharged) },
        { label: 'Surge Charge', value: pick(p.surgeCharge, b.surgeChargeCharged) },
        { label: 'Tip', value: pick(p.tip, b.tipTotal) },
        { label: 'Tax', value: pick(p.gst, b.taxTotal) },
        { label: 'Customer Unreachable Charge (previous order)', value: pick(p.unreachableCharge, b.unreachableChargeCharged), tone: 'text-amber-700' },
        { label: 'Discount', value: pick(p.discount, b.discountTotal), negative: true, tone: 'text-emerald-600' },
        { label: 'Wallet Applied', value: pick(p.walletAmount, b.walletAmount), negative: true, tone: 'text-emerald-600' },
    ].filter((r) => r.value > 0 || r.label === 'Item Total');

    const total = pick(p.total, b.grandTotal) || fallbackTotal || 0;

    return (
        <Info title="Bill Summary">
            <div className="space-y-1 text-xs">
                {rows.map((r) => (
                    <div key={r.label} className={`flex justify-between ${r.tone || 'text-slate-600'}`}>
                        <span>{r.label}</span>
                        <span className="font-semibold">
                            {r.negative ? '-' : ''}
                            {money(r.value)}
                        </span>
                    </div>
                ))}
                <div className="flex justify-between border-t border-slate-100 pt-2 mt-1 text-sm font-black text-slate-900">
                    <span>Total Amount</span>
                    <span>{money(total)}</span>
                </div>
                <div className="text-[11px] text-slate-500 pt-1">
                    Payment: {order?.paymentMode || '—'}
                    {order?.paymentStatus ? ` · ${order.paymentStatus}` : ''}
                </div>
            </div>
        </Info>
    );
};

const Info = ({ title, children }) => (
    <div className="rounded-xl border border-slate-100 bg-white p-3">
        <div className="text-[10px] font-black uppercase tracking-wide text-slate-400 mb-1">{title}</div>
        {children}
    </div>
);

export default CustomerUnreachable;
