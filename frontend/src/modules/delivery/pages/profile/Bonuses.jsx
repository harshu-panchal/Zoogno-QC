import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Gift, AlertCircle, History } from "lucide-react";
import { motion } from "framer-motion";
import { deliveryApi } from "../../services/deliveryApi";
import { cn } from "@/lib/utils";

const Bonuses = () => {
    const navigate = useNavigate();
    const [bonuses, setBonuses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchBonuses();
    }, []);

    const fetchBonuses = async () => {
        try {
            setLoading(true);
            const res = await deliveryApi.getMyBonuses();
            if (res.data.success) {
                setBonuses(res.data.data);
            }
        } catch (err) {
            setError(err?.response?.data?.message || "Failed to load bonuses");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-gray-50/50 min-h-screen pb-24">
            {/* Header */}
            <div className="bg-white pt-[calc(env(safe-area-inset-top,0px)+24px)] pb-6 px-6 rounded-b-[2.5rem] relative shadow-sm border-b border-gray-100 sticky top-0 z-20">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <ArrowLeft className="h-6 w-6 text-gray-700" />
                    </button>
                    <div>
                        <h1 className="text-gray-900 text-xl font-bold">Incentives & Bonuses</h1>
                        <p className="text-xs text-gray-500 font-medium tracking-wide">View your earned rewards</p>
                    </div>
                </div>
            </div>

            <div className="p-6 max-w-lg mx-auto space-y-4 mt-2">
                {/* Total Stats */}
                {!loading && bonuses.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white shadow-lg shadow-emerald-500/20 mb-6"
                    >
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-emerald-100 text-xs font-bold uppercase tracking-wider mb-1">Total Earned</p>
                                <h2 className="text-3xl font-black">₹{bonuses.reduce((acc, curr) => acc + curr.amount, 0)}</h2>
                            </div>
                            <div className="h-12 w-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                                <Gift className="h-6 w-6 text-white" />
                            </div>
                        </div>
                    </motion.div>
                )}

                {loading ? (
                    <div className="py-12 text-center text-gray-400 font-medium animate-pulse">Loading your bonuses...</div>
                ) : error ? (
                    <div className="p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-2 text-sm font-medium">
                        <AlertCircle className="h-4 w-4" /> {error}
                    </div>
                ) : bonuses.length === 0 ? (
                    <div className="py-16 text-center flex flex-col items-center justify-center bg-white rounded-2xl border border-dashed border-gray-200">
                        <div className="h-16 w-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                            <History className="h-8 w-8 text-gray-300" />
                        </div>
                        <h3 className="text-gray-900 font-bold mb-1">No Bonuses Yet</h3>
                        <p className="text-sm text-gray-500 font-medium max-w-[200px]">Keep up the great work! Your future bonuses will appear here.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-2">Transaction History</p>
                        {bonuses.map((bonus, index) => (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                                key={bonus._id}
                                className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                                        <Gift className="h-5 w-5 text-emerald-600" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-900 text-sm">{bonus.reason}</h4>
                                        <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                                            {new Date(bonus.createdAt).toLocaleDateString('en-IN', {
                                                day: '2-digit', month: 'short', year: 'numeric',
                                                hour: '2-digit', minute: '2-digit'
                                            })}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="font-black text-emerald-600">₹{bonus.amount}</span>
                                    <p className="text-[10px] text-gray-400 font-medium mt-0.5">Ref: {bonus.paymentReference}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Bonuses;
