import React, { useEffect, useRef, useState } from 'react';
import Card from '@shared/components/ui/Card';
import {
    Save,
    Settings,
    Globe,
    Building2,
    Share2,
    Smartphone,
    Search,
    Upload,
    Mail,
    Phone,
    MapPin,
    CreditCard,
    Facebook,
    Twitter,
    Instagram,
    Linkedin,
    Youtube,
    Loader2,
    X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@shared/components/ui/Toast';
import { adminApi } from '../services/adminApi';
import { useSettings } from '@core/context/SettingsContext';

const AdminSettings = () => {
    const normalizeProductApprovalConfig = (raw) => {
        const config = raw?.productApproval || raw || {};
        return {
            sellerCreateRequiresApproval: Boolean(config.sellerCreateRequiresApproval),
            sellerEditRequiresApproval: Boolean(config.sellerEditRequiresApproval),
        };
    };

    const { refetch } = useSettings();
    const { showToast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('general');
    const [logoUploading, setLogoUploading] = useState(false);
    const [faviconUploading, setFaviconUploading] = useState(false);
    const [signatureUploading, setSignatureUploading] = useState(false);
    const logoInputRef = useRef(null);
    const faviconInputRef = useRef(null);
    const signatureInputRef = useRef(null);

    const [settings, setSettings] = useState({
        appName: '',
        supportEmail: '',
        supportPhone: '',
        currencySymbol: '₹',
        currencyCode: 'INR',
        timezone: 'Asia/Kolkata',
        logoUrl: '',
        faviconUrl: '',
        signatureUrl: '',
        primaryColor: 'var(--primary)',
        secondaryColor: '#64748b',
        companyName: '',
        taxId: '',
        address: '',
        facebook: '',
        twitter: '',
        instagram: '',
        linkedin: '',
        youtube: '',
        playStoreLink: '',
        appStoreLink: '',
        metaTitle: '',
        metaDescription: '',
        metaKeywords: '',
        keywords: [],
        returnDeliveryCommission: 0,
        returnWindowMinutes: 180,
        lowStockAlertsEnabled: true,
        productApproval: {
            sellerCreateRequiresApproval: false,
            sellerEditRequiresApproval: false,
        },
        otpProvider: 'smsIndiaHub',
        hsnCodes: {
            delivery: '996813',
            handling: '996711',
            surge: '999999'
        },
    });

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await adminApi.getSettings();
                const data = res.data?.result ?? res.data;
                if (data) {
                    setSettings(prev => ({
                        ...prev,
                        ...data,
                        productApproval: normalizeProductApprovalConfig(data || {}),
                        keywords: Array.isArray(data.keywords) ? data.keywords : (data.metaKeywords ? data.metaKeywords.split(',').map(k => k.trim()).filter(Boolean) : []),
                        returnDeliveryCommission: data.returnDeliveryCommission ?? 0,
                        returnWindowMinutes: data.returnWindowMinutes ?? 180,
                        otpProvider: data.otpProvider ?? 'smsIndiaHub',
                        hsnCodes: {
                            delivery: data.hsnCodes?.delivery || '996813',
                            handling: data.hsnCodes?.handling || '996711',
                            surge: data.hsnCodes?.surge || '999999'
                        }
                    }));
                }
            } catch (error) {
                console.error("Failed to load settings", error);
                showToast('Failed to load settings', 'error');
            } finally {
                setIsLoading(false);
            }
        };
        fetchSettings();
    }, [showToast]);

    const handleSave = async () => {
        try {
            setIsSaving(true);
            const payload = {
                ...settings,
                keywords: Array.isArray(settings.keywords) ? settings.keywords : (settings.metaKeywords ? settings.metaKeywords.split(',').map(k => k.trim()).filter(Boolean) : []),
            };
            const res = await adminApi.updateSettings(payload);
            const updatedData = res.data?.result ?? res.data;
            
            if (updatedData) {
                setSettings(prev => ({
                    ...prev,
                    ...updatedData,
                    productApproval: normalizeProductApprovalConfig(updatedData),
                }));
            }
            await refetch({ forceRefresh: true });
            showToast('Settings updated successfully', 'success');
        } catch (error) {
            console.error("Failed to update settings", error);
            showToast('Failed to update settings', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleInputChange = (field, value) => {
        setSettings(prev => ({ ...prev, [field]: value }));
    };

    const handleHsnChange = (field, value) => {
        setSettings(prev => ({
            ...prev,
            hsnCodes: {
                ...(prev.hsnCodes || {}),
                [field]: value
            }
        }));
    };

    const handleProductApprovalToggle = (field) => {
        setSettings((prev) => ({
            ...prev,
            productApproval: {
                ...(prev.productApproval || {}),
                [field]: !Boolean(prev.productApproval?.[field]),
            },
        }));
    };

    const performUpload = async (file, type, setUploading) => {
        if (!file.type.startsWith('image/')) {
            showToast('Please select an image file', 'error');
            return;
        }
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('image', file);
            const res = await adminApi.uploadSettingsImage(fd, type);
            const url = res.data?.result?.url || res.data?.url;
            if (url) {
                const stateField = type === 'logo' ? 'logoUrl' : type === 'favicon' ? 'faviconUrl' : 'signatureUrl';
                handleInputChange(stateField, url);
                showToast(`${type} uploaded. Click Save Changes to apply.`, 'success');
            } else throw new Error('No URL returned');
        } catch (err) {
            console.error(err);
            showToast(err.response?.data?.message || `Failed to upload ${type}`, 'error');
        } finally {
            setUploading(false);
        }
    };

    const triggerImageUpload = async (type, inputRef, setUploading) => {
        if (window.flutter_inappwebview?.callHandler) {
            try {
                const result = await window.flutter_inappwebview.callHandler('openCamera');
                if (result && result.success) {
                    const byteString = atob(result.base64);
                    const ab = new ArrayBuffer(byteString.length);
                    const ia = new Uint8Array(ab);
                    for (let i = 0; i < byteString.length; i++) {
                        ia[i] = byteString.charCodeAt(i);
                    }
                    const file = new File([ab], result.fileName || 'camera_image.jpg', { type: result.mimeType || 'image/jpeg' });
                    await performUpload(file, type, setUploading);
                }
            } catch (err) {
                console.error("Flutter bridge error", err);
                inputRef.current?.click();
            }
        } else {
            inputRef.current?.click();
        }
    };

    const handleLogoUpload = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            performUpload(file, 'logo', setLogoUploading);
            e.target.value = '';
        }
    };

    const handleFaviconUpload = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            performUpload(file, 'favicon', setFaviconUploading);
            e.target.value = '';
        }
    };

    const handleSignatureUpload = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            performUpload(file, 'signature', setSignatureUploading);
            e.target.value = '';
        }
    };

    const tabs = [
        { id: 'general', label: 'General', icon: Settings },
        { id: 'branding', label: 'Branding', icon: Globe },
        { id: 'legal', label: 'Legal & Contact', icon: Building2 },
        { id: 'social', label: 'Social & Apps', icon: Share2 },
        { id: 'seo', label: 'SEO & Meta', icon: Search },
    ];

    return (
        <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
            {/* Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-1">
                <div>
                    <h1 className="ds-h1 flex items-center gap-3">
                        Platform Settings
                        <div className="p-2 bg-slate-100 rounded-xl">
                            <Settings className="h-5 w-5 text-brand-600" />
                        </div>
                    </h1>
                    <p className="ds-description mt-1">Manage global configurations, branding, and legal information.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className={cn(
                            "flex items-center gap-2 px-6 py-3 bg-black text-primary-foreground rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-brand-200 hover:shadow-brand-300 active:scale-95 active:shadow-inner",
                            isSaving ? "opacity-70 cursor-wait" : "hover:bg-brand-700"
                        )}
                    >
                        {isSaving ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <Save className="h-5 w-5" />
                        )}
                        {isSaving ? 'Updating...' : 'Save All Changes'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Sidebar Navigation */}
                <div className="lg:col-span-3 space-y-2">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left",
                                activeTab === tab.id
                                    ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200 shadow-sm"
                                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                            )}
                        >
                            <tab.icon className={cn("h-4 w-4", activeTab === tab.id ? "text-brand-600" : "text-slate-400")} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content Area */}
                <div className="lg:col-span-9 space-y-6">

                    {isLoading && (
                        <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-xl overflow-hidden">
                            <div className="p-5 flex items-center justify-center">
                                <div className="h-8 w-8 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
                            </div>
                        </Card>
                    )}

                    {/* General Settings */}
                    {activeTab === 'general' && (
                        <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-xl overflow-hidden">
                            <div className="p-4 border-b border-slate-50 bg-slate-50/30">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                    General Information
                                </h3>
                            </div>
                            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">App Name</label>
                                    <input
                                        type="text"
                                        value={settings.appName}
                                        onChange={(e) => handleInputChange('appName', e.target.value)}
                                        className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                    />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Support Email</label>
                                    <div className="relative group">
                                        <Mail className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                                        <input
                                            type="email"
                                            value={settings.supportEmail}
                                            onChange={(e) => handleInputChange('supportEmail', e.target.value)}
                                            className="w-full pl-12 pr-5 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Support Phone</label>
                                    <div className="relative group">
                                        <Phone className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
                                        <input
                                            type="text"
                                            value={settings.supportPhone}
                                            onChange={(e) => handleInputChange('supportPhone', e.target.value)}
                                            className="w-full pl-12 pr-5 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Currency Symbol</label>
                                    <input
                                        type="text"
                                        value={settings.currencySymbol}
                                        onChange={(e) => handleInputChange('currencySymbol', e.target.value)}
                                        className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                    />
                                </div>
                                <div className="md:col-span-2 rounded-2xl bg-slate-50 border border-slate-200 px-5 py-3 flex items-center justify-between gap-4">
                                    <div>
                                        <p className="text-sm font-black text-slate-900">Auto Low Stock Alerts</p>
                                        <p className="text-xs font-bold text-slate-500 mt-1">
                                            Automatically notify sellers when any product stock drops to its low-stock threshold.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={settings.lowStockAlertsEnabled}
                                        onClick={() => handleInputChange('lowStockAlertsEnabled', !settings.lowStockAlertsEnabled)}
                                        className={cn(
                                            "relative inline-flex h-7 w-10 items-center rounded-full transition-colors duration-200",
                                            settings.lowStockAlertsEnabled ? "bg-emerald-500" : "bg-slate-300"
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                "inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform duration-200",
                                                settings.lowStockAlertsEnabled ? "translate-x-7" : "translate-x-1"
                                            )}
                                        />
                                    </button>
                                </div>
                                <div className="md:col-span-2 rounded-2xl bg-slate-50 border border-slate-200 px-5 py-3 flex items-center justify-between gap-4">
                                    <div>
                                        <p className="text-sm font-black text-slate-900">Require approval for new seller products</p>
                                        <p className="text-xs font-bold text-slate-500 mt-1">
                                            When enabled, newly added seller products remain hidden until approved by admin.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={Boolean(settings.productApproval?.sellerCreateRequiresApproval)}
                                        onClick={() => handleProductApprovalToggle('sellerCreateRequiresApproval')}
                                        className={cn(
                                            "relative inline-flex h-7 w-10 items-center rounded-full transition-colors duration-200",
                                            settings.productApproval?.sellerCreateRequiresApproval ? "bg-emerald-500" : "bg-slate-300"
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                "inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform duration-200",
                                                settings.productApproval?.sellerCreateRequiresApproval ? "translate-x-7" : "translate-x-1"
                                            )}
                                        />
                                    </button>
                                </div>
                                <div className="md:col-span-2 rounded-2xl bg-slate-50 border border-slate-200 px-5 py-3 flex items-center justify-between gap-4">
                                    <div>
                                        <p className="text-sm font-black text-slate-900">Require approval for seller product edits</p>
                                        <p className="text-xs font-bold text-slate-500 mt-1">
                                            When enabled, seller changes to existing products remain hidden until approved by admin.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={Boolean(settings.productApproval?.sellerEditRequiresApproval)}
                                        onClick={() => handleProductApprovalToggle('sellerEditRequiresApproval')}
                                        className={cn(
                                            "relative inline-flex h-7 w-10 items-center rounded-full transition-colors duration-200",
                                            settings.productApproval?.sellerEditRequiresApproval ? "bg-emerald-500" : "bg-slate-300"
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                "inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform duration-200",
                                                settings.productApproval?.sellerEditRequiresApproval ? "translate-x-7" : "translate-x-1"
                                            )}
                                        />
                                    </button>
                                </div>
                                <div className="md:col-span-2 rounded-2xl bg-slate-50 border border-slate-200 px-5 py-3 flex items-center justify-between gap-4">
                                    <div className="flex-1">
                                        <p className="text-sm font-black text-slate-900">Return Window Duration</p>
                                        <p className="text-xs font-bold text-slate-500 mt-1">
                                            The maximum time after delivery that a customer can request a return.
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                min="0"
                                                value={settings.returnWindowMinutes}
                                                onChange={(e) => handleInputChange('returnWindowMinutes', parseInt(e.target.value) || 0)}
                                                className="w-24 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all text-center"
                                            />
                                            <span className="text-sm font-bold text-slate-600">Minutes</span>
                                        </div>
                                        {settings.returnWindowMinutes > 0 && (
                                            <span className="text-[10px] font-black text-brand-600 uppercase tracking-widest bg-brand-50 px-2 py-1 rounded-md">
                                                ≈ {(settings.returnWindowMinutes / 60).toFixed(1).replace(/\.0$/, '')} Hours
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="md:col-span-2 rounded-2xl bg-slate-50 border border-slate-200 px-5 py-3 flex items-center justify-between gap-4">
                                    <div className="flex-1">
                                        <p className="text-sm font-black text-slate-900">OTP Provider</p>
                                        <p className="text-xs font-bold text-slate-500 mt-1">
                                            Choose the provider for sending OTPs to customers.
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <select
                                            value={settings.otpProvider}
                                            onChange={(e) => handleInputChange('otpProvider', e.target.value)}
                                            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                        >
                                            <option value="smsIndiaHub">SMS India Hub</option>
                                            <option value="firebase">Firebase (Phone OTP)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    )}

                    {/* Branding Settings */}
                    {activeTab === 'branding' && (
                        <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-xl overflow-hidden">
                            <div className="p-4 border-b border-slate-50 bg-slate-50/30">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                    Visual Identity
                                </h3>
                            </div>
                            <div className="p-5 space-y-8">
                                <input type="file" ref={logoInputRef} accept="image/*" className="hidden" onChange={handleLogoUpload} />
                                <input type="file" ref={faviconInputRef} accept="image/*" className="hidden" onChange={handleFaviconUpload} />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">App Logo</label>
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => !logoUploading && triggerImageUpload('logo', logoInputRef, setLogoUploading)}
                                            onKeyDown={(e) => e.key === 'Enter' && !logoUploading && triggerImageUpload('logo', logoInputRef, setLogoUploading)}
                                            className={cn(
                                                "h-40 w-full rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all group overflow-hidden",
                                                settings.logoUrl ? "border-slate-200 bg-slate-50/50" : "border-slate-200 hover:border-brand-500/50 hover:bg-brand-50/10 cursor-pointer"
                                            )}
                                        >
                                            {logoUploading ? (
                                                <Loader2 className="h-10 w-10 text-brand-600 animate-spin" />
                                            ) : settings.logoUrl ? (
                                                <>
                                                    <img src={settings.logoUrl} alt="App logo" className="max-h-24 w-auto object-contain" />
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-bold text-slate-500">Click to replace</span>
                                                        <button type="button" onClick={(e) => { e.stopPropagation(); handleInputChange('logoUrl', ''); }} className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-600" title="Remove logo"><X className="h-4 w-4" /></button>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                                                        <Upload className="h-5 w-5 text-indigo-500 group-hover:text-brand-600" />
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-400 group-hover:text-brand-600">Click to upload logo</span>
                                                </>
                                            )}
                                        </div>
                                        <input type="url" value={settings.logoUrl} onChange={(e) => handleInputChange('logoUrl', e.target.value)} placeholder="Or paste logo URL" className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-brand-500/20" />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Favicon</label>
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => !faviconUploading && triggerImageUpload('favicon', faviconInputRef, setFaviconUploading)}
                                            onKeyDown={(e) => e.key === 'Enter' && !faviconUploading && triggerImageUpload('favicon', faviconInputRef, setFaviconUploading)}
                                            className={cn(
                                                "h-40 w-full rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all group overflow-hidden",
                                                settings.faviconUrl ? "border-slate-200 bg-slate-50/50" : "border-slate-200 hover:border-brand-500/50 hover:bg-brand-50/10 cursor-pointer"
                                            )}
                                        >
                                            {faviconUploading ? (
                                                <Loader2 className="h-10 w-10 text-brand-600 animate-spin" />
                                            ) : settings.faviconUrl ? (
                                                <>
                                                    <img src={settings.faviconUrl} alt="Favicon" className="max-h-16 w-auto object-contain" />
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-bold text-slate-500">Click to replace</span>
                                                        <button type="button" onClick={(e) => { e.stopPropagation(); handleInputChange('faviconUrl', ''); }} className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-600" title="Remove favicon"><X className="h-4 w-4" /></button>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                                                        <Upload className="h-5 w-5 text-indigo-500 group-hover:text-brand-600" />
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-400 group-hover:text-brand-600">Click to upload favicon</span>
                                                </>
                                            )}
                                        </div>
                                        <input type="url" value={settings.faviconUrl} onChange={(e) => handleInputChange('faviconUrl', e.target.value)} placeholder="Or paste favicon URL" className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-brand-500/20" />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Primary Brand Color</label>
                                    <div className="flex items-center gap-4">
                                        <input
                                            type="color"
                                            value={settings.primaryColor}
                                            onChange={(e) => handleInputChange('primaryColor', e.target.value)}
                                            className="h-10 w-24 rounded-lg cursor-pointer bg-transparent"
                                        />
                                        <input
                                            type="text"
                                            value={settings.primaryColor}
                                            onChange={(e) => handleInputChange('primaryColor', e.target.value)}
                                            className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all font-mono"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Secondary Brand Color</label>
                                    <div className="flex items-center gap-4">
                                        <input
                                            type="color"
                                            value={settings.secondaryColor}
                                            onChange={(e) => handleInputChange('secondaryColor', e.target.value)}
                                            className="h-10 w-24 rounded-lg cursor-pointer bg-transparent"
                                        />
                                        <input
                                            type="text"
                                            value={settings.secondaryColor}
                                            onChange={(e) => handleInputChange('secondaryColor', e.target.value)}
                                            className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all font-mono"
                                        />
                                    </div>
                                </div>
                            </div>
                        </Card>
                    )}

                    {/* Legal Settings */}
                    {activeTab === 'legal' && (
                        <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-xl overflow-hidden">
                            <div className="p-4 border-b border-slate-50 bg-slate-50/30">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                    Legal Entity & Contact
                                </h3>
                            </div>
                            <div className="p-5 grid grid-cols-1 gap-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Company Legal Name</label>
                                        <input
                                            type="text"
                                            value={settings.companyName}
                                            onChange={(e) => handleInputChange('companyName', e.target.value)}
                                            className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tax ID / GSTIN / VAT</label>
                                        <div className="relative group">
                                            <CreditCard className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-500" />
                                            <input
                                                type="text"
                                                value={settings.taxId}
                                                onChange={(e) => handleInputChange('taxId', e.target.value)}
                                                className="w-full pl-12 pr-5 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Registered Office Address</label>
                                    <div className="relative group">
                                        <MapPin className="absolute left-5 top-6 h-4 w-4 text-amber-500" />
                                        <textarea
                                            rows={3}
                                            value={settings.address}
                                            onChange={(e) => handleInputChange('address', e.target.value)}
                                            className="w-full pl-12 pr-5 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all resize-none"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-3 border-t border-slate-100 pt-5 mt-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Authorized Signatory (For Invoice)</label>
                                    <input type="file" ref={signatureInputRef} accept="image/*" className="hidden" onChange={handleSignatureUpload} />
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => !signatureUploading && triggerImageUpload('signature', signatureInputRef, setSignatureUploading)}
                                        onKeyDown={(e) => e.key === 'Enter' && !signatureUploading && triggerImageUpload('signature', signatureInputRef, setSignatureUploading)}
                                        className={cn(
                                            "h-40 w-full max-w-sm rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all group overflow-hidden",
                                            settings.signatureUrl ? "border-slate-200 bg-slate-50/50" : "border-slate-200 hover:border-brand-500/50 hover:bg-brand-50/10 cursor-pointer"
                                        )}
                                    >
                                        {signatureUploading ? (
                                            <Loader2 className="h-10 w-10 text-brand-600 animate-spin" />
                                        ) : settings.signatureUrl ? (
                                            <>
                                                <img src={settings.signatureUrl} alt="Signature" className="max-h-24 w-auto object-contain" />
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-slate-500">Click to replace</span>
                                                    <button type="button" onClick={(e) => { e.stopPropagation(); handleInputChange('signatureUrl', ''); }} className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-600" title="Remove signature"><X className="h-4 w-4" /></button>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                                                    <Upload className="h-5 w-5 text-indigo-500 group-hover:text-brand-600" />
                                                </div>
                                                <span className="text-xs font-bold text-slate-400 group-hover:text-brand-600">Click to upload signature</span>
                                            </>
                                        )}
                                    </div>
                                    <input type="url" value={settings.signatureUrl} onChange={(e) => handleInputChange('signatureUrl', e.target.value)} placeholder="Or paste signature URL" className="w-full max-w-sm px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-brand-500/20" />
                                </div>

                                {/* HSN Codes Configuration */}
                                <div className="space-y-4 border-t border-slate-100 pt-5 mt-2">
                                    <h4 className="text-sm font-black text-slate-900">Service Accounting Codes (HSN/SAC)</h4>
                                    <p className="text-xs font-bold text-slate-500">Configure standard HSN/SAC codes for additional fees mapped on customer and platform invoices.</p>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Delivery Fee HSN</label>
                                            <input
                                                type="text"
                                                value={settings?.hsnCodes?.delivery || ''}
                                                onChange={(e) => handleHsnChange('delivery', e.target.value)}
                                                className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                                placeholder="e.g. 996813"
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Handling Fee HSN</label>
                                            <input
                                                type="text"
                                                value={settings?.hsnCodes?.handling || ''}
                                                onChange={(e) => handleHsnChange('handling', e.target.value)}
                                                className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                                placeholder="e.g. 996711"
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Surge Charge HSN</label>
                                            <input
                                                type="text"
                                                value={settings?.hsnCodes?.surge || ''}
                                                onChange={(e) => handleHsnChange('surge', e.target.value)}
                                                className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                                placeholder="e.g. 999999"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Return delivery commission input moved to Fees & Charges → Delivery Fee Settings */}
                            </div>
                        </Card>
                    )}

                    {/* Social & Apps */}
                    {activeTab === 'social' && (
                        <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-xl overflow-hidden">
                            <div className="p-4 border-b border-slate-50 bg-slate-50/30">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                    Social Media & App Links
                                </h3>
                            </div>
                            <div className="p-5 space-y-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Facebook URL</label>
                                        <div className="relative group">
                                            <Facebook className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-600" />
                                            <input
                                                type="url"
                                                value={settings.facebook}
                                                onChange={(e) => handleInputChange('facebook', e.target.value)}
                                                className="w-full pl-12 pr-5 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Twitter / X URL</label>
                                        <div className="relative group">
                                            <Twitter className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-500" />
                                            <input
                                                type="url"
                                                value={settings.twitter}
                                                onChange={(e) => handleInputChange('twitter', e.target.value)}
                                                className="w-full pl-12 pr-5 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Instagram URL</label>
                                        <div className="relative group">
                                            <Instagram className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-pink-600" />
                                            <input
                                                type="url"
                                                value={settings.instagram}
                                                onChange={(e) => handleInputChange('instagram', e.target.value)}
                                                className="w-full pl-12 pr-5 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">YouTube URL</label>
                                        <div className="relative group">
                                            <Youtube className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-red-600" />
                                            <input
                                                type="url"
                                                value={settings.youtube}
                                                onChange={(e) => handleInputChange('youtube', e.target.value)}
                                                className="w-full pl-12 pr-5 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="pt-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Play Store Link (Android)</label>
                                        <div className="relative group">
                                            <Smartphone className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-600" />
                                            <input
                                                type="url"
                                                value={settings.playStoreLink}
                                                onChange={(e) => handleInputChange('playStoreLink', e.target.value)}
                                                className="w-full pl-12 pr-5 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">App Store Link (iOS)</label>
                                        <div className="relative group">
                                            <Smartphone className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-800" />
                                            <input
                                                type="url"
                                                value={settings.appStoreLink}
                                                onChange={(e) => handleInputChange('appStoreLink', e.target.value)}
                                                className="w-full pl-12 pr-5 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    )}

                    {/* SEO Settings */}
                    {activeTab === 'seo' && (
                        <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-xl overflow-hidden">
                            <div className="p-4 border-b border-slate-50 bg-slate-50/30">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                    SEO & Meta Information
                                </h3>
                            </div>
                            <div className="p-5 space-y-6">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Default Meta Title</label>
                                    <input
                                        type="text"
                                        value={settings.metaTitle}
                                        onChange={(e) => handleInputChange('metaTitle', e.target.value)}
                                        className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                    />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Default Meta Description</label>
                                    <textarea
                                        rows={3}
                                        value={settings.metaDescription}
                                        onChange={(e) => handleInputChange('metaDescription', e.target.value)}
                                        className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all resize-none"
                                    />
                                    <p className="text-[10px] font-bold text-slate-400 italic text-right">Recommended length: 150-160 characters</p>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Meta Keywords</label>
                                    <input
                                        type="text"
                                        value={settings.metaKeywords}
                                        onChange={(e) => handleInputChange('metaKeywords', e.target.value)}
                                        className="w-full px-5 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                        placeholder="keyword1, keyword2, keyword3"
                                    />
                                    <p className="text-[10px] font-bold text-slate-400 italic text-right">Separate keywords with commas</p>
                                </div>
                            </div>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminSettings;

