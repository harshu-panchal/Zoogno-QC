import React, { useState, useEffect } from 'react';
import { adminApi } from '../services/adminApi';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import { toast } from 'sonner';
import { Phone, MapPin, AlertCircle, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const SosAlerts = () => {
    const [alerts, setAlerts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchAlerts = async () => {
        setIsLoading(true);
        try {
            const response = await adminApi.getSosAlerts();
            setAlerts(response.data.alerts || []);
        } catch (error) {
            console.error('Fetch SOS Alerts Error:', error);
            toast.error('Failed to fetch SOS alerts');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchAlerts();
    }, []);

    const handleResolve = async (id) => {
        if (!window.confirm("Are you sure you want to resolve this SOS alert?")) return;
        
        try {
            await adminApi.resolveSosAlert(id);
            toast.success('SOS Alert marked as resolved');
            setAlerts(alerts.map(a => a._id === id ? { ...a, status: 'resolved' } : a));
        } catch (error) {
            toast.error('Failed to resolve SOS alert');
        }
    };

    return (
        <div className="ds-section-spacing animate-in fade-in duration-700">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="ds-h1 flex items-center gap-3 text-rose-600">
                        <AlertCircle className="h-8 w-8" />
                        SOS Alerts
                    </h1>
                    <p className="ds-description mt-1">Monitor and respond to emergency alerts triggered by delivery partners.</p>
                </div>
                <button onClick={fetchAlerts} className="px-4 py-2 bg-white rounded-lg shadow-sm border font-semibold text-sm">
                    Refresh
                </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {isLoading ? (
                    <div className="flex justify-center py-20">
                        <div className="h-8 w-8 border-4 border-rose-200 border-t-rose-600 rounded-full animate-spin" />
                    </div>
                ) : alerts.length === 0 ? (
                    <div className="py-20 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                        <ShieldCheck className="h-10 w-10 text-slate-300 mx-auto mb-4" />
                        <p className="text-sm font-bold text-slate-500">No SOS alerts found.</p>
                    </div>
                ) : (
                    <AnimatePresence>
                        {alerts.map((alert) => (
                            <motion.div
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                key={alert._id}
                            >
                                <Card className={`border-none shadow-sm ring-1 ${alert.status === 'active' ? 'ring-rose-500 bg-rose-50' : 'ring-slate-200 bg-white'}`}>
                                    <div className="p-3 flex flex-col md:flex-row justify-between items-center gap-4">
                                        <div className="flex-1 space-y-2">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-3">
                                                    <Badge variant={alert.status === 'active' ? 'danger' : 'neutral'} className="uppercase text-[10px] px-2 py-0.5">
                                                        {alert.status}
                                                    </Badge>
                                                    <h3 className="text-base font-bold text-slate-900 leading-none">
                                                        {alert.deliveryBoy?.name || 'Unknown Rider'}
                                                    </h3>
                                                    <a href={`tel:${alert.deliveryBoy?.phone}`} className="text-xs font-semibold text-slate-600 flex items-center gap-1 hover:text-brand-600 bg-slate-100 px-2 py-0.5 rounded">
                                                        <Phone className="h-3 w-3" />
                                                        {alert.deliveryBoy?.phone || 'N/A'}
                                                    </a>
                                                    <span className="text-[10px] text-slate-400 font-medium ml-2">
                                                        {new Date(alert.createdAt).toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase">Contacts:</span>
                                                    {alert.deliveryBoy?.emergencyContacts && alert.deliveryBoy.emergencyContacts.length > 0 ? (
                                                        <div className="flex gap-2">
                                                            {alert.deliveryBoy.emergencyContacts.map((contact, idx) => (
                                                                <div key={idx} className="bg-white px-2 py-0.5 rounded border flex items-center gap-1 shadow-sm">
                                                                    <span className="text-[10px] font-bold text-slate-700">{contact.name}</span>
                                                                    <a href={`tel:${contact.phone}`} className="text-[10px] font-bold text-rose-600 hover:underline">{contact.phone}</a>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-slate-500">None</span>
                                                    )}
                                                </div>

                                                <div className="flex items-center">
                                                    {alert.location?.coordinates?.length === 2 && (alert.location.coordinates[0] !== 0 || alert.location.coordinates[1] !== 0) ? (
                                                        <a 
                                                            href={`https://www.google.com/maps/search/?api=1&query=${alert.location.coordinates[1]},${alert.location.coordinates[0]}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center gap-1 text-[11px] text-rose-600 font-bold hover:underline bg-rose-50 px-2 py-1 rounded border border-rose-100"
                                                        >
                                                            <MapPin className="h-3 w-3" />
                                                            Live Map
                                                        </a>
                                                    ) : (
                                                        <div className="flex items-center gap-1 text-[11px] text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-200">
                                                            <MapPin className="h-3 w-3" />
                                                            No Location
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex-shrink-0">
                                            {alert.status === 'active' ? (
                                                <button
                                                    onClick={() => handleResolve(alert._id)}
                                                    className="px-4 py-1.5 bg-rose-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-rose-700 transition-all flex items-center gap-1.5 whitespace-nowrap"
                                                >
                                                    <CheckCircle className="h-4 w-4" />
                                                    Resolve
                                                </button>
                                            ) : (
                                                <div className="px-4 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-sm font-bold flex items-center gap-1.5 border whitespace-nowrap">
                                                    <CheckCircle className="h-4 w-4" />
                                                    Resolved
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </Card>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                )}
            </div>
        </div>
    );
};

export default SosAlerts;
