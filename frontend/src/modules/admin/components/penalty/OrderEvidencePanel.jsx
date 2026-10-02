import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Gavel } from 'lucide-react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import { adminApi } from '../../services/adminApi';
import ApplyPenaltyModal from './ApplyPenaltyModal';
import { ISSUE_TYPE_LABEL, fmtDateTime, money, reasonLabel } from './penaltyUtils';

const CONDITION_VARIANT = { GOOD: 'success', MINOR_ISSUE: 'warning', DAMAGED: 'error' };

const PhotoGrid = ({ urls, empty }) =>
    urls.length ? (
        <div className="grid grid-cols-3 gap-2">
            {urls.map((u) => (
                <a key={u} href={u} target="_blank" rel="noopener noreferrer">
                    <img src={u} alt="Evidence" className="h-20 w-full object-cover rounded-lg border border-slate-200 hover:opacity-90" />
                </a>
            ))}
        </div>
    ) : (
        <div className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-4 text-center">{empty}</div>
    );

const Block = ({ title, status, children }) => (
    <div className="rounded-xl border border-slate-100 bg-white p-3">
        <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{title}</div>
            {status}
        </div>
        {children}
    </div>
);

/**
 * Admin "Product Condition & Evidence" section for an order: everything needed to decide
 * whether the seller, the delivery partner (or neither) is responsible — and the place from
 * which a penalty is applied. Never applies anything automatically.
 */
const OrderEvidencePanel = ({ orderId }) => {
    const [inv, setInv] = useState(null);
    const [loading, setLoading] = useState(true);
    const [apply, setApply] = useState(null); // { beneficiaryType, beneficiary, orderId }

    const load = useCallback(async () => {
        if (!orderId) return;
        setLoading(true);
        try {
            const res = await adminApi.getOrderInvestigation(orderId);
            setInv(res.data?.result || null);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Could not load evidence');
        } finally {
            setLoading(false);
        }
    }, [orderId]);

    useEffect(() => {
        load();
    }, [load]);

    if (loading) {
        return (
            <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-xl p-4 text-sm text-slate-400">
                Loading product condition &amp; evidence…
            </Card>
        );
    }
    if (!inv) return null;

    const sellerUrls = (inv.sellerEvidence?.images || []).map((i) => i.url);
    const riderUrls = (inv.riderEvidence?.images || []).map((i) => i.url);
    const customerUrls = [
        ...(inv.returnInfo?.images || []),
        ...(inv.tickets || []).flatMap((t) => [...(t.attachments || []), ...(t.media || []).map((m) => m.url)]),
    ];
    const returnPickupUrls = inv.returnInfo?.pickupImages || [];

    const statusChip = (ok, okText, missingText) =>
        ok ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> {okText}
            </span>
        ) : (
            <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" /> {missingText}
            </span>
        );

    const ev = inv.evidenceStatus || {};

    return (
        <Card className="border-none shadow-xl ring-1 ring-rose-100 bg-white rounded-xl p-4 space-y-4 text-left">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                    <Gavel className="h-4 w-4 text-rose-500" /> Product Condition &amp; Evidence
                </h3>
                <div className="flex flex-wrap gap-2">
                    {inv.seller && (
                        <button
                            onClick={() =>
                                setApply({
                                    beneficiaryType: 'SELLER',
                                    beneficiary: { _id: inv.seller._id, name: inv.seller.name, phone: inv.seller.phone },
                                    orderId: inv.order.orderId,
                                })
                            }
                            className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold"
                        >
                            Penalise seller
                        </button>
                    )}
                    {inv.deliveryBoy && (
                        <button
                            onClick={() =>
                                setApply({
                                    beneficiaryType: 'DELIVERY_PARTNER',
                                    beneficiary: { _id: inv.deliveryBoy._id, name: inv.deliveryBoy.name, phone: inv.deliveryBoy.phone },
                                    orderId: inv.order.orderId,
                                })
                            }
                            className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold"
                        >
                            Penalise delivery boy
                        </button>
                    )}
                </div>
            </div>

            <p className="text-xs text-slate-500">
                Review the photos and history below, decide where the problem happened, then apply a penalty only if someone
                is responsible. A customer complaint alone never penalises anyone.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="rounded-lg bg-slate-50 p-2.5">
                    <div className="text-[10px] font-black uppercase text-slate-400">Seller</div>
                    <div className="font-bold text-slate-800">{inv.seller?.name || '—'}</div>
                    <div className="text-slate-500">{inv.seller?.phone || ''}</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5">
                    <div className="text-[10px] font-black uppercase text-slate-400">Delivery boy</div>
                    <div className="font-bold text-slate-800">{inv.deliveryBoy?.name || 'Not assigned'}</div>
                    <div className="text-slate-500">{inv.deliveryBoy?.phone || ''}</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5">
                    <div className="text-[10px] font-black uppercase text-slate-400">Customer</div>
                    <div className="font-bold text-slate-800">{inv.customer?.name || '—'}</div>
                    <div className="text-slate-500">{inv.customer?.phone || ''}</div>
                </div>
            </div>

            {/* Photos at each stage */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <Block
                    title="1 · Seller (at dispatch)"
                    status={statusChip(ev.sellerDispatch, `${sellerUrls.length} photo(s)`, ev.required ? 'No photos' : 'Not required')}
                >
                    <PhotoGrid urls={sellerUrls} empty="Seller did not upload any photos" />
                    {inv.sellerEvidence && (
                        <div className="mt-2 text-[11px] text-slate-600">
                            <Badge variant={CONDITION_VARIANT[inv.sellerEvidence.condition] || 'gray'}>
                                {inv.sellerEvidence.condition?.replace('_', ' ')}
                            </Badge>{' '}
                            {fmtDateTime(inv.sellerEvidence.firstUploadedAt)}
                            {inv.sellerEvidence.note ? <div className="mt-1">“{inv.sellerEvidence.note}”</div> : null}
                        </div>
                    )}
                </Block>

                <Block
                    title="2 · Delivery boy (at pickup)"
                    status={statusChip(ev.riderPickup, `${riderUrls.length} photo(s)`, ev.required ? 'No photos' : 'Not required')}
                >
                    <PhotoGrid urls={riderUrls} empty="Delivery boy did not upload any photos" />
                    {inv.riderEvidence && (
                        <div className="mt-2 text-[11px] text-slate-600">
                            <Badge variant={CONDITION_VARIANT[inv.riderEvidence.condition] || 'gray'}>
                                {inv.riderEvidence.condition?.replace('_', ' ')}
                            </Badge>{' '}
                            {fmtDateTime(inv.riderEvidence.firstUploadedAt)}
                            {inv.riderEvidence.note ? <div className="mt-1">“{inv.riderEvidence.note}”</div> : null}
                        </div>
                    )}
                </Block>

                <Block title="3 · Customer" status={statusChip(customerUrls.length > 0, `${customerUrls.length} photo(s)`, 'No photos')}>
                    <PhotoGrid urls={customerUrls} empty="Customer has not uploaded photos" />
                </Block>
            </div>

            {/* Return */}
            {inv.returnInfo && (
                <Block title="Return request" status={<Badge variant="warning">{inv.returnInfo.status}</Badge>}>
                    <div className="text-xs text-slate-700 space-y-1">
                        <div>
                            <b>Reason:</b> {inv.returnInfo.reason || '—'}
                            {inv.returnInfo.reasonDetail ? ` — ${inv.returnInfo.reasonDetail}` : ''}
                        </div>
                        <div>
                            <b>Requested:</b> {fmtDateTime(inv.returnInfo.requestedAt)}
                        </div>
                        {inv.returnInfo.items?.length > 0 && (
                            <div>
                                <b>Items:</b>{' '}
                                {inv.returnInfo.items.map((i) => `${i.name || i.productName || 'Item'} ×${i.quantity || 1}`).join(', ')}
                            </div>
                        )}
                        {inv.returnInfo.pickupCondition && (
                            <div>
                                <b>Condition at return pickup:</b> {inv.returnInfo.pickupCondition}
                                {inv.returnInfo.pickupConditionNote ? ` — ${inv.returnInfo.pickupConditionNote}` : ''}
                            </div>
                        )}
                        {inv.returnInfo.qcStatus && (
                            <div>
                                <b>QC:</b> {inv.returnInfo.qcStatus} {inv.returnInfo.qcNote ? `— ${inv.returnInfo.qcNote}` : ''}
                            </div>
                        )}
                        {inv.returnInfo.rejectedReason && (
                            <div>
                                <b>Rejected:</b> {inv.returnInfo.rejectedReason}
                            </div>
                        )}
                    </div>
                    {returnPickupUrls.length > 0 && (
                        <div className="mt-2">
                            <div className="text-[10px] font-black uppercase text-slate-400 mb-1">Return pickup photos (rider)</div>
                            <PhotoGrid urls={returnPickupUrls} empty="" />
                        </div>
                    )}
                </Block>
            )}

            {/* Tickets */}
            {inv.tickets?.length > 0 && (
                <Block title={`Support tickets (${inv.tickets.length})`}>
                    <div className="space-y-2">
                        {inv.tickets.map((t) => (
                            <div key={t._id} className="text-xs text-slate-700 rounded-lg bg-slate-50 p-2.5">
                                <div className="flex items-center justify-between">
                                    <b>{t.subject}</b>
                                    <Badge variant={t.status === 'closed' ? 'gray' : 'warning'}>{t.status}</Badge>
                                </div>
                                {t.issueType && <div className="text-slate-500">Issue: {ISSUE_TYPE_LABEL[t.issueType] || t.issueType}</div>}
                                <div className="mt-1">{t.description}</div>
                                <div className="text-[10px] text-slate-400 mt-1">{fmtDateTime(t.createdAt)}</div>
                            </div>
                        ))}
                    </div>
                </Block>
            )}

            {/* Timeline */}
            <Block title="Order timeline">
                <ul className="space-y-1.5">
                    {inv.timeline.map((e, i) => (
                        <li key={i} className="flex gap-3 text-xs">
                            <span className="text-slate-400 whitespace-nowrap w-36 shrink-0">{fmtDateTime(e.at)}</span>
                            <span className="text-slate-800">
                                <b>{e.label}</b>
                                {e.detail ? <span className="text-slate-500"> — {e.detail}</span> : null}
                            </span>
                        </li>
                    ))}
                </ul>
            </Block>

            {/* Existing penalties */}
            {inv.penalties?.length > 0 && (
                <Block title={`Penalties on this order (${inv.penalties.length})`}>
                    <ul className="space-y-1.5">
                        {inv.penalties.map((p) => (
                            <li key={p._id} className="flex items-center justify-between text-xs">
                                <span>
                                    <b>{p.penaltyId}</b> · {p.beneficiaryName} ({p.beneficiaryType === 'SELLER' ? 'seller' : 'delivery boy'}) ·{' '}
                                    {reasonLabel(p.reason)}
                                </span>
                                <span className="flex items-center gap-2">
                                    <b className="text-rose-600">{money(p.amount)}</b>
                                    <Badge variant={p.status === 'APPLIED' ? 'error' : 'gray'}>{p.status}</Badge>
                                </span>
                            </li>
                        ))}
                    </ul>
                </Block>
            )}

            {apply && (
                <ApplyPenaltyModal
                    preset={apply}
                    onClose={() => setApply(null)}
                    onApplied={() => {
                        setApply(null);
                        load();
                    }}
                />
            )}
        </Card>
    );
};

export default OrderEvidencePanel;
