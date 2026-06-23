import React, { useState, useEffect } from 'react';
import { adminApi } from '../services/adminApi';
import { toast } from 'sonner';

const OnlineDrivers = () => {
    const [drivers, setDrivers] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchDrivers = async () => {
        try {
            const res = await adminApi.getOnlineDrivers();
            if (res.data.success) {
                setDrivers(res.data.data);
            }
        } catch (error) {
            toast.error('Failed to fetch online drivers');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDrivers();
        const interval = setInterval(fetchDrivers, 30000);
        return () => clearInterval(interval);
    }, []);

    const forceOffline = async (deliveryId) => {
        if (!window.confirm("Force this driver offline immediately?")) return;
        try {
            const res = await adminApi.forceOfflineDriver(deliveryId);
            if (res.data.success) {
                toast.success('Driver forced offline');
                fetchDrivers();
            }
        } catch (error) {
            toast.error('Failed to force offline');
        }
    };

    return (
        <div className="p-6 max-w-6xl mx-auto min-h-screen bg-gray-50 flex flex-col gap-6">
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Live Online Drivers</h1>

            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">Loading...</div>
                ) : (
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 text-gray-600 text-sm border-b">
                                <th className="p-4 font-bold">Driver Name</th>
                                <th className="p-4 font-bold">Phone</th>
                                <th className="p-4 font-bold">Current Slot</th>
                                <th className="p-4 font-bold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {drivers.map(status => (
                                <tr key={status._id} className="border-b last:border-0 hover:bg-gray-50/50">
                                    <td className="p-4 font-bold text-gray-900 flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-green-500 shadow-sm shadow-green-500/50 animate-pulse"></div>
                                        {status.deliveryId?.name || 'Unknown'}
                                    </td>
                                    <td className="p-4 text-gray-600">{status.deliveryId?.phone || 'N/A'}</td>
                                    <td className="p-4 font-mono text-sm text-brand-700 bg-brand-50 rounded-lg inline-block my-2 px-2 py-1">
                                        {status.currentSlotStart} - {status.currentSlotEnd}
                                    </td>
                                    <td className="p-4 text-right">
                                        <button 
                                            onClick={() => forceOffline(status.deliveryId?._id)} 
                                            className="px-4 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg font-bold text-sm transition-colors"
                                        >
                                            Force Offline
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {drivers.length === 0 && (
                                <tr><td colSpan="4" className="p-8 text-center text-gray-500">No drivers are currently online.</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default OnlineDrivers;
