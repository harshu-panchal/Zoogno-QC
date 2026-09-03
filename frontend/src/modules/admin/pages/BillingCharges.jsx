// Premium Billing & Financial Configuration System
import React, { useState, useEffect } from 'react';
import Card from '@shared/components/ui/Card';
import {
    RotateCcw,
    Save,
    Info,
    Truck,
    Settings,
    Zap,
    MapPin,
    History,
    Wallet
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@shared/components/ui/Toast';
import { adminApi } from '../services/adminApi';

const BillingCharges = () => {
    const { showToast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [deliveryMode, setDeliveryMode] = useState('distance'); // 'fixed' or 'distance'

    const [config, setConfig] = useState({
        freeDeliveryThreshold: 0,
        baseCharge: 30,
        baseDistance: 0.5,
        extraPerKm: 10,
        fixedCharge: 30,
        riderEarningType: 'fixed',
        riderFixedAmount: 20,
        riderBaseDistance: 4,
        riderBaseEarning: 25,
        riderExtraPerKm: 5,
        handlingFeeStrategy: "highest_category_fee",
        codEnabled: true,
        onlineEnabled: true,
        useGlobalBilling: false,
        globalCommissionType: "percentage",
        globalCommissionValue: 0,
        globalHandlingFeeType: "none",
        globalHandlingFeeValue: 0,
        globalPlatformFeeType: "none",
        globalPlatformFeeValue: 0,
    });

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const [platformRes, deliveryRes] = await Promise.all([
                    adminApi.getPlatformSettings(),
                    adminApi.getDeliveryFinanceSettings(),
                ]);

                if (platformRes.data?.success && platformRes.data.result) {
                    const p = platformRes.data.result;
                    setConfig((prev) => ({
                        ...prev,
                        useGlobalBilling: p.useGlobalBilling ?? false,
                        globalCommissionType: p.globalCommissionType ?? 'percentage',
                        globalCommissionValue: p.globalCommissionValue ?? 0,
                        globalHandlingFeeType: p.globalHandlingFeeType ?? 'none',
                        globalHandlingFeeValue: p.globalHandlingFeeValue ?? 0,
                        globalPlatformFeeType: p.globalPlatformFeeType ?? 'none',
                        globalPlatformFeeValue: p.globalPlatformFeeValue ?? 0,
                    }));
                }

                if (deliveryRes.data?.success && deliveryRes.data.result) {
                    const s = deliveryRes.data.result;
                    setDeliveryMode(s.deliveryPricingMode === 'fixed_price' ? 'fixed' : 'distance');
                    setConfig((prev) => ({
                        ...prev,
                        baseCharge: s.customerBaseDeliveryFee ?? s.baseDeliveryCharge ?? prev.baseCharge,
                        baseDistance: s.baseDistanceCapacityKm ?? prev.baseDistance,
                        extraPerKm: s.incrementalKmSurcharge ?? prev.extraPerKm,
                        fixedCharge: s.fixedDeliveryFee ?? s.customerBaseDeliveryFee ?? prev.fixedCharge,
                        riderEarningType: s.riderEarningType ?? prev.riderEarningType,
                        riderFixedAmount: s.riderFixedAmount ?? prev.riderFixedAmount,
                        riderBaseDistance: s.riderBaseDistance ?? prev.riderBaseDistance,
                        riderBaseEarning: s.riderBaseEarning ?? prev.riderBaseEarning,
                        riderExtraPerKm: s.riderExtraPerKm ?? prev.riderExtraPerKm,
                        handlingFeeStrategy: s.handlingFeeStrategy ?? prev.handlingFeeStrategy,
                        codEnabled: s.codEnabled ?? prev.codEnabled,
                        onlineEnabled: s.onlineEnabled ?? prev.onlineEnabled,
                        freeDeliveryThreshold: s.freeDeliveryThreshold ?? prev.freeDeliveryThreshold,
                    }));
                }
            } catch (error) {
                console.error('Failed to load settings', error);
            }
        };
        fetchSettings();
    }, []);

    const handleSave = async () => {
        try {
            setIsSaving(true);
            await Promise.all([
                adminApi.updatePlatformSettings({
                    useGlobalBilling: config.useGlobalBilling,
                    globalCommissionType: config.globalCommissionType,
                    globalCommissionValue: config.globalCommissionValue,
                    globalHandlingFeeType: config.globalHandlingFeeType,
                    globalHandlingFeeValue: config.globalHandlingFeeValue,
                    globalPlatformFeeType: config.globalPlatformFeeType,
                    globalPlatformFeeValue: config.globalPlatformFeeValue,
                }),
                adminApi.updateDeliveryFinanceSettings({
                    deliveryPricingMode: deliveryMode === 'fixed' ? 'fixed_price' : 'distance_based',
                    customerBaseDeliveryFee: config.baseCharge,
                    baseDeliveryCharge: config.baseCharge,
                    baseDistanceCapacityKm: config.baseDistance,
                    incrementalKmSurcharge: config.extraPerKm,
                    fixedDeliveryFee: config.fixedCharge,
                    riderEarningType: config.riderEarningType,
                    riderFixedAmount: config.riderFixedAmount,
                    riderBaseDistance: config.riderBaseDistance,
                    riderBaseEarning: config.riderBaseEarning,
                    riderExtraPerKm: config.riderExtraPerKm,
                    handlingFeeStrategy: config.handlingFeeStrategy,
                    codEnabled: config.codEnabled,
                    onlineEnabled: config.onlineEnabled,
                    freeDeliveryThreshold: config.freeDeliveryThreshold,
                }),
            ]);

            showToast('Delivery finance settings updated', 'success');
        } catch (error) {
            console.error('Failed to update platform settings', error);
            showToast('Failed to update fees settings', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleInputChange = (field, value) => {
        setConfig(prev => ({ ...prev, [field]: parseFloat(value) || 0 }));
    };

    const setConfigValue = (field, value) => {
        setConfig(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-8">
            {/* Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-1">
                <div>
                    <h1 className="admin-h1 flex items-center gap-3">
                        Fees & Charges
                        <div className="p-2 bg-red-100 rounded-xl">
                            <RotateCcw className="h-5 w-5 text-red-600" />
                        </div>
                    </h1>
                    <p className="admin-description mt-1">Set up delivery fees, platform charges, and free delivery limits.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 px-5 py-3 bg-white ring-1 ring-slate-200 text-slate-700 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm">
                        <History className="h-4 w-4 text-indigo-500" />
                        AUDIT LOGS
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className={cn(
                            "flex items-center gap-2 px-6 py-3 bg-black  text-primary-foreground rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-brand-100 active:scale-95",
                            isSaving ? "opacity-70 cursor-wait" : "hover:bg-brand-700"
                        )}
                    >
                        {isSaving ? (
                            <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Save className="h-4 w-4" />
                        )}
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>


            <div className="max-w-4xl mx-auto text-left">
                {/* Main Configuration Core */}
                <div className="space-y-4">
                    {/* Global Billing & Commission Overrides */}
                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-[32px] overflow-hidden">
                        <div className="p-4 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between">
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                <Settings className="h-4 w-4 text-brand-500" />
                                Global Billing Override
                            </h3>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={config.useGlobalBilling}
                                    onChange={(e) => setConfigValue('useGlobalBilling', e.target.checked)}
                                />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-900"></div>
                            </label>
                        </div>
                        <div className="p-4 space-y-4">
                            <p className="text-xs font-bold text-slate-500 leading-relaxed">
                                When enabled, the global platform commission and handling fee defined below will override any category or subcategory-level rates across all products.
                            </p>

                            {config.useGlobalBilling && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-6 border-t border-dashed border-slate-100">
                                    {/* Global Commission Section */}
                                    <div className="space-y-4">
                                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">Global Platform Commission</h4>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Commission Type</label>
                                            <select
                                                value={config.globalCommissionType}
                                                onChange={(e) => setConfigValue('globalCommissionType', e.target.value)}
                                                className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-slate-900/10 transition-all cursor-pointer"
                                            >
                                                <option value="percentage">Percentage (%)</option>
                                                <option value="fixed">Fixed Flat Fee (₹)</option>
                                            </select>
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                Commission Value ({config.globalCommissionType === 'percentage' ? '%' : '₹'})
                                            </label>
                                            <input
                                                type="number"
                                                value={config.globalCommissionValue}
                                                onChange={(e) => handleInputChange('globalCommissionValue', e.target.value)}
                                                className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-slate-900/10 transition-all"
                                            />
                                        </div>
                                    </div>

                                    {/* Global Handling Fee Section */}
                                    <div className="space-y-4">
                                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">Global Handling Fee</h4>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Handling Fee Type</label>
                                            <select
                                                value={config.globalHandlingFeeType}
                                                onChange={(e) => setConfigValue('globalHandlingFeeType', e.target.value)}
                                                className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-slate-900/10 transition-all cursor-pointer"
                                            >
                                                <option value="none">None</option>
                                                <option value="fixed">Fixed Flat Fee (₹)</option>
                                                <option value="percentage">Percentage (%)</option>
                                            </select>
                                        </div>
                                        {config.globalHandlingFeeType !== 'none' && (
                                            <div className="space-y-3">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                    Handling Fee Value ({config.globalHandlingFeeType === 'percentage' ? '%' : '₹'})
                                                </label>
                                                <input
                                                    type="number"
                                                    value={config.globalHandlingFeeValue}
                                                    onChange={(e) => handleInputChange('globalHandlingFeeValue', e.target.value)}
                                                    className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-slate-900/10 transition-all"
                                                />
                                            </div>
                                        )}
                                    </div>
                                    
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* Dedicated Platform Fee Section */}
                    <Card className="border-none shadow-xl ring-1 ring-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-[32px] overflow-hidden">
                        <div className="p-4 border-b border-blue-100/50 bg-blue-100/30 flex items-center justify-between">
                            <h3 className="text-sm font-black text-blue-900 uppercase tracking-widest flex items-center gap-3">
                                <Wallet className="h-4 w-4 text-blue-600" />
                                Customer Platform Fee
                            </h3>
                        </div>
                        <div className="p-5 space-y-5">
                            <p className="text-xs font-bold text-blue-800/70 leading-relaxed">
                                This fee is charged directly to the customer on every checkout. It contributes directly to your total platform earnings.
                            </p>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-blue-800/60 uppercase tracking-widest">Fee Type</label>
                                    <select
                                        value={config.globalPlatformFeeType}
                                        onChange={(e) => setConfigValue('globalPlatformFeeType', e.target.value)}
                                        className="w-full px-5 py-3 bg-white/60 backdrop-blur-sm border border-blue-100 rounded-2xl text-sm font-black text-blue-900 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer"
                                    >
                                        <option value="none">None (Disabled)</option>
                                        <option value="fixed">Fixed Flat Fee (₹)</option>
                                        <option value="percentage">Percentage of Cart (%)</option>
                                    </select>
                                </div>
                                
                                {config.globalPlatformFeeType !== 'none' && (
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-blue-800/60 uppercase tracking-widest">
                                            Fee Value ({config.globalPlatformFeeType === 'percentage' ? '%' : '₹'})
                                        </label>
                                        <input
                                            type="number"
                                            value={config.globalPlatformFeeValue}
                                            onChange={(e) => handleInputChange('globalPlatformFeeValue', e.target.value)}
                                            className="w-full px-5 py-3 bg-white/60 backdrop-blur-sm border border-blue-100 rounded-2xl text-sm font-black text-blue-900 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-blue-300"
                                            placeholder="Enter amount..."
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </Card>

                    {/* Free Delivery Settings */}
                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-[32px] overflow-hidden">
                        <div className="p-4 border-b border-slate-50 bg-slate-50/30">
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                <Zap className="h-4 w-4 text-amber-500" />
                                Free Delivery Setup
                            </h3>
                        </div>
                        <div className="p-4">
                            <div className="space-y-3 max-w-md">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    Free Delivery Minimum (₹)
                                </label>
                                <div className="relative group">
                                    <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-slate-300 group-focus-within:text-red-500 transition-colors">₹</span>
                                    <input
                                        type="number"
                                        value={config.freeDeliveryThreshold}
                                        onChange={(e) => handleInputChange('freeDeliveryThreshold', e.target.value)}
                                        className="w-full pl-10 pr-5 py-3 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-amber-500/10 transition-all"
                                    />
                                </div>
                                <p className="text-[10px] font-bold text-slate-400 italic">If a customer's total order value is greater than or equal to this amount, delivery fee will be zero across all products.</p>
                            </div>
                        </div>
                    </Card>

                    {/* Delivery Fee Settings */}
                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-[32px] overflow-hidden">
                        <div className="p-4 border-b border-slate-50 bg-slate-50/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                <Truck className="h-4 w-4 text-brand-500" />
                                Customer Delivery Charges
                            </h3>
                            <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
                                <button
                                    onClick={() => setDeliveryMode('fixed')}
                                    className={cn("px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all", deliveryMode === 'fixed' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400")}
                                >Fixed Price</button>
                                <button
                                    onClick={() => setDeliveryMode('distance')}
                                    className={cn("px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all", deliveryMode === 'distance' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400")}
                                >Distance Based</button>
                            </div>
                        </div>
                        <div className="p-4">
                            {deliveryMode === 'distance' ? (
                                <>
                                    <div className="bg-brand-50 border border-brand-100 rounded-2xl p-4 mb-8 flex gap-4">
                                        <MapPin className="h-5 w-5 text-brand-500 shrink-0 mt-0.5" />
                                        <div className="space-y-1">
                                            <p className="text-[11px] font-black text-brand-900 uppercase tracking-tight">Location Accuracy</p>
                                            <p className="text-[10px] font-bold text-brand-700 leading-relaxed italic">Requires Google Maps API. Without it, the system will use straight-line distance.</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base Delivery Charge (₹)</label>
                                            <input
                                                type="number"
                                                value={config.baseCharge}
                                                onChange={(e) => handleInputChange('baseCharge', e.target.value)}
                                                className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                            />
                                            <p className="text-[10px] font-bold text-slate-400 italic">Customer-facing minimum fee for first X kms.</p>
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base Distance Capacity (km)</label>
                                            <div className="relative group">
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={config.baseDistance}
                                                    onChange={(e) => handleInputChange('baseDistance', e.target.value)}
                                                    className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                                />
                                                <span className="absolute right-5 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300 uppercase">km</span>
                                            </div>
                                            <p className="text-[10px] font-bold text-slate-400 italic">Radius covered by the base charge.</p>
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Incremental Km Surcharge (₹)</label>
                                            <input
                                                type="number"
                                                value={config.extraPerKm}
                                                onChange={(e) => handleInputChange('extraPerKm', e.target.value)}
                                                className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                            />
                                            <p className="text-[10px] font-bold text-slate-400 italic">Charged for every km beyond base radius.</p>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-6">
                                    <div className="space-y-3">
                                        <label className="text-sm font-bold text-slate-900">Fixed Delivery Charge (₹)</label>
                                        <div className="relative group max-w-md">
                                            <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-slate-300 group-focus-within:text-slate-900 transition-colors">₹</span>
                                            <input
                                                type="number"
                                                value={config.fixedCharge}
                                                onChange={(e) => handleInputChange('fixedCharge', e.target.value)}
                                                className="w-full pl-10 pr-5 py-3 bg-white ring-1 ring-slate-200 border-none rounded-xl text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-slate-900/10 transition-all"
                                            />
                                        </div>
                                        <p className="text-sm font-medium text-slate-400">Flat fee charged for all deliveries below threshold.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* Delivery Boy Earnings */}
                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-[32px] overflow-hidden mt-6">
                        <div className="p-4 border-b border-slate-50 bg-slate-50/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                <Zap className="h-4 w-4 text-indigo-500" />
                                Delivery Boy Earnings
                            </h3>
                            <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
                                <button
                                    onClick={() => setConfigValue('riderEarningType', 'fixed')}
                                    className={cn("px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all", config.riderEarningType === 'fixed' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400")}
                                >Fixed</button>
                                <button
                                    onClick={() => setConfigValue('riderEarningType', 'distance_based')}
                                    className={cn("px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all", config.riderEarningType === 'distance_based' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400")}
                                >Distance Based</button>
                            </div>
                        </div>
                        <div className="p-4">
                            {config.riderEarningType === 'fixed' ? (
                                <div className="space-y-6">
                                    <div className="space-y-3">
                                        <label className="text-sm font-bold text-slate-900">Fixed Amount (₹)</label>
                                        <div className="relative group max-w-md">
                                            <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-slate-300 group-focus-within:text-slate-900 transition-colors">₹</span>
                                            <input
                                                type="number"
                                                value={config.riderFixedAmount}
                                                onChange={(e) => handleInputChange('riderFixedAmount', e.target.value)}
                                                className="w-full pl-10 pr-5 py-3 bg-white ring-1 ring-slate-200 border-none rounded-xl text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-slate-900/10 transition-all"
                                            />
                                        </div>
                                        <p className="text-sm font-medium text-slate-400">Fixed flat earning paid to the delivery partner per order.</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex gap-3">
                                        <Zap className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
                                        <p className="text-[11px] font-bold text-indigo-800 leading-relaxed">
                                            Rider earnings are configured independently from customer delivery charges. Within the base distance below, the rider earns the base amount; extra km beyond that uses the per-km rate.
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base Distance (km)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.1"
                                                value={config.riderBaseDistance}
                                                onChange={(e) => handleInputChange('riderBaseDistance', e.target.value)}
                                                className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base Earning (₹)</label>
                                            <div className="relative group">
                                                <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-slate-300 group-focus-within:text-slate-900 transition-colors">₹</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    value={config.riderBaseEarning}
                                                    onChange={(e) => handleInputChange('riderBaseEarning', e.target.value)}
                                                    className="w-full pl-10 pr-5 py-3 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Extra Charge / KM (₹)</label>
                                            <div className="relative group">
                                                <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-slate-300 group-focus-within:text-slate-900 transition-colors">₹</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    value={config.riderExtraPerKm}
                                                    onChange={(e) => handleInputChange('riderExtraPerKm', e.target.value)}
                                                    className="w-full pl-10 pr-5 py-3 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default BillingCharges;
