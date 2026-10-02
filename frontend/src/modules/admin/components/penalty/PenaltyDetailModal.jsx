import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ExternalLink } from 'lucide-react';
import Modal from '@shared/components/ui/Modal';
import Badge from '@shared/components/ui/Badge';
import { adminApi } from '../../services/adminApi';
import { EVIDENCE_KIND_LABEL, fmtDateTime, money, reasonLabel } from './penaltyUtils';

const Row = ({ label, children }) => (
    <div className="flex justify-between gap-4 py-1.5 border-b border-slate-50 text-sm">
        <span className="text-slate-500">{label}</span>
        <span className="font-semibold text-slate-900 text-right">{children}</span>
    </div>
);

const PenaltyDetailModal = ({ penaltyId, onClose, onChanged }) => {
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [revoking, setRevoking] = useState(false);
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await adminApi.getPenalty(penaltyId);
            setData(res.data?.result || null);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to load penalty');
            onClose();
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [penaltyId]);

    useEffect(() => {
        load();
    }, [load]);

    const p = data?.penalty;

    const revoke = async () => {
        if (!reason.trim()) {
            toast.error('Please enter a reason for revoking');
            return;
        }
        setSubmitting(true);
        try {
            await adminApi.revokePenalty(penaltyId, { reason });
            toast.success('Penalty revoked and credited back');
            setRevoking(false);
            setReason('');
            await load();
            onChanged?.();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Could not revoke');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal isOpen onClose={onClose} title={p ? `Penalty ${p.penaltyId}` : 'Penalty'} size="lg">
            {loading || !p ? (
                <div className="py-14 text-center text-slate-400">Loading...</div>
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Badge variant={p.status === 'APPLIED' ? 'error' : 'gray'}>{p.status}</Badge>
                        <button
                            onClick={() => navigate(`/admin/orders/view/${p.order}`)}
                            className="ml-auto text-xs font-bold text-brand-600 flex items-center gap-1 hover:underline"
                        >
                            Open order #{p.orderId} <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                    </div>

                    <div>
                        <Row label={p.beneficiaryType === 'SELLER' ? 'Seller' : 'Delivery boy'}>
                            {p.beneficiaryName} {p.beneficiaryPhone ? `· ${p.beneficiaryPhone}` : ''}
                        </Row>
                        <Row label="Order">#{p.orderId}</Row>
                        <Row label="Product">{p.productName || '—'}</Row>
                        <Row label="Penalty amount">{money(p.amount)}</Row>
                        <Row label="Reason">{reasonLabel(p.reason)}</Row>
                        <Row label="Applied by">
                            {p.appliedByName} · {fmtDateTime(p.createdAt)}
                        </Row>
                        <Row label="Related issue">
                            {p.relatedTicketSubject ? `Ticket: ${p.relatedTicketSubject}` : p.relatedReturnStatus ? `Return (${p.relatedReturnStatus}): ${p.relatedReturnReason || ''}` : '—'}
                        </Row>
                        <Row label="Earnings at the time">{money(p.earnedAtApplication)}</Row>
                        <Row label="Remaining payable before → after">
                            {money(p.remainingBefore)} → {money(p.remainingAfter)}
                        </Row>
                        <Row label="Amount deducted">{p.status === 'APPLIED' ? money(p.amountDeducted) : '₹0 (revoked)'}</Row>
                        <Row label="Wallet transaction">{p.walletTransactionRef || '—'}</Row>
                    </div>

                    {p.notes && (
                        <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm">
                            <div className="text-[10px] font-black uppercase text-slate-400 mb-1">Admin notes</div>
                            {p.notes}
                        </div>
                    )}

                    <div>
                        <div className="text-[10px] font-black uppercase text-slate-400 mb-1">Evidence ({p.evidence?.length || 0})</div>
                        {p.evidence?.length ? (
                            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                                {p.evidence.map((e) => (
                                    <a key={e.url} href={e.url} target="_blank" rel="noopener noreferrer" className="relative block">
                                        <img src={e.url} alt={e.kind} className="h-20 w-full object-cover rounded-lg border border-slate-200" />
                                        <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[8px] text-center rounded-b-lg px-0.5">
                                            {EVIDENCE_KIND_LABEL[e.kind] || e.kind}
                                        </span>
                                    </a>
                                ))}
                            </div>
                        ) : (
                            <div className="text-xs text-slate-400">No evidence was attached.</div>
                        )}
                    </div>

                    {p.status === 'REVOKED' && (
                        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm">
                            Revoked by <b>{p.revokedByName}</b> · {fmtDateTime(p.revokedAt)}
                            <div className="text-xs text-slate-500 mt-1">Reason: {p.revokeReason}</div>
                        </div>
                    )}

                    <div>
                        <div className="text-[10px] font-black uppercase text-slate-400 mb-1">Audit trail</div>
                        <ul className="space-y-1">
                            {(p.history || []).map((h, i) => (
                                <li key={i} className="text-xs text-slate-600">
                                    {fmtDateTime(h.at)} · <b>{h.action}</b> by {h.byName || 'Admin'}
                                    {h.note ? ` — ${h.note}` : ''}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {p.status === 'APPLIED' &&
                        (revoking ? (
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                                <div className="font-bold text-sm">Revoke this penalty</div>
                                <textarea
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    rows={2}
                                    maxLength={500}
                                    placeholder="Why is this penalty being revoked?"
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={revoke}
                                        disabled={submitting}
                                        className="px-4 py-2 rounded-lg bg-slate-900 text-white font-bold text-sm disabled:opacity-50"
                                    >
                                        {submitting ? 'Revoking...' : 'Confirm revoke'}
                                    </button>
                                    <button
                                        onClick={() => setRevoking(false)}
                                        className="px-4 py-2 rounded-lg bg-white border border-slate-300 font-bold text-sm"
                                    >
                                        Back
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => setRevoking(true)}
                                className="px-4 py-2 rounded-lg bg-white border border-slate-300 font-bold text-sm"
                            >
                                Revoke penalty
                            </button>
                        ))}
                </div>
            )}
        </Modal>
    );
};

export default PenaltyDetailModal;
