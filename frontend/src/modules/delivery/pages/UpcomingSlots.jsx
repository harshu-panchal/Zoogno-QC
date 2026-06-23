import React, { useState, useEffect } from 'react';
import { deliveryApi } from '../services/deliveryApi';
import { toast } from 'sonner';
import { Clock, XCircle } from 'lucide-react';

const UpcomingSlots = () => {
    const [slots, setSlots] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchSlots = async () => {
        try {
            const res = await deliveryApi.getDriverSlots();
            if (res.data.success) {
                setSlots(res.data.slots);
            }
        } catch (error) {
            toast.error('Failed to load your slots');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSlots();
    }, []);

    const handleCancel = async (id) => {
        if (!window.confirm("Are you sure you want to cancel this slot?")) return;
        
        try {
            const res = await deliveryApi.cancelUpcomingSlot(id);
            if (res.data.success) {
                toast.success('Slot cancelled successfully');
                fetchSlots();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to cancel slot');
        }
    };

    if (loading) return <div className="p-4 text-center mt-20">Loading your slots...</div>;

    const getStatusStyle = (status) => {
        switch (status) {
            case 'ACTIVE': return 'bg-green-100 text-green-800 border-green-200';
            case 'COMPLETED': return 'bg-gray-100 text-gray-800 border-gray-200';
            case 'UPCOMING': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'CANCELLED': return 'bg-red-100 text-red-800 border-red-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    return (
        <div className="pb-24 pt-4 px-4 max-w-lg mx-auto min-h-screen bg-gray-50 flex flex-col gap-6">
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">My Slots</h1>

            <div className="flex flex-col gap-4">
                {slots.length === 0 ? (
                    <div className="text-center p-8 bg-white rounded-3xl border border-gray-100 shadow-sm mt-4">
                        <Clock className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                        <p className="text-gray-500 font-medium">You haven't booked any slots yet.</p>
                    </div>
                ) : (
                    slots.map(slot => (
                        <div key={slot._id} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex flex-col gap-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">{new Date(slot.date).toDateString()}</p>
                                    <p className="font-bold text-gray-900 text-lg">
                                        {slot.slotId?.startTime} - {slot.slotId?.endTime}
                                    </p>
                                </div>
                                <span className={`px-3 py-1 text-xs font-bold rounded-full border ${getStatusStyle(slot.status)}`}>
                                    {slot.status}
                                </span>
                            </div>
                            
                            {slot.status === 'UPCOMING' && (
                                <div className="pt-3 mt-1 border-t border-gray-100 flex justify-end">
                                    <button 
                                        onClick={() => handleCancel(slot._id)}
                                        className="flex items-center gap-1 text-sm font-bold text-red-500 hover:text-red-700 active:scale-95 transition-all"
                                    >
                                        <XCircle className="w-5 h-5" /> Cancel Slot
                                    </button>
                                </div>
                            )}
                            
                            {slot.status === 'ACTIVE' && (
                                <div className="pt-3 mt-1 border-t border-green-100">
                                    <p className="text-xs text-green-700 font-medium text-center">
                                        You are currently active in this slot.
                                    </p>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default UpcomingSlots;
