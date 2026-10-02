import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gavel, Plus } from 'lucide-react';
import PenaltyHistoryTable from '../components/penalty/PenaltyHistoryTable';
import ApplyPenaltyModal from '../components/penalty/ApplyPenaltyModal';

const PenaltyManagement = () => {
    const navigate = useNavigate();
    const [applyOpen, setApplyOpen] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    return (
        <div className="ds-section-spacing animate-in fade-in duration-700">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="ds-h1 flex items-center gap-3 text-rose-600">
                        <Gavel className="h-8 w-8" />
                        Penalty Management
                    </h1>
                    <p className="ds-description mt-1">
                        Penalties for sellers and delivery partners. Investigate the order first (open an order → Product Condition
                        &amp; Evidence); nothing is penalised automatically. Every penalty is permanent in history — a mistaken one
                        is revoked, never deleted.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => navigate('/admin/withdrawals')}
                        className="px-4 py-2 bg-white rounded-lg shadow-sm border font-semibold text-sm"
                    >
                        Settlements
                    </button>
                    <button
                        onClick={() => setApplyOpen(true)}
                        className="px-4 py-2 bg-rose-600 text-white rounded-lg shadow-sm font-bold text-sm flex items-center gap-2"
                    >
                        <Plus className="h-4 w-4" /> Apply Penalty
                    </button>
                </div>
            </div>

            <h2 className="text-sm font-black uppercase tracking-wide text-slate-500 mb-3">Penalty History</h2>
            <PenaltyHistoryTable refreshKey={refreshKey} />

            {applyOpen && (
                <ApplyPenaltyModal
                    onClose={() => setApplyOpen(false)}
                    onApplied={() => {
                        setApplyOpen(false);
                        setRefreshKey((k) => k + 1);
                    }}
                />
            )}
        </div>
    );
};

export default PenaltyManagement;
