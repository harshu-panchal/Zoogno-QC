import React, { useState, useEffect } from 'react';
import Card from '@shared/components/ui/Card';
import {
    Plus,
    Edit2,
    Trash2,
    Search,
    AlertCircle,
    Check,
    X,
    Activity,
    Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@shared/components/ui/Toast';
import { adminApi } from '../services/api';

const SurgeCharges = () => {
    const { showToast } = useToast();
    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRule, setEditingRule] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    const initialFormState = {
        name: '',
        ruleType: 'Peak Hours',
        isActive: true,
        calculationType: 'Fixed',
        value: 0,
        applyTo: 'All',
        priority: 0,
        cities: '',
        categories: '',
        sellers: ''
    };
    
    const [formData, setFormData] = useState(initialFormState);

    const fetchRules = async () => {
        try {
            setLoading(true);
            const res = await adminApi.getAllSurgeChargeRules();
            setRules(res.data?.data || res.data || []);
        } catch (error) {
            console.error('Failed to fetch surge charge rules:', error);
            showToast('Failed to load surge charge rules', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRules();
    }, []);

    const filteredRules = rules.filter(r => 
        r.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.ruleType?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleOpenModal = (rule = null) => {
        if (rule) {
            setEditingRule(rule);
            setFormData({
                ...rule,
                cities: rule.cities?.join(', ') || '',
                categories: rule.categories?.join(', ') || '',
                sellers: rule.sellers?.join(', ') || ''
            });
        } else {
            setEditingRule(null);
            setFormData(initialFormState);
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingRule(null);
        setFormData(initialFormState);
    };

    const handleSave = async () => {
        if (!formData.name || !formData.value) {
            return showToast('Please fill all required fields', 'error');
        }

        const payload = {
            ...formData,
            cities: formData.applyTo === 'City' ? formData.cities.split(',').map(s => s.trim()).filter(Boolean) : [],
            categories: formData.applyTo === 'Category' ? formData.categories.split(',').map(s => s.trim()).filter(Boolean) : [],
            sellers: formData.applyTo === 'Seller' ? formData.sellers.split(',').map(s => s.trim()).filter(Boolean) : [],
        };

        try {
            setIsSaving(true);
            if (editingRule) {
                await adminApi.updateSurgeChargeRule(editingRule._id, payload);
                showToast('Rule updated successfully', 'success');
            } else {
                await adminApi.createSurgeChargeRule(payload);
                showToast('Rule created successfully', 'success');
            }
            fetchRules();
            handleCloseModal();
        } catch (error) {
            console.error('Save failed:', error);
            showToast(error.response?.data?.message || 'Failed to save rule', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this rule?')) {
            try {
                await adminApi.deleteSurgeChargeRule(id);
                showToast('Rule deleted successfully', 'success');
                fetchRules();
            } catch (error) {
                console.error('Delete failed:', error);
                showToast('Failed to delete rule', 'error');
            }
        }
    };

    const handleToggleStatus = async (rule) => {
        try {
            await adminApi.updateSurgeChargeRule(rule._id, { isActive: !rule.isActive });
            showToast(`Rule ${!rule.isActive ? 'activated' : 'deactivated'}`, 'success');
            fetchRules();
        } catch (error) {
            console.error('Status toggle failed:', error);
            showToast('Failed to update status', 'error');
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-8">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-1">
                <div>
                    <h1 className="admin-h1 flex items-center gap-3">
                        Surge Charges
                        <div className="p-2 bg-rose-100 rounded-xl">
                            <Activity className="h-5 w-5 text-rose-600" />
                        </div>
                    </h1>
                    <p className="admin-description mt-1">Configure dynamic pricing rules for peak hours, weather, and high demand.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => handleOpenModal()}
                        className="flex items-center gap-2 px-6 py-3 bg-black text-primary-foreground rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-brand-100 active:scale-95 hover:bg-brand-700"
                    >
                        <Plus className="h-4 w-4" />
                        New Rule
                    </button>
                </div>
            </div>

            <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-[32px] overflow-hidden">
                <div className="p-6 border-b border-slate-50 flex items-center justify-between gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search rules..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-sm outline-none focus:ring-2 focus:ring-rose-500/10 transition-all"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50">
                                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">Rule Name</th>
                                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">Type</th>
                                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">Apply To</th>
                                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">Amount</th>
                                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">Priority</th>
                                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">Status</th>
                                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-8 text-center text-slate-500">
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="h-4 w-4 border-2 border-slate-200 border-t-rose-500 rounded-full animate-spin" />
                                            Loading rules...
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredRules.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-8 text-center text-slate-500">
                                        No surge rules found
                                    </td>
                                </tr>
                            ) : (
                                filteredRules.map(rule => (
                                    <tr key={rule._id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4 font-bold text-slate-800">{rule.name}</td>
                                        <td className="px-6 py-4">
                                            <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-wider">
                                                {rule.ruleType}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="px-3 py-1 bg-brand-50 text-brand-600 rounded-lg text-[10px] font-black uppercase tracking-wider">
                                                {rule.applyTo}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-black text-rose-500">
                                            {rule.calculationType === 'Fixed' ? `₹${rule.value}` : `${rule.value}%`}
                                        </td>
                                        <td className="px-6 py-4 font-bold text-slate-600">{rule.priority}</td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => handleToggleStatus(rule)}
                                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${rule.isActive ? 'bg-emerald-500' : 'bg-slate-200'}`}
                                            >
                                                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${rule.isActive ? 'translate-x-5' : 'translate-x-1'}`} />
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => handleOpenModal(rule)}
                                                className="p-2 text-slate-400 hover:text-brand-500 hover:bg-brand-50 rounded-xl transition-all"
                                            >
                                                <Edit2 className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(rule._id)}
                                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-[32px] w-full max-w-2xl overflow-hidden shadow-2xl"
                        >
                            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                                <h2 className="text-lg font-black text-slate-800">
                                    {editingRule ? 'Edit Surge Rule' : 'Create Surge Rule'}
                                </h2>
                                <button onClick={handleCloseModal} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                                    <X className="h-5 w-5 text-slate-500" />
                                </button>
                            </div>
                            
                            <div className="p-6 overflow-y-auto max-h-[70vh] space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rule Name *</label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={e => setFormData({...formData, name: e.target.value})}
                                            placeholder="e.g. Heavy Rain Surcharge"
                                            className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-rose-500/20"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rule Type *</label>
                                        <select
                                            value={formData.ruleType}
                                            onChange={e => setFormData({...formData, ruleType: e.target.value})}
                                            className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-rose-500/20"
                                        >
                                            <option value="Peak Hours">Peak Hours</option>
                                            <option value="Rain">Rain</option>
                                            <option value="Festivals">Festivals</option>
                                            <option value="Night">Night</option>
                                            <option value="High Demand">High Demand</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Calculation Type *</label>
                                        <select
                                            value={formData.calculationType}
                                            onChange={e => setFormData({...formData, calculationType: e.target.value})}
                                            className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-rose-500/20"
                                        >
                                            <option value="Fixed">Fixed Amount (₹)</option>
                                            <option value="Percentage">Percentage (%)</option>
                                        </select>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Value *</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={formData.value}
                                            onChange={e => setFormData({...formData, value: Number(e.target.value)})}
                                            className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-rose-500/20"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Priority</label>
                                        <input
                                            type="number"
                                            value={formData.priority}
                                            onChange={e => setFormData({...formData, priority: Number(e.target.value)})}
                                            className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-rose-500/20"
                                        />
                                        <p className="text-[10px] font-bold text-slate-400">Higher number = higher priority.</p>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Apply To *</label>
                                        <select
                                            value={formData.applyTo}
                                            onChange={e => setFormData({...formData, applyTo: e.target.value})}
                                            className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-rose-500/20"
                                        >
                                            <option value="All">All Orders</option>
                                            <option value="Category">Specific Categories</option>
                                            <option value="Seller">Specific Sellers</option>
                                            <option value="City">Specific Cities</option>
                                        </select>
                                    </div>
                                </div>

                                {formData.applyTo === 'Category' && (
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Category IDs (Comma separated)</label>
                                        <input
                                            type="text"
                                            value={formData.categories}
                                            onChange={e => setFormData({...formData, categories: e.target.value})}
                                            className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-rose-500/20"
                                            placeholder="e.g. 64b8d1... , 64c9f2..."
                                        />
                                    </div>
                                )}
                                {formData.applyTo === 'Seller' && (
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Seller IDs (Comma separated)</label>
                                        <input
                                            type="text"
                                            value={formData.sellers}
                                            onChange={e => setFormData({...formData, sellers: e.target.value})}
                                            className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-rose-500/20"
                                            placeholder="e.g. 64b8d1... , 64c9f2..."
                                        />
                                    </div>
                                )}
                                {formData.applyTo === 'City' && (
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cities (Comma separated)</label>
                                        <input
                                            type="text"
                                            value={formData.cities}
                                            onChange={e => setFormData({...formData, cities: e.target.value})}
                                            className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-rose-500/20"
                                            placeholder="e.g. Mumbai, Delhi"
                                        />
                                    </div>
                                )}
                                
                                <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                                    <button
                                        onClick={() => setFormData({...formData, isActive: !formData.isActive})}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.isActive ? 'bg-emerald-500' : 'bg-slate-200'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                    <span className="text-sm font-bold text-slate-700">Active</span>
                                </div>
                            </div>
                            
                            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                                <button
                                    onClick={handleCloseModal}
                                    className="px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-100 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="flex items-center gap-2 px-6 py-3 bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50"
                                >
                                    {isSaving ? (
                                        <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <Save className="h-4 w-4" />
                                    )}
                                    Save Rule
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default SurgeCharges;
