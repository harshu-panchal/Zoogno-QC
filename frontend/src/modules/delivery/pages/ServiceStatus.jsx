import React, { useEffect, useState } from 'react';
import { deliveryApi } from '../services/deliveryApi';
import { toast } from 'sonner';
import { Clock, MapPin } from 'lucide-react';
import CountdownTimer from '../components/CountdownTimer';
import { useNavigate } from 'react-router-dom';

const ServiceStatus = () => {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    const fetchStatus = async () => {
        try {
            const res = await deliveryApi.getDriverStatus();
            if (res.data.success) {
                setStatus(res.data);
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to fetch status');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 30000);
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return <div className="p-4 text-center mt-20">Loading status...</div>;
    }

    const { isOnline, activeSlotId, currentSlotStart, currentSlotEnd } = status || {};

    return (
        <div className="pb-24 pt-4 px-4 max-w-lg mx-auto min-h-screen bg-gray-50 flex flex-col gap-6">
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Service Status</h1>

            <div className={`p-6 rounded-3xl shadow-sm border ${isOnline ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center gap-4">
                    <div className={`w-4 h-4 rounded-full shadow-sm animate-pulse ${isOnline ? 'bg-green-500 shadow-green-500/50' : 'bg-gray-400'}`}></div>
                    <h2 className={`text-xl font-bold ${isOnline ? 'text-green-800' : 'text-gray-600'}`}>
                        {isOnline ? 'You are ONLINE' : 'You are OFFLINE'}
                    </h2>
                </div>
                
                {isOnline && activeSlotId && currentSlotEnd && (
                    <div className="mt-6 p-4 bg-white rounded-2xl shadow-sm border border-green-100 flex flex-col items-center">
                        <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Auto Offline In</p>
                        <CountdownTimer 
                            endTime={new Date(new Date().toDateString() + " " + currentSlotEnd)} 
                            onComplete={() => {
                                toast("Slot Ended! You are now offline.", { icon: "👋" });
                                fetchStatus();
                            }}
                        />
                        <p className="mt-4 text-xs text-center text-gray-500 leading-relaxed px-4">
                            You are committed to this slot ({currentSlotStart} - {currentSlotEnd}) and will automatically go offline when the slot ends.
                        </p>
                    </div>
                )}

                {!isOnline && (
                    <div className="mt-6 flex flex-col gap-3">
                        <p className="text-sm text-gray-500 leading-relaxed">
                            You are currently offline and will not receive any order assignments. Book a slot to start earning.
                        </p>
                        <button 
                            onClick={() => navigate('/delivery/slots/available')}
                            className="mt-2 w-full py-3.5 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl font-bold shadow-md shadow-brand-600/20 active:scale-[0.98] transition-all"
                        >
                            Find Available Slots
                        </button>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <button onClick={() => navigate('/delivery/slots/upcoming')} className="p-5 bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center gap-3 active:scale-[0.98] transition-transform">
                    <div className="p-3 bg-brand-50 rounded-2xl text-brand-600">
                        <Clock className="w-6 h-6" />
                    </div>
                    <span className="font-bold text-gray-700 text-sm">My Slots</span>
                </button>
                <button onClick={() => navigate('/delivery/slots/available')} className="p-5 bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center gap-3 active:scale-[0.98] transition-transform">
                    <div className="p-3 bg-blue-50 rounded-2xl text-blue-600">
                        <MapPin className="w-6 h-6" />
                    </div>
                    <span className="font-bold text-gray-700 text-sm">Book Slots</span>
                </button>
            </div>
        </div>
    );
};

export default ServiceStatus;
