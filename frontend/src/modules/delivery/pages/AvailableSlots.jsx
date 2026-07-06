import React, { useState, useEffect } from 'react';
import { deliveryApi } from '../services/deliveryApi';
import { toast } from 'sonner';
import { CalendarDays, Clock, CheckCircle, ChevronRight, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@core/context/AuthContext';

const AvailableSlots = () => {
    const { refreshUser } = useAuth();
    const [slots, setSlots] = useState([]);
    const [driverSlots, setDriverSlots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [bookingId, setBookingId] = useState(null);
    const [cancellingId, setCancellingId] = useState(null);
    
    // Default to today
    const [selectedDate, setSelectedDate] = useState(() => {
        const d = new Date();
        return d.toISOString().split('T')[0];
    });



    const fetchSlots = async () => {
        try {
            const [availableRes, driverRes] = await Promise.all([
                deliveryApi.getAvailableSlots(),
                deliveryApi.getDriverSlots()
            ]);
            
            if (availableRes.data.success) {
                setSlots(availableRes.data.slots);
            }
            if (driverRes.data.success) {
                setDriverSlots(driverRes.data.slots);
            }
        } catch (error) {
            toast.error('Failed to load slots');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSlots();
    }, []);

    const handleBook = async (slotId) => {
        try {
            setBookingId(slotId);
            const res = await deliveryApi.bookSlot({
                slotId,
                date: selectedDate
            });
            if (res.data.success) {
                toast.success('Slot booked successfully!');
                fetchSlots(); // Refetch to update UI with booked status
                if (res.data.isOnlineNow) {
                    refreshUser(); // Refresh user state so global online status updates
                }
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to book slot');
        } finally {
            setBookingId(null);
        }
    };

    const handleCancel = async (driverSlotId) => {
        try {
            setCancellingId(driverSlotId);
            const res = await deliveryApi.cancelUpcomingSlot(driverSlotId);
            if (res.data.success) {
                toast.success('Slot cancelled successfully!');
                fetchSlots(); // Refetch to update UI
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to cancel slot');
        } finally {
            setCancellingId(null);
        }
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50/50">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
            <p className="mt-4 text-sm font-bold text-gray-500 animate-pulse">Loading slots...</p>
        </div>
    );

    return (
        <div className="pb-20 pt-4 px-3 max-w-lg mx-auto min-h-screen mesh-gradient-light flex flex-col gap-4 relative overflow-hidden font-poppins">
            {/* Background decorations */}
            <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[30%] bg-primary/10 rounded-full blur-[100px] pointer-events-none -z-10"></div>
            <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[30%] bg-brand-500/10 rounded-full blur-[100px] pointer-events-none -z-10"></div>

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-br from-gray-900 to-gray-600 tracking-tight">Available Slots</h1>
                    <p className="text-xs font-medium text-gray-500 mt-0.5">Pick your working hours</p>
                </div>
                <div className="h-9 w-9 rounded-xl bg-white shadow-sm border border-gray-100 flex items-center justify-center">
                    <CalendarDays className="h-4 w-4 text-[#135D1F]" />
                </div>
            </div>

            {/* Date Tabs */}
            <div className="flex gap-2 bg-white/60 backdrop-blur-md p-1 rounded-xl border border-white/50 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
                <button 
                    onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                    className={`flex-1 py-2 rounded-lg font-bold text-xs transition-all duration-300 relative ${selectedDate === new Date().toISOString().split('T')[0] ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    {selectedDate === new Date().toISOString().split('T')[0] && (
                        <motion.div layoutId="tab-bg" className="absolute inset-0 bg-[#135D1F] rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.04)] -z-10 border border-[#135D1F]" />
                    )}
                    Today
                </button>
            </div>

            <div className="flex flex-col gap-3 relative z-10">
                <AnimatePresence mode="popLayout">
                    {slots.map((slot, index) => {
                        const bookedSlot = driverSlots.find(ds => 
                            ds.date === selectedDate && 
                            ds.status !== 'CANCELLED' && 
                            (ds.slotId?._id === slot._id || ds.slotId === slot._id)
                        );
                        const isBooked = !!bookedSlot;
                        const isUpcoming = bookedSlot?.status === 'UPCOMING';
                        
                        return (
                            <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05, type: "spring", stiffness: 300, damping: 25 }}
                                key={slot._id} 
                                className={`p-3.5 rounded-2xl shadow-sm border backdrop-blur-xl flex flex-row items-center justify-between gap-3 transition-all duration-300 ${isBooked ? 'bg-gray-50/80 border-gray-200' : 'bg-white/90 border-white/50 hover:shadow-md hover:-translate-y-0.5'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2.5 rounded-xl ${isBooked ? 'bg-gray-200 text-gray-500' : 'bg-primary/10 text-primary'} shadow-inner shrink-0`}>
                                        <Clock className="w-5 h-5" strokeWidth={2.5} />
                                    </div>
                                    <div className="flex flex-col">
                                        <p className={`font-black text-sm tracking-tight ${isBooked ? 'text-gray-500' : 'text-gray-900'}`}>{slot.startTime} - {slot.endTime}</p>
                                        <div className="flex items-center gap-1 mt-0.5">
                                            <Zap className={`w-3 h-3 ${isBooked ? 'text-gray-400' : 'text-amber-500'}`} />
                                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{slot.duration / 60} Hrs</p>
                                        </div>
                                    </div>
                                </div>

                                {isBooked ? (
                                    <div className="flex flex-col items-end gap-2 shrink-0">
                                        <div className="px-3 py-1.5 bg-gray-100 text-gray-500 rounded-lg font-bold shadow-inner text-xs flex items-center gap-1.5 border border-gray-200/50">
                                            <CheckCircle size={14} strokeWidth={2.5} /> Booked
                                        </div>
                                        {isUpcoming && (
                                            <button
                                                onClick={() => handleCancel(bookedSlot._id)}
                                                disabled={cancellingId === bookedSlot._id}
                                                className="text-xs text-red-500 hover:text-red-700 font-semibold underline disabled:opacity-50"
                                            >
                                                {cancellingId === bookedSlot._id ? 'Cancelling...' : 'Cancel & Change'}
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => handleBook(slot._id)}
                                        disabled={bookingId === slot._id}
                                        className="px-4 py-2 bg-[#135D1F] hover:bg-[#0e4817] text-white rounded-lg font-bold shadow-sm active:scale-95 transition-all duration-300 disabled:opacity-50 flex items-center gap-1.5 text-xs group shrink-0"
                                    >
                                        {bookingId === slot._id ? (
                                            <>
                                                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                Booking
                                            </>
                                        ) : (
                                            <>
                                                Book
                                                <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                                            </>
                                        )}
                                    </button>
                                )}
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
                
                {slots.length === 0 && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center p-6 bg-white/80 backdrop-blur-md rounded-2xl border border-gray-100 shadow-sm mt-2 flex flex-col items-center"
                    >
                        <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                            <CalendarDays className="w-6 h-6 text-gray-300" />
                        </div>
                        <p className="text-gray-900 font-bold text-sm mb-0.5">No Slots Available</p>
                        <p className="text-gray-500 font-medium text-xs">Please check back later or select another date.</p>
                    </motion.div>
                )}
            </div>
        </div>
    );
};

export default AvailableSlots;
