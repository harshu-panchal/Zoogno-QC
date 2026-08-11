import React, { useState, useEffect } from "react";
import { deliveryBonusApi } from "../services/deliveryBonusApi";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Search, Plus, History, X, Check, Banknote, User, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";

const DeliveryBonus = () => {
    const [partners, setPartners] = useState([]);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    
    // Modal states
    const [selectedPartner, setSelectedPartner] = useState(null);
    const [amount, setAmount] = useState("");
    const [reason, setReason] = useState("Performance Bonus");
    const [paymentMethod, setPaymentMethod] = useState("UPI");
    const [reference, setReference] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [partnersRes, historyRes] = await Promise.all([
                deliveryBonusApi.getPartners(),
                deliveryBonusApi.getHistory()
            ]);
            
            if (partnersRes.data.success) {
                setPartners(partnersRes.data.data);
            }
            if (historyRes.data.success) {
                setHistory(historyRes.data.data);
            }
        } catch (error) {
            toast.error("Failed to fetch data");
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleGrantBonus = async (e) => {
        e.preventDefault();
        if (!selectedPartner || !amount || !reference) {
            toast.error("Please fill all required fields");
            return;
        }

        try {
            setSubmitting(true);
            const res = await deliveryBonusApi.grantBonus({
                deliveryId: selectedPartner.id,
                amount: Number(amount),
                reason,
                paymentMethod,
                paymentReference: reference
            });
            
            if (res.data.success) {
                toast.success("Bonus granted successfully");
                setSelectedPartner(null);
                setAmount("");
                setReference("");
                fetchData(); // refresh history
            }
        } catch (error) {
            toast.error(error?.response?.data?.message || "Failed to grant bonus");
        } finally {
            setSubmitting(false);
        }
    };

    const filteredPartners = partners.filter(p => 
        p.name?.toLowerCase().includes(search.toLowerCase()) ||
        p.phone?.includes(search)
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">Delivery Bonuses</h1>
                    <p className="text-sm text-slate-500 font-medium">Manage incentives and view bonus history</p>
                </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                {/* Partners List */}
                <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-slate-100">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search driver by name or phone..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                            />
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-auto max-h-[600px] p-2 space-y-2">
                        {loading ? (
                            <div className="p-8 text-center text-slate-400 animate-pulse">Loading partners...</div>
                        ) : filteredPartners.length === 0 ? (
                            <div className="p-8 text-center text-slate-500">No partners found.</div>
                        ) : (
                            filteredPartners.map(partner => (
                                <motion.div 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    key={partner.id}
                                    className="group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all cursor-pointer"
                                    onClick={() => setSelectedPartner(partner)}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-lg shrink-0">
                                            {partner.profileImage ? (
                                                <img src={partner.profileImage} alt={partner.name} className="h-full w-full object-cover rounded-xl" />
                                            ) : (
                                                partner.name?.charAt(0).toUpperCase()
                                            )}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-900">{partner.name}</h3>
                                            <p className="text-xs text-slate-500 font-medium">{partner.phone}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={cn(
                                                    "text-[10px] px-2 py-0.5 rounded-full font-bold",
                                                    partner.isOnline ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
                                                )}>
                                                    {partner.isOnline ? "Online" : "Offline"}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-xs font-bold transition-colors">
                                            <Plus className="h-4 w-4" /> Give Bonus
                                        </button>
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </div>
                </div>

                {/* History */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <History className="h-4 w-4 text-primary" />
                            Recent Bonuses
                        </h3>
                    </div>
                    <div className="p-4 space-y-4 overflow-auto max-h-[600px]">
                        {loading ? (
                            <div className="text-center text-slate-400 py-4 animate-pulse text-sm">Loading history...</div>
                        ) : history.length === 0 ? (
                            <div className="text-center text-slate-500 py-8 text-sm">No bonuses granted yet.</div>
                        ) : (
                            history.map(item => (
                                <div key={item._id} className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <span className="text-sm font-bold text-slate-900">{item.deliveryId?.name || "Unknown"}</span>
                                            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{item.reason}</p>
                                        </div>
                                        <span className="text-sm font-black text-emerald-600">₹{item.amount}</span>
                                    </div>
                                    <div className="pt-2 border-t border-slate-200/60 flex justify-between items-center text-[10px] text-slate-500 font-medium">
                                        <span>Ref: {item.paymentReference}</span>
                                        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Grant Modal */}
            <AnimatePresence>
                {selectedPartner && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden"
                        >
                            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                                <div>
                                    <h3 className="text-lg font-black text-slate-900">Grant Bonus</h3>
                                    <p className="text-xs font-medium text-slate-500">to {selectedPartner.name}</p>
                                </div>
                                <button onClick={() => setSelectedPartner(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                            
                            <form onSubmit={handleGrantBonus} className="p-6 space-y-6">
                                {/* Bank Details Card */}
                                <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 space-y-3">
                                    <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
                                        <CreditCard className="h-3.5 w-3.5" /> Banking Info
                                    </h4>
                                    
                                    {selectedPartner.upiId ? (
                                        <div className="bg-white p-2.5 rounded-lg border border-blue-100/50 shadow-sm flex justify-between items-center">
                                            <span className="text-xs text-slate-500 font-medium">UPI ID</span>
                                            <span className="text-sm font-bold text-slate-800">{selectedPartner.upiId}</span>
                                        </div>
                                    ) : null}
                                    
                                    <div className="bg-white p-3 rounded-lg border border-blue-100/50 shadow-sm space-y-2">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-slate-500 font-medium">Account Name</span>
                                            <span className="font-bold text-slate-800">{selectedPartner.accountHolder || "N/A"}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-slate-500 font-medium">A/C Number</span>
                                            <span className="font-bold text-slate-800 tracking-wider">{selectedPartner.accountNumber || "N/A"}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-slate-500 font-medium">IFSC</span>
                                            <span className="font-bold text-slate-800">{selectedPartner.ifsc || "N/A"}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-slate-700">Amount (₹)</label>
                                        <input
                                            type="number"
                                            value={amount}
                                            onChange={e => setAmount(e.target.value)}
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bold"
                                            placeholder="Enter amount"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-slate-700">Reason</label>
                                        <input
                                            type="text"
                                            list="reason-options"
                                            value={reason}
                                            onChange={e => setReason(e.target.value)}
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm font-medium"
                                            placeholder="Select or type reason"
                                            required
                                        />
                                        <datalist id="reason-options">
                                            <option value="Performance Bonus" />
                                            <option value="Festival Incentive" />
                                            <option value="Joining Bonus" />
                                            <option value="Target Achievement" />
                                            <option value="Other" />
                                        </datalist>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-slate-700">Payment Method</label>
                                        <input
                                            type="text"
                                            list="payment-method-options"
                                            value={paymentMethod}
                                            onChange={e => setPaymentMethod(e.target.value)}
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm font-medium"
                                            placeholder="Select or type method"
                                            required
                                        />
                                        <datalist id="payment-method-options">
                                            <option value="UPI" />
                                            <option value="Bank Transfer" />
                                            <option value="Cash" />
                                            <option value="GPay" />
                                            <option value="PhonePe" />
                                        </datalist>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-slate-700">Manual Payment Ref. / UTR</label>
                                        <input
                                            type="text"
                                            value={reference}
                                            onChange={e => setReference(e.target.value)}
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
                                            placeholder="e.g. UPI Ref 123456789"
                                            required
                                        />
                                    </div>
                                </div>
                                
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="w-full py-3.5 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all active:scale-[0.98] disabled:opacity-70"
                                >
                                    {submitting ? "Processing..." : (
                                        <>
                                            <Check className="h-5 w-5" /> Confirm Payment Record
                                        </>
                                    )}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default DeliveryBonus;
